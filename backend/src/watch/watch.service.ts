import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Customer, CustomerDocument } from '../customers/schemas/customer.schema';
import { Invoice, InvoiceDocument } from '../invoices/schemas/invoice.schema';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { SettingsService, normalizeWatch, type CustomerWatchSettings } from '../settings/settings.service';
import { ProformasService } from '../proformas/proformas.service';
import { crmWindows, dayKey } from '../common/jalali';
import type { CreateInvoiceDto } from '../invoices/dto/create-invoice.dto';

const r0 = (n: number) => Math.round(n);
const r1 = (n: number) => Math.round(n * 10) / 10;
const DAY = 86400000;

type Sale = {
  _id: Types.ObjectId;
  invoiceNumber?: string;
  customerId?: Types.ObjectId | string;
  invoiceDate: Date;
  finalAmount: number;
  totalWeightKg: number;
  saleType?: string;
  items: { productId: string; productName: string; quantity: number; unit: string; unitPrice: number; totalPrice: number; weightKg?: number }[];
};

export type WatchGrade = 'A' | 'B' | 'C' | 'D';

@Injectable()
export class WatchService {
  constructor(
    @InjectModel(Customer.name) private customers: Model<CustomerDocument>,
    @InjectModel(Invoice.name) private invoices: Model<InvoiceDocument>,
    @InjectModel(Product.name) private products: Model<ProductDocument>,
    private settings: SettingsService,
    private proformas: ProformasService,
  ) {}

  async rules() {
    return normalizeWatch((await this.settings.get()).customerWatch);
  }

  async board() {
    const rules = await this.rules();
    const shops = await this.customers
      .find({ isActive: true, kind: { $ne: 'walkin' } })
      .select('name phoneNumber balance customerType watchGrade watchScore watchMonthAmount watchMonthKg watchYearAmount watchYearKg watchDropAmount watchDropKg watchTopProductName watchReason watchAction watchScoredAt lastSaleAt nextFollowUpAt')
      .lean();
    const grades: Record<WatchGrade | 'none', number> = { A: 0, B: 0, C: 0, D: 0, none: 0 };
    const queue = shops.filter((c) => {
      const g = (c.watchGrade || 'none') as WatchGrade | 'none';
      if (g === 'A' || g === 'B' || g === 'C' || g === 'D') grades[g] += 1;
      else grades.none += 1;
      return !!c.watchReason;
    });
    queue.sort((a, b) => (b.watchScore || 0) - (a.watchScore || 0));
    return {
      rules,
      scored: shops.filter((c) => c.watchScoredAt).length,
      total: shops.length,
      grades,
      queue: queue.slice(0, 80),
      queueCount: queue.length,
    };
  }

  /** Recompute RFM grade, drop size and call reason for every shop customer. */
  async scan() {
    const rules = await this.rules();
    const windows = crmWindows();
    const [shops, sales] = await Promise.all([
      this.customers.find({ isActive: true, kind: { $ne: 'walkin' } }).exec(),
      this.invoices
        .find({ type: 'sale', customerId: { $exists: true, $ne: null } })
        .select('customerId invoiceDate finalAmount totalWeightKg items invoiceNumber saleType')
        .sort({ invoiceDate: -1 })
        .lean(),
    ]);
    const byCustomer = new Map<string, Sale[]>();
    for (const sale of sales as unknown as Sale[]) {
      const id = String(sale.customerId || '');
      if (!id) continue;
      const list = byCustomer.get(id) || [];
      list.push(sale);
      byCustomer.set(id, list);
    }

    const now = Date.now();
    let planned = 0;
    const followWhen = new Date();
    followWhen.setDate(followWhen.getDate() + rules.planDays);
    followWhen.setHours(12, 0, 0, 0);

    for (const customer of shops) {
      const list = byCustomer.get(String(customer._id)) || [];
      const snap = this.score(customer, list, rules, windows, now);
      customer.watchGrade = snap.grade;
      customer.watchScore = snap.score;
      customer.watchMonthAmount = snap.monthAmount;
      customer.watchMonthKg = snap.monthKg;
      customer.watchYearAmount = snap.yearAmount;
      customer.watchYearKg = snap.yearKg;
      customer.watchDropAmount = snap.dropAmount;
      customer.watchDropKg = snap.dropKg;
      customer.watchTopProductName = snap.topProductName;
      customer.watchReason = snap.reason;
      customer.watchAction = snap.action;
      customer.watchScoredAt = new Date();
      if (rules.planFollowUp && snap.reason) {
        const due = customer.nextFollowUpAt ? new Date(customer.nextFollowUpAt).getTime() : 0;
        if (!due || due < now) {
          customer.nextFollowUpAt = followWhen;
          planned += 1;
        }
      }
      await customer.save();
    }

    return { scanned: shops.length, planned, ...await this.board() };
  }

  async resume(customerId: string, source?: string, invoiceId?: string) {
    const customer = await this.customers.findById(customerId).exec();
    if (!customer) throw new NotFoundException('مشتری یافت نشد');
    const rules = await this.rules();
    const windows = crmWindows();
    const sales = (await this.invoices
      .find({ type: 'sale', customerId: customer._id })
      .select('invoiceNumber invoiceDate finalAmount totalWeightKg items saleType remainingDebt')
      .sort({ invoiceDate: -1 })
      .limit(40)
      .lean()) as unknown as Sale[];
    const snap = this.score(customer, sales, rules, windows, Date.now());
    const suggestion = await this.buildSuggestion(customer, sales, rules, source, invoiceId);
    return {
      customer: {
        id: String(customer._id),
        name: customer.name,
        phoneNumber: customer.phoneNumber || '',
        customerType: customer.customerType,
        balance: customer.balance || 0,
        lastSaleAt: customer.lastSaleAt || null,
        lastContactAt: customer.lastContactAt || null,
        lastContactResult: customer.lastContactResult || '',
        lastContactNote: customer.lastContactNote || '',
      },
      windows,
      ...snap,
      recent: sales.slice(0, 5).map((s) => ({
        id: String(s._id),
        number: s.invoiceNumber,
        date: s.invoiceDate,
        amount: r0(s.finalAmount || 0),
        kg: r1(s.totalWeightKg || 0),
        items: (s.items || []).slice(0, 6).map((i) => i.productName),
      })),
      suggestion,
    };
  }

  async suggest(customerId: string, source?: string, invoiceId?: string) {
    const resume = await this.resume(customerId, source, invoiceId);
    return resume.suggestion;
  }

  async toProforma(customerId: string, recordedByName: string, body: { source?: string; invoiceId?: string }) {
    const customer = await this.customers.findById(customerId).exec();
    if (!customer) throw new NotFoundException('مشتری یافت نشد');
    const suggestion = await this.suggest(customerId, body.source, body.invoiceId);
    if (!suggestion.items.length) throw new BadRequestException('برای این مشتری کالای پیشنهادی نیست');
    const totalAmount = suggestion.items.reduce((s, i) => s + i.totalPrice, 0);
    const totalWeightKg = suggestion.items.reduce((s, i) => s + (i.weightKg || 0), 0);
    const dto: CreateInvoiceDto = {
      type: 'sale',
      saleType: (suggestion.saleType as CreateInvoiceDto['saleType']) || 'supermarket',
      customerId: String(customer._id),
      customerName: customer.name,
      customerPhone: customer.phoneNumber || '',
      items: suggestion.items,
      totalAmount,
      finalAmount: totalAmount,
      totalWeightKg,
      paymentMethod: 'credit',
      notes: `پیشنهاد پایش · ${suggestion.sourceLabel}`,
    };
    return this.proformas.create(dto, recordedByName);
  }

  private score(
    customer: { balance?: number; lastSaleAt?: Date; customerType?: string },
    sales: Sale[],
    rules: CustomerWatchSettings,
    windows: ReturnType<typeof crmWindows>,
    now: number,
  ) {
    const inRange = (from: string, to: string) => sales.filter((s) => {
      const k = dayKey(s.invoiceDate);
      return k >= from && k <= to;
    });
    const lastMonth = inRange(windows.lastMonth.from, windows.lastMonth.to);
    const thisMonth = inRange(windows.thisMonth.from, windows.thisMonth.to);
    const lastYear = inRange(windows.lastYear.from, windows.lastYear.to);
    const monthSales = lastMonth.length ? lastMonth : thisMonth;
    const monthAmount = monthSales.reduce((s, i) => s + (i.finalAmount || 0), 0);
    const monthKg = monthSales.reduce((s, i) => s + (i.totalWeightKg || 0), 0);
    const yearAmount = lastYear.reduce((s, i) => s + (i.finalAmount || 0), 0);
    const yearKg = lastYear.reduce((s, i) => s + (i.totalWeightKg || 0), 0);
    const last = sales[0];
    const lastAt = last ? new Date(last.invoiceDate).getTime() : customer.lastSaleAt ? new Date(customer.lastSaleAt).getTime() : 0;
    const quietDays = lastAt ? Math.max(0, Math.floor((now - lastAt) / DAY)) : 999;
    const dropN = sales.slice(0, rules.dropSizeInvoices);
    const dropAmount = dropN.length ? dropN.reduce((s, i) => s + (i.finalAmount || 0), 0) / dropN.length : 0;
    const dropKg = dropN.length ? dropN.reduce((s, i) => s + (i.totalWeightKg || 0), 0) / dropN.length : 0;
    const top = this.topProduct(sales);
    const grade = this.gradeOf(monthAmount, yearAmount, quietDays, rules);
    const recencyCap = grade === 'A' ? rules.quietDaysA : grade === 'B' ? rules.quietDaysB : grade === 'C' ? rules.quietDaysC : rules.quietDaysD;
    const reasons: string[] = [];
    const dropOff = last && dropAmount > 0 && (last.finalAmount || 0) < dropAmount * (1 - rules.dropSizeDropPercent / 100);
    if (rules.ruleQuiet && quietDays >= recencyCap) reasons.push(quietDays >= 900 ? 'هنوز خریدی ثبت نشده' : `${quietDays} روز بدون خرید`);
    if (rules.ruleChampion && (grade === 'A' || grade === 'B') && quietDays >= recencyCap) reasons.push('مشتری باارزش در خطر ریزش');
    if (rules.ruleDebt && (customer.balance || 0) > 0) reasons.push(`بدهی ${r0(customer.balance || 0).toLocaleString('fa-IR')} تومان`);
    if (rules.ruleDropOff && dropOff) reasons.push('آخرین سفارش از دراپ‌سایز خیلی کوچک‌تر است');
    const unique = [...new Set(reasons)];
    const score = this.rfmScore(quietDays, lastYear.length, yearAmount, rules);
    const action = unique.length
      ? unique.some((r) => r.startsWith('بدهی'))
        ? 'وصول و پیشنهاد سفارش'
        : 'تماس و فاکتور پیشنهادی'
      : grade === 'A'
        ? 'نگهداشت'
        : 'پایش دوره‌ای';
    return {
      grade,
      score,
      quietDays: quietDays >= 900 ? null : quietDays,
      monthAmount: r0(monthAmount),
      monthKg: r1(monthKg),
      monthInvoices: monthSales.length,
      yearAmount: r0(yearAmount),
      yearKg: r1(yearKg),
      yearInvoices: lastYear.length,
      dropAmount: r0(dropAmount),
      dropKg: r1(dropKg),
      topProductName: top?.name || '',
      topProductKg: r1(top?.kg || 0),
      reason: unique.join(' · '),
      action,
      lastInvoiceId: last ? String(last._id) : '',
      lastInvoiceNumber: last?.invoiceNumber || '',
    };
  }

  private gradeOf(month: number, year: number, quietDays: number, rules: CustomerWatchSettings): WatchGrade {
    let grade: WatchGrade = 'D';
    if (year >= rules.gradeAYearAmount || month >= rules.gradeAMonthAmount) grade = 'A';
    else if (year >= rules.gradeBYearAmount || month >= rules.gradeBMonthAmount) grade = 'B';
    else if (year >= rules.gradeCYearAmount || month >= rules.gradeCMonthAmount) grade = 'C';
    if (quietDays >= rules.quietDaysD && month <= 0 && grade !== 'A') return 'D';
    if (quietDays >= rules.quietDaysC && month <= 0 && grade === 'C') return 'D';
    return grade;
  }

  private rfmScore(quietDays: number, yearInvoices: number, yearAmount: number, rules: CustomerWatchSettings) {
    const r = quietDays <= rules.quietDaysA ? 5 : quietDays <= rules.quietDaysB ? 4 : quietDays <= rules.quietDaysC ? 3 : quietDays <= rules.quietDaysD ? 2 : 1;
    const f = yearInvoices >= 24 ? 5 : yearInvoices >= 12 ? 4 : yearInvoices >= 6 ? 3 : yearInvoices >= 2 ? 2 : yearInvoices >= 1 ? 1 : 0;
    const m = yearAmount >= rules.gradeAYearAmount ? 5 : yearAmount >= rules.gradeBYearAmount ? 4 : yearAmount >= rules.gradeCYearAmount ? 3 : yearAmount > 0 ? 2 : 0;
    return r * 8 + f * 6 + m * 6;
  }

  private topProduct(sales: Sale[]) {
    const map = new Map<string, { name: string; kg: number; amount: number; qty: number; unit: string; productId: string }>();
    for (const sale of sales) {
      for (const item of sale.items || []) {
        const id = item.productId || item.productName;
        const row = map.get(id) || { name: item.productName, kg: 0, amount: 0, qty: 0, unit: item.unit, productId: item.productId };
        row.kg += item.weightKg || 0;
        row.amount += item.totalPrice || 0;
        row.qty += item.quantity || 0;
        map.set(id, row);
      }
    }
    return [...map.values()].sort((a, b) => b.kg - a.kg || b.amount - a.amount)[0] || null;
  }

  private async buildSuggestion(
    customer: CustomerDocument,
    sales: Sale[],
    rules: CustomerWatchSettings,
    source = '',
    invoiceId = '',
  ) {
    const mode = source === 'last' || source === 'top' || source === 'invoice' ? source : rules.suggestMode;
    const catalog = await this.products.find().select('name unit sellPrice priceRetail priceSupermarket priceWholesale weightPerUnitKg stock').lean();
    const byId = new Map(catalog.map((p) => [String(p._id), p]));
    const priceOf = (p: any) => {
      const t = customer.customerType;
      if (t === 'wholesale' || t === 'distributor') return p.priceWholesale || p.sellPrice || 0;
      if (t === 'supermarket') return p.priceSupermarket || p.sellPrice || 0;
      return p.priceRetail || p.sellPrice || 0;
    };
    const last = invoiceId ? sales.find((s) => String(s._id) === invoiceId) : sales[0];
    const dropKg = sales.slice(0, rules.dropSizeInvoices).reduce((s, i) => s + (i.totalWeightKg || 0), 0) / Math.max(1, Math.min(rules.dropSizeInvoices, sales.length));
    let rawItems: Sale['items'] = [];
    let sourceLabel = 'ترکیب آخرین فاکتور و دراپ‌سایز';
    if (mode === 'invoice' && last) {
      rawItems = last.items || [];
      sourceLabel = `تکرار فاکتور ${last.invoiceNumber}`;
    } else if (mode === 'last' && last) {
      rawItems = last.items || [];
      sourceLabel = 'آخرین فاکتور با قیمت امروز';
    } else if (mode === 'top' || !last) {
      const ranked = new Map<string, { name: string; kg: number; qty: number; unit: string; productId: string }>();
      for (const sale of sales) {
        for (const item of sale.items || []) {
          const row = ranked.get(item.productId) || { name: item.productName, kg: 0, qty: 0, unit: item.unit, productId: item.productId };
          row.kg += item.weightKg || 0;
          row.qty += item.quantity || 0;
          ranked.set(item.productId, row);
        }
      }
      rawItems = [...ranked.values()]
        .sort((a, b) => b.kg - a.kg)
        .slice(0, rules.suggestTopProducts)
        .map((row) => ({
          productId: row.productId,
          productName: row.name,
          quantity: row.qty / Math.max(1, sales.length),
          unit: row.unit,
          unitPrice: 0,
          totalPrice: 0,
          weightKg: row.kg / Math.max(1, sales.length),
        }));
      sourceLabel = 'پرمصرف‌ترین کالاها';
    } else if (last) {
      rawItems = last.items || [];
      const lastKg = last.totalWeightKg || rawItems.reduce((s, i) => s + (i.weightKg || 0), 0);
      if (dropKg > 0 && lastKg > 0) {
        const factor = dropKg / lastKg;
        if (factor > 1.15 || factor < 0.7) {
          rawItems = rawItems.map((item) => ({
            ...item,
            quantity: r1((item.quantity || 0) * factor),
            weightKg: r1((item.weightKg || 0) * factor),
          }));
          sourceLabel = 'آخرین فاکتور هم‌مقیاس با دراپ‌سایز';
        }
      }
    }

    const items = rawItems
      .map((item) => {
        const product = byId.get(item.productId);
        const unitPrice = product ? priceOf(product) : item.unitPrice || 0;
        const quantity = Math.max(0.001, r1(item.quantity || 0));
        const wpu = product?.weightPerUnitKg || 0;
        const weightKg = r1(item.weightKg || (wpu ? quantity * wpu : 0));
        return {
          productId: item.productId,
          productName: product?.name || item.productName,
          quantity,
          unit: product?.unit || item.unit || 'عدد',
          unitPrice: r0(unitPrice),
          totalPrice: r0(unitPrice * quantity),
          weightKg,
          stock: product?.stock || 0,
        };
      })
      .filter((item) => item.unitPrice > 0 && item.quantity > 0);

    const saleType = customer.customerType === 'wholesale' || customer.customerType === 'distributor' ? 'wholesale' : customer.customerType === 'retail' ? 'retail' : 'supermarket';
    return {
      source: mode,
      sourceLabel,
      saleType,
      dropAmount: r0(sales.slice(0, rules.dropSizeInvoices).reduce((s, i) => s + (i.finalAmount || 0), 0) / Math.max(1, Math.min(rules.dropSizeInvoices, sales.length || 1))),
      dropKg: r1(dropKg || 0),
      items,
      totalAmount: items.reduce((s, i) => s + i.totalPrice, 0),
      totalWeightKg: r1(items.reduce((s, i) => s + (i.weightKg || 0), 0)),
    };
  }
}
