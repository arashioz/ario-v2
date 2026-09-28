import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Invoice, InvoiceDocument } from '../invoices/schemas/invoice.schema';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import {
  CustomerTransaction,
  CustomerTransactionDocument,
} from '../customers/schemas/customer-transaction.schema';
import { AuditService } from '../audit/audit.service';
import { runFifo, dayKey, purchaseFreight } from './fifo';
import type { FifoInvoice, FifoProduct, FifoResult, SaleLine } from './fifo';

export interface Period {
  from?: string;
  to?: string;
}

/**
 * How the new sell price is derived from the base cost:
 * - `list`: روش دوم — قیمت فروش فعلی به همان نسبتی بالا می‌رود که بهای پایه از زمان قیمت‌گذاری بالا رفته
 * - `recent`: روش اول — ضریب سود همیشگی (درصد سود فروش‌های اخیر روی بهای جایگزینی روز فروش)
 * - `custom`: روش اول — درصد سود هدف دلخواه
 */
export type SuggestMode = 'list' | 'recent' | 'custom';
export const SUGGEST_MODES: SuggestMode[] = ['list', 'recent', 'custom'];

/** `replacement`: آخرین بهای تمام‌شده خرید (توصیه‌شده در تورم). `average`: میانگین موزون موجودی انبار. */
export type CostBasis = 'replacement' | 'average';
export const COST_BASES: CostBasis[] = ['replacement', 'average'];

export interface SuggestOptions {
  mode?: SuggestMode;
  markup?: number;
  basis?: CostBasis;
  /** Expected monthly inflation (%) for the inflation buffer. */
  monthlyInflation?: number;
  /** Holding period override in days; otherwise measured per product from how long sold goods sat in stock. */
  holdDays?: number;
  recentDays?: number;
  productIds?: string[];
}

const PRICE_TIERS = ['retail', 'supermarket', 'wholesale'] as const;
type PriceTier = (typeof PRICE_TIERS)[number];

const r0 = (n: number) => Math.round(n);
const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 10000) / 100 : 0);

/** A sale line is suspicious if it sold below cost or at an unusually high margin (likely a typo). */
/** Lines outside [minMargin, maxMargin] are listed; beyond errorMargin they are almost surely entry mistakes. */
const SUSPICIOUS = { minMargin: -0.5, maxMargin: 25, errorMargin: -20 };

const DEFAULT_MARKUP = 8;
/** Sales from this many days back measure how long goods sit in stock. */
const HOLD_WINDOW_DAYS = 90;
const MAX_HOLD_DAYS = 180;

@Injectable()
export class AccountingService {
  private cache: { key: string; result: FifoResult } | null = null;

  constructor(
    @InjectModel(Invoice.name) private invoiceModel: Model<InvoiceDocument>,
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    @InjectModel(CustomerTransaction.name) private txModel: Model<CustomerTransactionDocument>,
    private readonly audit: AuditService,
  ) {}

  /** FIFO over all invoices, cached until any invoice or product changes. */
  async fifo(): Promise<FifoResult> {
    const [count, lastInv, lastProd] = await Promise.all([
      this.invoiceModel.countDocuments(),
      this.invoiceModel.findOne().sort({ updatedAt: -1 }).select('updatedAt').lean(),
      this.productModel.findOne().sort({ updatedAt: -1 }).select('updatedAt').lean(),
    ]);
    const key = `${count}|${(lastInv as any)?.updatedAt?.getTime?.() ?? 0}|${(lastProd as any)?.updatedAt?.getTime?.() ?? 0}`;
    if (this.cache?.key === key) return this.cache.result;

    const [invoices, products] = await Promise.all([
      this.invoiceModel
        .find()
        .select('invoiceNumber type invoiceDate createdAt customerId customerName totalAmount discount finalAmount creditAmount remainingDebt legacyPayments shippingPayer shippingCost items')
        .lean(),
      this.productModel.find().select('name unit weightPerUnitKg buyPrice stock').lean(),
    ]);
    const result = runFifo(
      invoices.map((i: any) => ({ ...i, _id: String(i._id), customerId: i.customerId ? String(i.customerId) : null })) as FifoInvoice[],
      products.map((p: any) => ({ ...p, _id: String(p._id) })) as FifoProduct[],
    );
    this.cache = { key, result };
    return result;
  }

  /** `from`/`to` are inclusive YYYY-MM-DD days on the Tehran calendar. */
  private inPeriod(date: Date, p: Period) {
    if (!p.from && !p.to) return true;
    const k = dayKey(date);
    if (p.from && k < p.from.slice(0, 10)) return false;
    if (p.to && k > p.to.slice(0, 10)) return false;
    return true;
  }

  private summarize(lines: SaleLine[]) {
    const revenue = lines.reduce((s, l) => s + l.revenue, 0);
    const cost = lines.reduce((s, l) => s + l.cost, 0);
    const kg = lines.reduce((s, l) => s + l.kg, 0);
    const profit = revenue - cost;
    return {
      revenue: r0(revenue),
      cost: r0(cost),
      profit: r0(profit),
      kg: r1(kg),
      tons: Math.round(kg) / 1000,
      marginPercent: pct(profit, revenue), // سود / فروش
      markupPercent: pct(profit, cost), // سود / بهای خرید
      profitPerKg: kg ? r0(profit / kg) : 0,
      avgSellPerKg: kg ? r0(revenue / kg) : 0,
      avgCostPerKg: kg ? r0(cost / kg) : 0,
    };
  }

  /**
   * Payments received on `day` toward credit invoices that were sold on an earlier day.
   * Same sources as the credit report (allocations + legacy payments).
   */
  private async collectedPriorOn(day: string, invoices: FifoInvoice[]) {
    const creditInvoices = invoices.filter((i) => i.type === 'sale' && (i.creditAmount ?? 0) > 0);
    const byId = new Map(creditInvoices.map((i) => [String(i._id), i]));
    const payments = await this.txModel
      .find({ type: 'payment', 'allocations.0': { $exists: true } })
      .select('date allocations')
      .lean();

    let sum = 0;
    for (const p of payments) {
      if (dayKey(p.date) !== day) continue;
      for (const a of p.allocations ?? []) {
        const inv = byId.get(String(a.invoiceId));
        if (!inv || dayKey(inv.invoiceDate) >= day) continue;
        sum += a.amount || 0;
      }
    }
    for (const inv of creditInvoices) {
      if (dayKey(inv.invoiceDate) >= day) continue;
      for (const lp of inv.legacyPayments ?? []) {
        if (dayKey(lp.date) === day) sum += lp.amount || 0;
      }
    }
    return r0(sum);
  }

  /** Compact numbers for the home screen. */
  async dashboard(today: string, monthFrom: string) {
    const f = await this.fifo();
    const day = today || dayKey(new Date());
    const month = monthFrom || day.slice(0, 8) + '01';

    const { totals } = await this.inventory();
    const credit = f.invoices
      .filter((i) => i.type === 'sale' && (i.remainingDebt ?? 0) > 0)
      .reduce((s, i) => s + (i.remainingDebt ?? 0), 0);

    const sales = f.invoices.filter((i) => i.type === 'sale' && dayKey(i.invoiceDate) === day);
    const todaySummary = this.summarize(f.saleLines.filter((l) => this.inPeriod(l.date, { from: day, to: day })));

    return {
      stockKg: totals.stockKg,
      stockValue: totals.stockValue,
      currentValue: totals.currentValue,
      currentProfit: totals.currentProfit,
      today: todaySummary,
      month: this.summarize(f.saleLines.filter((l) => this.inPeriod(l.date, { from: month, to: day }))),
      creditOutstanding: r0(credit),
      work: {
        sold: r0(sales.reduce((s, i) => s + (i.finalAmount || 0), 0)),
        soldKg: todaySummary.kg,
        invoices: sales.length,
        credit: r0(sales.reduce((s, i) => s + (i.creditAmount || 0), 0)),
        creditInvoices: sales.filter((i) => (i.creditAmount ?? 0) > 0).length,
        priorCollected: await this.collectedPriorOn(day, f.invoices),
      },
    };
  }

  /** مدیریت انبار: تناژ موجود، کل خرید از اول، فروش و ارزش. */
  async inventory(period: Period = {}) {
    const f = await this.fifo();
    const byProduct = new Map<string, any>();

    const row = (pid: string, name: string) => {
      if (!byProduct.has(pid)) {
        const p = f.products.get(pid);
        byProduct.set(pid, {
          productId: pid,
          name: p?.name ?? name,
          unit: p?.unit ?? '',
          weightPerUnitKg: p?.weightPerUnitKg ?? 0,
          exists: !!p,
          stockUnits: p?.stock ?? 0,
          stockKg: p ? (p.stock ?? 0) * (p.weightPerUnitKg || 1) : 0,
          purchasedKg: 0,
          purchasedAmount: 0,
          purchaseCount: 0,
          soldKg: 0,
          soldRevenue: 0,
          soldCost: 0,
          fifoRemainingKg: 0,
          remainingValue: 0,
          openLots: [] as any[],
        });
      }
      return byProduct.get(pid);
    };

    for (const p of f.products.values()) row(String(p._id), p.name);
    for (const lot of f.lots) {
      const r = row(lot.productId, lot.productName);
      r.purchasedKg += lot.kgIn;
      r.purchasedAmount += lot.kgIn * lot.costPerKg;
      r.purchaseCount++;
      if (lot.kgLeft > 1e-6) {
        r.fifoRemainingKg += lot.kgLeft;
        r.remainingValue += lot.kgLeft * lot.costPerKg;
        r.openLots.push({
          invoiceNumber: lot.invoiceNumber,
          date: lot.date,
          kgLeft: r1(lot.kgLeft),
          costPerKg: r0(lot.costPerKg),
        });
      }
    }
    for (const l of f.saleLines) {
      if (!this.inPeriod(l.date, period)) continue;
      const r = row(l.productId, l.productName);
      r.soldKg += l.kg;
      r.soldRevenue += l.revenue;
      r.soldCost += l.cost;
    }

    const prices = new Map(
      (await this.productModel.find().select('sellPrice priceRetail priceSupermarket priceWholesale').lean()).map((p: any) => [String(p._id), p]),
    );
    const tierPrice = (p: any, tier: PriceTier) => {
      const v = tier === 'wholesale' ? p?.priceWholesale : tier === 'supermarket' ? p?.priceSupermarket : p?.priceRetail;
      return v > 0 ? v : p?.sellPrice || 0;
    };

    const items = [...byProduct.values()]
      .filter((r) => r.exists || r.purchasedKg > 0 || r.soldKg > 0)
      .map((r) => {
        // Current stock valued at the FIFO cost of the lots still on hand.
        const avgRemainingCost = r.fifoRemainingKg > 0 ? r.remainingValue / r.fifoRemainingKg : r.purchasedKg ? r.purchasedAmount / r.purchasedKg : 0;
        const profit = r.soldRevenue - r.soldCost;
        const units = Math.max(0, r.stockUnits || 0);
        const p = prices.get(r.productId);
        return {
          ...r,
          stockKg: r1(r.stockKg),
          stockValue: r0(r.stockKg * avgRemainingCost),
          /** On-hand stock at today's sell price of each tier. */
          currentValue: Object.fromEntries(PRICE_TIERS.map((t) => [t, r0(units * tierPrice(p, t))])) as Record<PriceTier, number>,
          purchasedKg: r1(r.purchasedKg),
          purchasedAmount: r0(r.purchasedAmount),
          avgBuyPerKg: r.purchasedKg ? r0(r.purchasedAmount / r.purchasedKg) : 0,
          soldKg: r1(r.soldKg),
          soldRevenue: r0(r.soldRevenue),
          soldCost: r0(r.soldCost),
          profit: r0(profit),
          marginPercent: pct(profit, r.soldRevenue),
          profitPerKg: r.soldKg ? r0(profit / r.soldKg) : 0,
          avgSellPerKg: r.soldKg ? r0(r.soldRevenue / r.soldKg) : 0,
          fifoRemainingKg: r1(r.fifoRemainingKg),
          remainingValue: r0(r.remainingValue),
          openLots: r.openLots,
        };
      })
      .sort((a, b) => b.stockKg - a.stockKg || b.soldKg - a.soldKg);

    const sum = (k: string) => items.reduce((s, i: any) => s + (i[k] || 0), 0);
    const soldProfit = sum('soldRevenue') - sum('soldCost');
    // Only positive stock carries value; cost of the same units so "profit if sold today" compares like with like.
    const heldCost = items.reduce((s, i) => s + (i.stockUnits > 0 ? i.stockValue : 0), 0);
    const currentValue = Object.fromEntries(
      PRICE_TIERS.map((t) => [t, r0(items.reduce((s, i) => s + i.currentValue[t], 0))]),
    ) as Record<PriceTier, number>;
    return {
      totals: {
        stockKg: r1(sum('stockKg')),
        stockValue: r0(sum('stockValue')),
        currentValue,
        currentProfit: Object.fromEntries(PRICE_TIERS.map((t) => [t, r0(currentValue[t] - heldCost)])) as Record<PriceTier, number>,
        purchasedKg: r1(sum('purchasedKg')),
        purchasedAmount: r0(sum('purchasedAmount')),
        soldKg: r1(sum('soldKg')),
        soldRevenue: r0(sum('soldRevenue')),
        soldCost: r0(sum('soldCost')),
        profit: r0(soldProfit),
        marginPercent: pct(soldProfit, sum('soldRevenue')),
        profitPerKg: sum('soldKg') ? r0(soldProfit / sum('soldKg')) : 0,
        // purchased − sold − on hand; non-zero means stock was changed outside invoices
        differenceKg: period.from || period.to ? null : r1(sum('purchasedKg') - sum('soldKg') - sum('stockKg')),
      },
      items,
    };
  }

  /** ریز سود: خلاصه، به تفکیک کالا، روز و بار خرید، و فاکتورهای مشکوک. */
  async profit(period: Period = {}) {
    const f = await this.fifo();
    const lines = f.saleLines.filter((l) => this.inPeriod(l.date, period));

    const group = (keyFn: (l: SaleLine) => string, labelFn: (l: SaleLine) => any) => {
      const m = new Map<string, { label: any; lines: SaleLine[] }>();
      for (const l of lines) {
        const k = keyFn(l);
        if (!m.has(k)) m.set(k, { label: labelFn(l), lines: [] });
        m.get(k)!.lines.push(l);
      }
      return [...m.entries()].map(([key, g]) => ({ key, ...g.label, ...this.summarize(g.lines), invoices: new Set(g.lines.map((x) => x.invoiceId)).size }));
    };

    const byProduct = group((l) => l.productId, (l) => ({ name: l.productName })).sort((a, b) => b.profit - a.profit);
    const byDay = group((l) => dayKey(l.date), (l) => ({ date: dayKey(l.date) })).sort((a, b) => (a.key < b.key ? 1 : -1));
    const byCustomer = group((l) => l.customerId ?? `walkin:${l.customerName}`, (l) => ({ name: l.customerName, customerId: l.customerId }))
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 30);

    // سود از روی هر بار خرید (full lifetime of each lot)
    const byLot = f.lots
      .filter((lot) => (!period.from && !period.to) || this.inPeriod(lot.date, period))
      .map((lot) => ({
        invoiceNumber: lot.invoiceNumber,
        invoiceId: lot.invoiceId,
        date: lot.date,
        supplier: lot.supplier,
        productName: lot.productName,
        kgIn: r1(lot.kgIn),
        costPerKg: r0(lot.costPerKg),
        buyAmount: r0(lot.kgIn * lot.costPerKg),
        kgSold: r1(lot.kgSold),
        kgLeft: r1(lot.kgLeft),
        soldPercent: pct(lot.kgSold, lot.kgIn),
        revenue: r0(lot.revenue),
        profit: r0(lot.revenue - lot.cost),
        avgSellPerKg: lot.kgSold ? r0(lot.revenue / lot.kgSold) : 0,
        profitPerKg: lot.kgSold ? r0((lot.revenue - lot.cost) / lot.kgSold) : 0,
        marginPercent: pct(lot.revenue - lot.cost, lot.revenue),
      }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const suspicious = lines
      .filter((l) => {
        const m = l.revenue ? (l.profit / l.revenue) * 100 : 0;
        return l.kg > 0 && (m < SUSPICIOUS.minMargin || m > SUSPICIOUS.maxMargin);
      })
      .map((l) => ({
        invoiceId: l.invoiceId,
        invoiceNumber: l.invoiceNumber,
        date: l.date,
        customerName: l.customerName,
        productName: l.productName,
        quantity: l.quantity,
        unit: l.unit,
        kg: r1(l.kg),
        sellPerKg: l.kg ? r0(l.revenue / l.kg) : 0,
        costPerKg: l.kg ? r0(l.cost / l.kg) : 0,
        profit: r0(l.profit),
        marginPercent: pct(l.profit, l.revenue),
        level: (() => {
          const m = l.revenue ? (l.profit / l.revenue) * 100 : 0;
          return m < SUSPICIOUS.errorMargin || m > SUSPICIOUS.maxMargin ? 'error' : 'loss';
        })() as 'error' | 'loss',
      }))
      .sort((a, b) => (a.level === b.level ? a.profit - b.profit : a.level === 'error' ? -1 : 1));

    const estimated = lines.filter((l) => l.estimatedKg > 0.01);

    return {
      summary: {
        ...this.summarize(lines),
        invoices: new Set(lines.map((l) => l.invoiceId)).size,
        days: new Set(lines.map((l) => dayKey(l.date))).size,
      },
      byProduct,
      byDay,
      byCustomer,
      byLot,
      suspicious,
      warnings: {
        estimatedLines: estimated.length,
        estimatedKg: r1(estimated.reduce((s, l) => s + l.estimatedKg, 0)),
        estimatedInvoices: [...new Set(estimated.map((l) => l.invoiceNumber))].slice(0, 30),
      },
      method: 'FIFO',
    };
  }

  /** سود یک فاکتور فروش با ریز بارهای خریدی که از آن‌ها برداشته شده. */
  async invoiceProfit(invoiceId: string) {
    const f = await this.fifo();
    const ip = f.invoiceProfit.get(invoiceId);
    if (!ip) throw new NotFoundException('فاکتور فروش یافت نشد');
    const lines = f.saleLines.filter((l) => l.invoiceId === invoiceId);
    return {
      ...this.summarize(lines),
      estimated: ip.estimated,
      lines: lines.map((l) => ({
        productName: l.productName,
        quantity: l.quantity,
        unit: l.unit,
        kg: r1(l.kg),
        revenue: r0(l.revenue),
        cost: r0(l.cost),
        profit: r0(l.profit),
        sellPerKg: l.kg ? r0(l.revenue / l.kg) : 0,
        lots: l.consumptions.map((c) => ({
          invoiceNumber: c.lotInvoiceNumber,
          kg: r1(c.kg),
          costPerKg: r0(c.costPerKg),
          estimated: !c.lotId,
        })),
      })),
    };
  }

  /**
   * گزارش نسیه: چه روزی چقدر بار نسیه رفت، کی تسویه شد، و سودش کی واقعاً به دست آمد.
   * Profit of a credit invoice is realised in proportion to the money received:
   * each receipt × (invoice profit ÷ invoice amount).
   */
  async credit(period: Period = {}) {
    const f = await this.fifo();
    const creditInvoices = f.invoices.filter((i) => i.type === 'sale' && (i.creditAmount ?? 0) > 0);
    const ids = creditInvoices.map((i) => i._id);

    const payments = await this.txModel
      .find({ type: 'payment', 'allocations.0': { $exists: true } })
      .select('date allocations paymentMethod')
      .lean();

    const paysByInvoice = new Map<string, { date: Date; amount: number; method?: string }[]>();
    const idSet = new Set(ids.map(String));
    for (const p of payments) {
      for (const a of p.allocations ?? []) {
        const iid = String(a.invoiceId);
        if (!idSet.has(iid)) continue;
        if (!paysByInvoice.has(iid)) paysByInvoice.set(iid, []);
        paysByInvoice.get(iid)!.push({ date: p.date, amount: a.amount, method: p.paymentMethod });
      }
    }
    for (const inv of creditInvoices) {
      if (!inv.legacyPayments?.length) continue;
      if (!paysByInvoice.has(inv._id)) paysByInvoice.set(inv._id, []);
      paysByInvoice.get(inv._id)!.push(...inv.legacyPayments);
    }

    const days = new Map<string, any>();
    const day = (k: string) => {
      if (!days.has(k))
        days.set(k, {
          date: k,
          creditSent: 0,
          creditSentProfit: 0,
          creditInvoices: 0,
          collected: 0,
          realizedProfit: 0,
          collectedPrior: 0,
          collectedPriorProfit: 0,
          settled: 0,
        });
      return days.get(k);
    };

    const rows: any[] = [];
    for (const inv of creditInvoices) {
      const ip = f.invoiceProfit.get(inv._id);
      const profit = ip?.profit ?? 0;
      const ratio = inv.finalAmount ? profit / inv.finalAmount : 0;
      const credit = inv.creditAmount ?? 0;
      const upfront = Math.max(0, inv.finalAmount - credit);
      const pays = (paysByInvoice.get(inv._id) ?? []).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const paidLater = pays.reduce((s, p) => s + p.amount, 0);
      const remaining = inv.remainingDebt ?? Math.max(0, credit - paidLater);
      const settledAt = remaining <= 0 && pays.length ? pays[pays.length - 1].date : null;
      const daysToSettle = settledAt
        ? Math.max(0, Math.round((new Date(settledAt).getTime() - new Date(inv.invoiceDate).getTime()) / 86400000))
        : null;
      const ageDays = Math.round((Date.now() - new Date(inv.invoiceDate).getTime()) / 86400000);

      if (this.inPeriod(inv.invoiceDate, period)) {
        const d = day(dayKey(inv.invoiceDate));
        d.creditSent += credit;
        d.creditSentProfit += credit * ratio;
        d.creditInvoices++;
      }
      for (const p of pays) {
        if (!this.inPeriod(p.date, period)) continue;
        const payDay = dayKey(p.date);
        const d = day(payDay);
        d.collected += p.amount;
        d.realizedProfit += p.amount * ratio;
        if (dayKey(inv.invoiceDate) < payDay) {
          d.collectedPrior += p.amount;
          d.collectedPriorProfit += p.amount * ratio;
        }
      }
      if (settledAt && this.inPeriod(settledAt, period)) day(dayKey(settledAt)).settled++;

      const touches =
        this.inPeriod(inv.invoiceDate, period) || pays.some((p) => this.inPeriod(p.date, period)) || remaining > 0;
      if (!touches) continue;

      rows.push({
        invoiceId: inv._id,
        invoiceNumber: inv.invoiceNumber,
        customerId: inv.customerId,
        customerName: inv.customerName,
        date: inv.invoiceDate,
        amount: r0(inv.finalAmount),
        upfront: r0(upfront),
        credit: r0(credit),
        paidLater: r0(paidLater),
        remaining: r0(remaining),
        profit: r0(profit),
        marginPercent: pct(profit, inv.finalAmount),
        realizedProfit: r0((upfront + paidLater) * ratio),
        unrealizedProfit: r0(remaining * ratio),
        settledAt,
        daysToSettle,
        ageDays,
        payments: pays.map((p) => ({ date: p.date, amount: r0(p.amount), method: p.method, profit: r0(p.amount * ratio) })),
      });
    }

    const dayRows = [...days.values()]
      .map((d) => ({
        ...d,
        creditSent: r0(d.creditSent),
        creditSentProfit: r0(d.creditSentProfit),
        collected: r0(d.collected),
        realizedProfit: r0(d.realizedProfit),
        collectedPrior: r0(d.collectedPrior),
        collectedPriorProfit: r0(d.collectedPriorProfit),
      }))
      .sort((a, b) => (a.date < b.date ? 1 : -1));

    const settledRows = rows.filter((r) => r.daysToSettle !== null);
    const sum = (arr: any[], k: string) => arr.reduce((s, r) => s + (r[k] || 0), 0);

    return {
      summary: {
        creditSent: r0(sum(dayRows, 'creditSent')),
        creditSentProfit: r0(sum(dayRows, 'creditSentProfit')),
        creditInvoices: sum(dayRows, 'creditInvoices'),
        collected: r0(sum(dayRows, 'collected')),
        realizedProfit: r0(sum(dayRows, 'realizedProfit')),
        collectedPrior: r0(sum(dayRows, 'collectedPrior')),
        collectedPriorProfit: r0(sum(dayRows, 'collectedPriorProfit')),
        outstanding: r0(sum(rows.filter((r) => r.remaining > 0), 'remaining')),
        unrealizedProfit: r0(sum(rows.filter((r) => r.remaining > 0), 'unrealizedProfit')),
        openInvoices: rows.filter((r) => r.remaining > 0).length,
        avgDaysToSettle: settledRows.length ? r1(sum(settledRows, 'daysToSettle') / settledRows.length) : null,
      },
      days: dayRows,
      invoices: rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    };
  }

  /**
   * سود تورمی: سود هر فروش به دو بخش تقسیم می‌شود —
   * تجاری (فروش − آخرین قیمت خرید در روز فروش) و تورمی (آخرین قیمت خرید − قیمت واقعی بار از FIFO).
   * `generalInflationAnnual` (درصد سالانه، اختیاری) برای محاسبه سود واقعی پس از تورم عمومی است.
   */
  async inflation(period: Period = {}, generalInflationAnnual = 0) {
    const f = await this.fifo();
    const lines = f.saleLines.filter((l) => this.inPeriod(l.date, period));
    const changes = f.priceChanges.filter((c) => this.inPeriod(c.date, period));
    const g = generalInflationAnnual > 0 ? generalInflationAnnual / 100 : 0;

    const erosionOf = (l: SaleLine) =>
      g
        ? l.consumptions.reduce((s, c) => {
            if (!c.lotDate) return s;
            const days = Math.max(0, (new Date(l.date).getTime() - new Date(c.lotDate).getTime()) / 86400000);
            return s + c.kg * c.costPerKg * (Math.pow(1 + g, days / 365) - 1);
          }, 0)
        : 0;

    const split = (ls: SaleLine[]) => {
      const trading = ls.reduce((s, l) => s + l.tradingProfit, 0);
      const inflation = ls.reduce((s, l) => s + l.inflationProfit, 0);
      const erosion = ls.reduce((s, l) => s + erosionOf(l), 0);
      const base = this.summarize(ls);
      return {
        ...base,
        tradingProfit: r0(trading),
        inflationProfit: r0(inflation),
        tradingShare: pct(trading, base.profit),
        inflationShare: pct(inflation, base.profit),
        tradingPerKg: base.kg ? r0(trading / base.kg) : 0,
        inflationPerKg: base.kg ? r0(inflation / base.kg) : 0,
        // (فروش − آخرین قیمت خرید) ÷ آخرین قیمت خرید
        tradingMarkupPercent: pct(trading, base.revenue - trading),
        generalInflationErosion: r0(erosion),
        realProfit: r0(base.profit - erosion),
      };
    };

    // Cost per kg of a product as of a Tehran day: the latest purchase on or before it.
    const costAt = (pid: string, day: string | undefined, strictlyBefore = false) => {
      const lots = f.lotsByProduct.get(pid) ?? [];
      let c: number | null = null;
      for (const lot of lots) {
        const k = dayKey(lot.date);
        if (day && (strictlyBefore ? k >= day : k > day)) break;
        c = lot.costPerKg;
      }
      return c;
    };

    const byPid = new Map<string, SaleLine[]>();
    for (const l of lines) {
      if (!byPid.has(l.productId)) byPid.set(l.productId, []);
      byPid.get(l.productId)!.push(l);
    }
    const pids = new Set([...byPid.keys(), ...changes.map((c) => c.productId)]);
    for (const [pid, lots] of f.lotsByProduct) {
      if (lots.some((lot) => this.inPeriod(lot.date, period))) pids.add(pid);
    }

    const allSales = new Map<string, SaleLine[]>();
    for (const l of f.saleLines) {
      if (l.kg <= 0) continue;
      if (!allSales.has(l.productId)) allSales.set(l.productId, []);
      allSales.get(l.productId)!.push(l);
    }
    const sinceDay = (days: number) => dayKey(new Date(Date.now() - (days - 1) * 86400000));
    const avgSince = (pid: string, from: string) => {
      let kg = 0;
      let rev = 0;
      for (const l of allSales.get(pid) ?? []) {
        if (dayKey(l.date) < from) continue;
        kg += l.kg;
        rev += l.revenue;
      }
      return kg > 0 ? r0(rev / kg) : null;
    };
    const day7 = sinceDay(7);
    const day30 = sinceDay(30);
    const day90 = sinceDay(90);

    const sellAvg = (ls: SaleLine[]) => {
      const kg = ls.reduce((s, l) => s + l.kg, 0);
      return kg ? ls.reduce((s, l) => s + l.revenue, 0) / kg : null;
    };

    const products = [...pids].map((pid) => {
      const ls = byPid.get(pid) ?? [];
      const lots = f.lotsByProduct.get(pid) ?? [];
      const firstInPeriod = lots.find((lot) => this.inPeriod(lot.date, period));
      const costStart = (period.from ? costAt(pid, period.from.slice(0, 10), true) : null) ?? firstInPeriod?.costPerKg ?? lots[0]?.costPerKg ?? null;
      const costEnd = costAt(pid, period.to?.slice(0, 10)) ?? costStart;

      const days = [...new Set(ls.map((l) => dayKey(l.date)))].sort();
      const firstDays = new Set(days.slice(0, 7));
      const lastDays = new Set(days.slice(-7));
      const sellStart = sellAvg(ls.filter((l) => firstDays.has(dayKey(l.date))));
      const sellEnd = sellAvg(ls.filter((l) => lastDays.has(dayKey(l.date))));

      const bought = lots.filter((lot) => this.inPeriod(lot.date, period));
      const purchasedKg = bought.reduce((s, lot) => s + lot.kgIn, 0);
      const purchasedAmount = bought.reduce((s, lot) => s + lot.kgIn * lot.costPerKg, 0);
      const open = lots.filter((lot) => lot.kgLeft > 1e-6);
      const last = f.lastCost.get(pid) ?? 0;
      const stockKg = open.reduce((s, lot) => s + lot.kgLeft, 0);
      const unrealized = open.reduce((s, lot) => s + lot.kgLeft * (last - lot.costPerKg), 0);
      const holdingGain = changes.filter((c) => c.productId === pid).reduce((s, c) => s + c.gain, 0);

      return {
        productId: pid,
        name: f.products.get(pid)?.name ?? ls[0]?.productName ?? changes.find((c) => c.productId === pid)?.productName ?? '',
        ...split(ls),
        costStart: costStart !== null ? r0(costStart) : null,
        costEnd: costEnd !== null ? r0(costEnd) : null,
        costInflationPercent: costStart && costEnd ? pct(costEnd - costStart, costStart) : 0,
        sellStart: sellStart !== null ? r0(sellStart) : null,
        sellEnd: sellEnd !== null ? r0(sellEnd) : null,
        sellChangePercent: sellStart && sellEnd ? pct(sellEnd - sellStart, sellStart) : 0,
        purchasedKg: r1(purchasedKg),
        purchasedAmount: r0(purchasedAmount),
        avgBuyPerKg: purchasedKg > 0 ? r0(purchasedAmount / purchasedKg) : null,
        sellAvg7: avgSince(pid, day7),
        sellAvg30: avgSince(pid, day30),
        sellAvg90: avgSince(pid, day90),
        priceChanges: changes.filter((c) => c.productId === pid).length,
        holdingGain: r0(holdingGain),
        stockKg: r1(stockKg),
        lastCost: r0(last),
        unrealizedGain: r0(unrealized),
      };
    });
    products.sort((a, b) => b.revenue + b.purchasedAmount - (a.revenue + a.purchasedAmount) || b.profit - a.profit);

    const purchasedKg = products.reduce((s, p) => s + p.purchasedKg, 0);
    const purchasedAmount = products.reduce((s, p) => s + p.purchasedAmount, 0);

    // Weighted by kg sold in the period (or purchased, if nothing was sold).
    const weightOf = (p: (typeof products)[number]) => p.kg || (f.lotsByProduct.get(p.productId) ?? []).filter((lot) => this.inPeriod(lot.date, period)).reduce((s, lot) => s + lot.kgIn, 0);
    const wTotal = products.reduce((s, p) => s + (p.costStart ? weightOf(p) : 0), 0);
    const costInflation = wTotal ? products.reduce((s, p) => s + (p.costStart ? weightOf(p) * p.costInflationPercent : 0), 0) / wTotal : 0;
    const sellW = products.filter((p) => p.sellStart && p.sellEnd);
    const sellWTotal = sellW.reduce((s, p) => s + p.kg, 0);
    const sellChange = sellWTotal ? sellW.reduce((s, p) => s + p.kg * p.sellChangePercent, 0) / sellWTotal : 0;

    const byDay = new Map<string, SaleLine[]>();
    for (const l of lines) {
      const k = dayKey(l.date);
      if (!byDay.has(k)) byDay.set(k, []);
      byDay.get(k)!.push(l);
    }

    const allOpen = f.lots.filter((lot) => lot.kgLeft > 1e-6);
    const stockFifo = allOpen.reduce((s, lot) => s + lot.kgLeft * lot.costPerKg, 0);
    const stockReplacement = allOpen.reduce((s, lot) => s + lot.kgLeft * (f.lastCost.get(lot.productId) ?? lot.costPerKg), 0);

    return {
      summary: {
        ...split(lines),
        invoices: new Set(lines.map((l) => l.invoiceId)).size,
        holdingGain: r0(changes.reduce((s, c) => s + c.gain, 0)),
        purchasedKg: r1(purchasedKg),
        purchasedAmount: r0(purchasedAmount),
        avgBuyPerKg: purchasedKg > 0 ? r0(purchasedAmount / purchasedKg) : 0,
        priceChanges: changes.length,
        costInflationPercent: Math.round(costInflation * 100) / 100,
        sellChangePercent: Math.round(sellChange * 100) / 100,
        generalInflationAnnual,
      },
      stock: {
        kg: r1(allOpen.reduce((s, lot) => s + lot.kgLeft, 0)),
        fifoValue: r0(stockFifo),
        replacementValue: r0(stockReplacement),
        unrealizedGain: r0(stockReplacement - stockFifo),
      },
      products,
      priceChanges: changes
        .map((c) => ({
          ...c,
          oldCost: r0(c.oldCost),
          newCost: r0(c.newCost),
          changePercent: pct(c.newCost - c.oldCost, c.oldCost),
          stockKg: r1(c.stockKg),
          gain: r0(c.gain),
        }))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
      byDay: [...byDay.entries()]
        .map(([date, ls]) => {
          const s = split(ls);
          return {
            date,
            kg: s.kg,
            revenue: s.revenue,
            profit: s.profit,
            tradingProfit: s.tradingProfit,
            inflationProfit: s.inflationProfit,
            sellPerKg: s.avgSellPerKg,
            costPerKg: s.avgCostPerKg,
          };
        })
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
    };
  }

  /**
   * قیمت فروش پیشنهادی بر مبنای «بهای جایگزینی» به‌جای بهای تاریخی:
   * ۱. بهای تمام‌شده هر کیلو = قیمت فاکتور (پس از تخفیف) + سهم کرایه حمل و تخلیه
   * ۲. بهای مبنا = آخرین بهای تمام‌شده (`replacement`) یا میانگین موزون موجودی انبار (`average`)
   * ۳. بهای پایه = بهای مبنا × (۱ + تورم ماهانه × ماه‌های خواب کالا)
   * ۴. قیمت فروش = بهای پایه × (۱ + درصد سود)   یا   قیمت فروش قبلی × (بهای پایه جدید ÷ بهای پایه زمان قیمت‌گذاری)
   */
  async priceSuggestions(opts: SuggestOptions = {}) {
    const requested = opts.mode ?? (opts.markup !== undefined ? 'custom' : 'list');
    const mode: SuggestMode = requested === 'custom' && opts.markup === undefined ? 'list' : requested;
    const basis: CostBasis = opts.basis ?? 'replacement';
    const monthly = Math.max(0, opts.monthlyInflation ?? 0);
    const holdOverride = opts.holdDays !== undefined && opts.holdDays >= 0 ? opts.holdDays : null;
    const f = await this.fifo();
    const recentDays = opts.recentDays ?? 30;
    const since = dayKey(new Date(Date.now() - recentDays * 86400000));
    const holdSince = dayKey(new Date(Date.now() - HOLD_WINDOW_DAYS * 86400000));
    const filter: any = opts.productIds?.length ? { _id: { $in: opts.productIds } } : { isActive: { $ne: false } };
    const products = await this.productModel
      .find(filter)
      .select('name unit weightPerUnitKg hasDualUnit secondaryUnit unitRatio stock buyPrice sellPrice priceRetail priceSupermarket priceWholesale priceSetAt priceCostBasisPerKg')
      .lean();

    const salesByPid = new Map<string, SaleLine[]>();
    for (const l of f.saleLines) {
      if (l.kg <= 0) continue;
      if (!salesByPid.has(l.productId)) salesByPid.set(l.productId, []);
      salesByPid.get(l.productId)!.push(l);
    }
    const lastChangeByPid = new Map<string, (typeof f.priceChanges)[number]>();
    for (const c of f.priceChanges) lastChangeByPid.set(c.productId, c);

    const roundPrice = (n: number) => Math.round(n / 1000) * 1000;

    return products
      .map((p: any) => {
        const pid = String(p._id);
        const wpu =
          p.weightPerUnitKg ||
          (p.hasDualUnit && p.secondaryUnit === 'کیلوگرم' ? p.unitRatio || 0 : 0) ||
          (p.unit === 'کیلوگرم' ? 1 : 0);
        const byWeight = wpu > 0;
        const scale = byWeight ? wpu : 1;
        const last = f.lastCost.get(pid);
        if (!last) return null;

        const lots = f.lotsByProduct.get(pid) ?? [];
        const lastLot = lots[lots.length - 1];
        const lastChange = lastChangeByPid.get(pid);
        const prevCost = lastChange?.newCost === last ? lastChange.oldCost : last;

        const open = lots.filter((l) => l.kgLeft > 1e-6);
        const openKg = open.reduce((s, l) => s + l.kgLeft, 0);
        const avgCost = openKg > 0 ? open.reduce((s, l) => s + l.kgLeft * l.costPerKg, 0) / openKg : last;
        const costBasis = basis === 'average' ? avgCost : last;

        // دوره خواب کالا: میانگین موزون روزهایی که بارِ فروخته‌شده در انبار مانده بود.
        const sales = salesByPid.get(pid) ?? [];
        let holdSample = sales.filter((l) => dayKey(l.date) >= holdSince);
        if (!holdSample.length) holdSample = sales.slice(-20);
        let heldKg = 0;
        let heldKgDays = 0;
        for (const l of holdSample) {
          for (const c of l.consumptions) {
            if (!c.lotDate) continue;
            heldKg += c.kg;
            heldKgDays += c.kg * Math.max(0, (new Date(l.date).getTime() - new Date(c.lotDate).getTime()) / 86400000);
          }
        }
        const measuredHold = heldKg > 0 ? heldKgDays / heldKg : null;
        const holdDays = holdOverride ?? Math.min(MAX_HOLD_DAYS, measuredHold ?? 0);
        const bufferPercent = monthly * (holdDays / 30);
        const baseCost = costBasis * (1 + bufferPercent / 100);

        // Base cost the current list price was built on: stored by a suggested price, otherwise
        // the landed cost of the last purchase entered before the price was set by hand.
        let priceBaseCost = prevCost;
        if (p.priceCostBasisPerKg > 0) priceBaseCost = p.priceCostBasisPerKg;
        else if (p.priceSetAt) {
          const setAt = new Date(p.priceSetAt).getTime();
          const before = lots.filter((l) => (l.createdAt ?? l.date).getTime() <= setAt);
          if (before.length) priceBaseCost = before[before.length - 1].costPerKg;
        }
        if (!(priceBaseCost > 0)) priceBaseCost = last;

        let recent = sales.filter((l) => dayKey(l.date) >= since);
        if (!recent.length) recent = sales.slice(-20);
        const rKg = recent.reduce((s, l) => s + l.kg, 0);
        const rRev = recent.reduce((s, l) => s + l.revenue, 0);
        const rTrading = recent.reduce((s, l) => s + l.tradingProfit, 0);
        const recentSellPerKg = rKg ? rRev / rKg : null;
        const recentMarkup = rKg && rRev - rTrading > 0 ? (rTrading / (rRev - rTrading)) * 100 : null;

        const retail = p.priceRetail || p.sellPrice || 0;
        const listPerKg = retail / scale;

        const unchanged = Math.abs(baseCost - priceBaseCost) < 0.5;
        let suggestedPerKg: number;
        if (mode === 'custom') suggestedPerKg = baseCost * (1 + (opts.markup ?? DEFAULT_MARKUP) / 100);
        else if (mode === 'recent' && recentMarkup !== null) suggestedPerKg = baseCost * (1 + Math.min(25, Math.max(0, recentMarkup)) / 100);
        else if (listPerKg > 0) suggestedPerKg = unchanged ? listPerKg : listPerKg * (baseCost / priceBaseCost);
        else suggestedPerKg = baseCost * (1 + DEFAULT_MARKUP / 100);

        const keepCurrent = mode === 'list' && unchanged && retail > 0;
        const suggestedRetail = keepCurrent ? r0(retail) : roundPrice(suggestedPerKg * scale);
        const ratio = (v: number) => (retail > 0 && v > 0 ? v / retail : 1);
        const suggestedSupermarket = keepCurrent ? r0(p.priceSupermarket || retail) : roundPrice(suggestedRetail * ratio(p.priceSupermarket));
        const suggestedWholesaleRaw = keepCurrent ? r0(p.priceWholesale || retail) : roundPrice(suggestedRetail * ratio(p.priceWholesale));
        const floorUnit = last > 0 ? Math.ceil((last * scale) / 1000) * 1000 : 0;
        const atCost = (n: number) => (floorUnit > 0 && n < floorUnit ? floorUnit : n);
        const safeRetail = atCost(suggestedRetail);
        const safeSuper = atCost(suggestedSupermarket);
        const safeWholesale = atCost(suggestedWholesaleRaw);
        const safePerKg = safeRetail / scale;
        const lossGuarded = safeRetail > suggestedRetail || safeSuper > suggestedSupermarket || safeWholesale > suggestedWholesaleRaw;
        const drifted = (next: number, prev: number) => (prev > 0 ? Math.abs(next - prev) / prev > 0.005 : next > 0);

        return {
          productId: pid,
          name: p.name,
          unit: p.unit,
          weightPerUnitKg: wpu,
          byWeight,
          stockUnits: p.stock ?? 0,
          stockKg: r1(openKg),
          lastCostPerKg: r0(last),
          lastCostPerUnit: r0(last * scale),
          lastInvoicePricePerKg: r0(lastLot?.invoicePricePerKg ?? last),
          lastFreightPerKg: r0(lastLot?.freightPerKg ?? 0),
          lastPurchaseDate: lastLot?.date ?? null,
          lastPurchaseInvoice: lastLot?.invoiceNumber ?? null,
          prevCostPerKg: r0(prevCost),
          costChangePercent: pct(last - prevCost, prevCost),
          avgCostPerKg: r0(avgCost),
          basis,
          costBasisPerKg: r0(costBasis),
          holdDays: r0(holdDays),
          holdDaysMeasured: measuredHold !== null ? r0(measuredHold) : null,
          monthlyInflation: monthly,
          bufferPercent: r2(bufferPercent),
          baseCostPerKg: r0(baseCost),
          priceBaseCostPerKg: r0(priceBaseCost),
          costChangeSincePricePercent: pct(baseCost - priceBaseCost, priceBaseCost),
          priceSetAt: p.priceSetAt ?? null,
          recentSellPerKg: recentSellPerKg !== null ? r0(recentSellPerKg) : null,
          recentMarkupPercent: recentMarkup !== null ? r2(recentMarkup) : null,
          current: {
            retail: r0(retail),
            supermarket: r0(p.priceSupermarket || retail),
            wholesale: r0(p.priceWholesale || retail),
            perKg: r0(listPerKg),
            markupOnBaseCost: listPerKg ? r2((listPerKg / baseCost - 1) * 100) : null,
            profitPerKg: r0(listPerKg - baseCost),
          },
          mode,
          markupUsed: pct(safePerKg - baseCost, baseCost),
          belowCost: false,
          lossGuarded,
          suggested: {
            retail: safeRetail,
            supermarket: safeSuper,
            wholesale: safeWholesale,
            perKg: r0(safePerKg),
            profitPerKg: r0(safePerKg - baseCost),
          },
          changePercent: retail ? pct(safeRetail - retail, retail) : null,
          needsUpdate:
            drifted(safeRetail, retail) ||
            drifted(safeSuper, p.priceSupermarket || retail) ||
            drifted(safeWholesale, p.priceWholesale || retail),
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => Number(b.needsUpdate) - Number(a.needsUpdate) || Math.abs(b.changePercent ?? 0) - Math.abs(a.changePercent ?? 0));
  }

  /** اثر یک فاکتور خرید: قیمت قبلی/جدید هر کالا، تورم، سود نگهداری موجودی و قیمت فروش پیشنهادی. */
  async purchaseImpact(invoiceId: string, opts: Omit<SuggestOptions, 'productIds'> = {}) {
    const f = await this.fifo();
    const inv = f.invoices.find((i) => i._id === invoiceId && i.type === 'purchase');
    if (!inv) throw new NotFoundException('فاکتور خرید یافت نشد');

    const itemLots = f.lots.filter((lot) => lot.invoiceId === invoiceId);
    const pids = [...new Set(itemLots.map((l) => l.productId))];
    const suggestions = await this.priceSuggestions({ ...opts, productIds: pids });

    const items = pids.map((pid) => {
      const lots = f.lotsByProduct.get(pid) ?? [];
      const mine = itemLots.filter((l) => l.productId === pid);
      const idx = lots.indexOf(mine[0]);
      const prev = idx > 0 ? lots[idx - 1] : null;
      const kg = mine.reduce((s, l) => s + l.kgIn, 0);
      const avgOf = (k: 'costPerKg' | 'invoicePricePerKg' | 'freightPerKg') => (kg ? mine.reduce((s, l) => s + l.kgIn * l[k], 0) / kg : 0);
      const newCost = avgOf('costPerKg');
      const change = f.priceChanges.find((c) => c.invoiceId === invoiceId && c.productId === pid);
      const isLatest = lots[lots.length - 1]?.invoiceId === invoiceId;
      return {
        productId: pid,
        name: mine[0].productName,
        kg: r1(kg),
        prevCostPerKg: prev ? r0(prev.costPerKg) : null,
        newCostPerKg: r0(newCost),
        invoicePricePerKg: r0(avgOf('invoicePricePerKg')),
        freightPerKg: r0(avgOf('freightPerKg')),
        costChangePercent: prev ? pct(newCost - prev.costPerKg, prev.costPerKg) : null,
        stockKgHeld: change ? r1(change.stockKg) : null,
        holdingGain: change ? r0(change.gain) : 0,
        isLatestPurchase: isLatest,
        suggestion: suggestions.find((s) => s.productId === pid) ?? null,
      };
    });

    return {
      invoiceId,
      invoiceNumber: inv.invoiceNumber,
      date: inv.invoiceDate,
      supplier: inv.customerName,
      freight: r0(purchaseFreight(inv)),
      holdingGain: r0(items.reduce((s, i) => s + i.holdingGain, 0)),
      items,
    };
  }

  /**
   * چارت قیمت همه کالاها: بهای تمام‌شده هر بار خرید، میانگین/کمینه/بیشینه فروش هر روز (هر کیلو)
   * و تاریخچه قیمت فروش لیست (از priceHistory و تغییرهای ثبت‌شده در لاگ).
   */
  async priceChart() {
    const f = await this.fifo();
    const [products, edits] = await Promise.all([
      this.productModel
        .find({ isActive: { $ne: false } })
        .select('name unit category weightPerUnitKg sellPrice priceRetail priceSupermarket priceWholesale priceHistory stock')
        .lean(),
      this.audit.productPriceEdits(),
    ]);
    const now = Date.now();
    const since30 = dayKey(new Date(now - 30 * 86400000));

    const salesByPid = new Map<string, SaleLine[]>();
    for (const l of f.saleLines) {
      if (l.kg <= 0) continue;
      if (!salesByPid.has(l.productId)) salesByPid.set(l.productId, []);
      salesByPid.get(l.productId)!.push(l);
    }

    return products
      .map((p: any) => {
        const pid = String(p._id);
        const wpu = p.weightPerUnitKg || (p.unit === 'کیلوگرم' ? 1 : 0);
        const lots = f.lotsByProduct.get(pid) ?? [];
        const sales = salesByPid.get(pid) ?? [];

        const days = new Map<string, { kg: number; revenue: number; min: number; max: number; count: number }>();
        for (const l of sales) {
          const k = dayKey(l.date);
          const perKg = l.revenue / l.kg;
          const d = days.get(k) ?? { kg: 0, revenue: 0, min: Infinity, max: -Infinity, count: 0 };
          d.kg += l.kg;
          d.revenue += l.revenue;
          d.min = Math.min(d.min, perKg);
          d.max = Math.max(d.max, perKg);
          d.count++;
          days.set(k, d);
        }

        const list: { date: Date; price: number; by?: string }[] = [];
        const history = [...(p.priceHistory ?? [])].sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
        if (history[0]?.oldPrice > 0) list.push({ date: new Date(new Date(history[0].date).getTime() - 1), price: history[0].oldPrice });
        for (const h of history) if (h.newPrice > 0) list.push({ date: h.date, price: h.newPrice, by: h.changedByName });
        for (const e of edits) if (e.productId === pid) list.push({ date: e.date, price: e.price, by: e.by });
        list.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const retail = p.priceRetail || p.sellPrice || 0;

        const lastCost = f.lastCost.get(pid) ?? null;
        const cost30 = [...lots].reverse().find((l) => dayKey(l.date) <= since30)?.costPerKg ?? lots[0]?.costPerKg ?? null;
        const recent = sales.filter((l) => dayKey(l.date) >= since30);
        const recentKg = recent.reduce((s, l) => s + l.kg, 0);
        const avgSell30 = recentKg ? recent.reduce((s, l) => s + l.revenue, 0) / recentKg : null;
        const retailPerKg = wpu ? retail / wpu : 0;

        return {
          productId: pid,
          name: p.name,
          unit: p.unit,
          category: p.category,
          weightPerUnitKg: wpu,
          soldKg: r1(sales.reduce((s, l) => s + l.kg, 0)),
          purchases: lots.map((l) => ({
            date: l.date,
            costPerKg: r0(l.costPerKg),
            invoicePricePerKg: r0(l.invoicePricePerKg),
            kg: r1(l.kgIn),
            invoiceNumber: l.invoiceNumber,
            invoiceId: l.invoiceId,
            supplier: l.supplier,
          })),
          sales: [...days.entries()]
            .sort(([a], [b]) => (a < b ? -1 : 1))
            .map(([date, d]) => ({ date, avgPerKg: r0(d.revenue / d.kg), minPerKg: r0(d.min), maxPerKg: r0(d.max), kg: r1(d.kg), count: d.count })),
          list: list.map((x) => ({ date: x.date, price: r0(x.price), perKg: wpu ? r0(x.price / wpu) : null, by: x.by ?? '' })),
          current: {
            retail: r0(retail),
            supermarket: r0(p.priceSupermarket || retail),
            wholesale: r0(p.priceWholesale || retail),
            retailPerKg: r0(retailPerKg),
            wholesalePerKg: wpu ? r0((p.priceWholesale || retail) / wpu) : 0,
          },
          lastCostPerKg: lastCost !== null ? r0(lastCost) : null,
          costChange30Percent: lastCost && cost30 ? pct(lastCost - cost30, cost30) : 0,
          avgSell30PerKg: avgSell30 !== null ? r0(avgSell30) : null,
          listMarginPercent: lastCost && retailPerKg ? pct(retailPerKg - lastCost, retailPerKg) : null,
        };
      })
      .sort((a, b) => b.soldKg - a.soldKg);
  }

  /** Accrual cost of goods for a period (used by the P&L). */
  async periodSales(period: Period) {
    const f = await this.fifo();
    return this.summarize(f.saleLines.filter((l) => this.inPeriod(l.date, period)));
  }
}
