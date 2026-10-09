import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Invoice, InvoiceDocument } from '../invoices/schemas/invoice.schema';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { WatchDismissal, WatchDismissalDocument } from './schemas/watch-dismissal.schema';
import { AccountingService } from './accounting.service';
import { AuditService } from '../audit/audit.service';
import { InvoicesService } from '../invoices/invoices.service';
import { dayKey, isDoubleDiscount } from './fifo';
import type { FifoResult, SaleLine } from './fifo';

export type Severity = 'error' | 'warning' | 'info';

export interface Finding {
  id: string;
  rule: string;
  severity: Severity;
  title: string;
  detail: string;
  invoiceId?: string;
  invoiceNumber?: string;
  /** The earlier copy, when this finding is a duplicate. */
  otherInvoiceId?: string;
  otherInvoiceNumber?: string;
  invoiceType?: 'sale' | 'purchase';
  productId?: string;
  productName?: string;
  customerName?: string;
  date?: Date;
  /** Toman at stake (e.g. the loss, or the amount the totals are off by). */
  impact?: number;
  dismissed?: { by: string; note: string; at?: Date };
}

export interface HealthCheck {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
}

/** Rule catalogue shown in the UI; the watcher is deterministic, no language model involved. */
export const RULES: Record<string, { label: string; severity: Severity; help: string }> = {
  line_math: { label: 'ضرب ردیف غلط', severity: 'error', help: 'تعداد × فی با جمع ردیف نمی‌خواند' },
  invoice_sum: { label: 'جمع فاکتور غلط', severity: 'error', help: 'جمع ردیف‌ها با جمع کل فاکتور برابر نیست' },
  double_discount: {
    label: 'تخفیف دوبار کم شده',
    severity: 'warning',
    help: 'در انتقال از برنامه قدیم تخفیف دوبار کم شده؛ سود درست است ولی مبلغ نهایی فاکتور کمتر از پول دریافتی است',
  },
  final_amount: { label: 'مبلغ نهایی غلط', severity: 'error', help: 'جمع − تخفیف + کرایه مشتری با مبلغ نهایی نمی‌خواند' },
  payment_mismatch: { label: 'پرداخت ناهماهنگ', severity: 'error', help: 'پرداختی یا مانده نسیه با مبلغ فاکتور نمی‌خواند' },
  split_mismatch: { label: 'پرداخت ترکیبی ناقص', severity: 'warning', help: 'جمع روش‌های پرداخت ترکیبی با مبلغ نهایی برابر نیست' },
  credit_no_customer: { label: 'نسیه بدون مشتری', severity: 'error', help: 'فاکتور نسیه به حساب هیچ مشتری نرفته' },
  zero_price: { label: 'قیمت صفر', severity: 'error', help: 'ردیفی با قیمت صفر یا منفی' },
  zero_qty: { label: 'تعداد صفر', severity: 'error', help: 'ردیفی با تعداد صفر یا منفی' },
  unknown_product: { label: 'کالای ناشناخته', severity: 'warning', help: 'کالای ردیف در فهرست کالاها نیست' },
  missing_weight: { label: 'وزن نامشخص', severity: 'warning', help: 'وزن ردیف معلوم نیست؛ تعداد به‌جای کیلو حساب شد' },
  sale_loss_big: { label: 'زیان سنگین', severity: 'error', help: 'فروش بیش از ۲۰٪ زیر قیمت خرید — احتمالاً اشتباه تایپی' },
  sale_loss: { label: 'فروش زیر قیمت خرید', severity: 'warning', help: 'این ردیف با زیان فروخته شده' },
  sale_high_margin: { label: 'سود غیرعادی', severity: 'error', help: 'سود بیش از ۲۵٪ — احتمالاً قیمت یا مقدار اشتباه است' },
  price_outlier: { label: 'قیمت متفاوت با بقیه', severity: 'warning', help: 'قیمت هر کیلو با فروش‌های همان هفته همین کالا خیلی فرق دارد' },
  estimated_cost: { label: 'فروش بدون بار خرید', severity: 'warning', help: 'بیشتر از خرید ثبت‌شده فروخته شده؛ قیمت خرید تخمینی است' },
  duplicate: { label: 'فاکتور تکراری', severity: 'warning', help: 'فاکتوری با همان مشتری، روز، اقلام و مبلغ دوبار ثبت شده' },
  purchase_jump: { label: 'جهش قیمت خرید', severity: 'warning', help: 'قیمت خرید این بار بیش از ۱۵٪ با بار قبلی فرق دارد' },
  purchase_above_sell: { label: 'خرید گران‌تر از فروش', severity: 'warning', help: 'بهای تمام‌شده بار از میانگین فروش همان روزها بیشتر است' },
  future_date: { label: 'تاریخ آینده', severity: 'warning', help: 'تاریخ فاکتور بعد از امروز است' },
  big_discount: { label: 'تخفیف بزرگ', severity: 'info', help: 'تخفیف بیش از ۱۰٪ جمع فاکتور' },
  negative_stock: { label: 'موجودی منفی', severity: 'error', help: 'موجودی کالا زیر صفر است' },
  stock_mismatch: { label: 'اختلاف انبار', severity: 'warning', help: 'موجودی ثبت‌شده با «خرید − فروش» نمی‌خواند' },
  list_below_cost: { label: 'قیمت لیست زیر خرید', severity: 'warning', help: 'قیمت فروش فعلی کالا از آخرین بهای خرید کمتر است' },
};

const SCAN_INTERVAL_MS = 60_000;
const OUTLIER_WINDOW_DAYS = 7;
const OUTLIER_MIN_NEIGHBOURS = 4;
const OUTLIER_THRESHOLD = 0.15;
const PURCHASE_JUMP = 0.15;
const LOSS_WARN = -0.5;
const LOSS_ERROR = -20;
const HIGH_MARGIN = 25;
const DUPLICATE_WALKIN_MINUTES = 3;

const fa = (n: number, d = 0) => (Number.isFinite(n) ? n : 0).toLocaleString('fa-IR', { maximumFractionDigits: d });
const toman = (n: number) => `${fa(Math.round(n))} تومان`;
const tol = (v: number) => Math.max(5, Math.abs(v) * 0.001);
const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

interface RawInvoice {
  _id: any;
  invoiceNumber: string;
  type: 'sale' | 'purchase';
  invoiceDate: Date;
  createdAt?: Date;
  customerId?: any;
  customerName: string;
  items: { productId: string; productName: string; quantity: number; unit: string; unitPrice: number; totalPrice: number; weightKg?: number; secondaryQuantity?: number }[];
  totalAmount: number;
  discount?: number;
  finalAmount: number;
  paymentMethod?: string;
  splitDetails?: Record<string, number>;
  paidAmount?: number;
  creditAmount?: number;
  remainingDebt?: number;
  shippingPayer?: string;
  shippingCost?: number;
}

interface ScanResult {
  scannedAt: Date;
  durationMs: number;
  fifoAt: Date;
  invoices: number;
  saleLines: number;
  lots: number;
  findings: Finding[];
  health: HealthCheck[];
}

@Injectable()
export class ProfitWatchService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProfitWatchService.name);
  private last: ScanResult | null = null;
  private running: Promise<ScanResult> | null = null;
  private timer: NodeJS.Timeout | null = null;
  /** Error findings already reported to the audit log; null until the first scan seeds it. */
  private alerted: Set<string> | null = null;

  constructor(
    @InjectModel(Invoice.name) private invoiceModel: Model<InvoiceDocument>,
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    @InjectModel(WatchDismissal.name) private dismissalModel: Model<WatchDismissalDocument>,
    private readonly accounting: AccountingService,
    private readonly audit: AuditService,
    private readonly invoices: InvoicesService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => this.scan().catch((e) => this.logger.error(`Profit watch failed: ${e.message}`)), SCAN_INTERVAL_MS);
    setTimeout(() => this.scan().catch(() => undefined), 5_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Re-runs the rules only when invoices or products changed since the last scan (or when forced). */
  async scan(force = false): Promise<ScanResult> {
    if (this.running) return this.running;
    this.running = (async () => {
      try {
        await this.invoices.repairFactoryPurchasePrices().catch((e) => this.logger.warn(`Factory price repair: ${e.message}`));
        const f = await this.accounting.fifo();
        if (!force && this.last && this.last.fifoAt === f.computedAt) return this.last;
        const started = Date.now();
        const [invoices, products] = await Promise.all([
          this.invoiceModel
            .find()
            .select('invoiceNumber type invoiceDate createdAt customerId customerName items totalAmount discount finalAmount paymentMethod splitDetails paidAmount creditAmount remainingDebt shippingPayer shippingCost')
            .lean<RawInvoice[]>(),
          this.productModel.find().select('name unit weightPerUnitKg stock isActive sellPrice priceRetail priceSupermarket priceWholesale').lean(),
        ]);
        const { findings, health } = this.evaluate(f, invoices, products as any[]);
        this.last = {
          scannedAt: new Date(),
          durationMs: Date.now() - started,
          fifoAt: f.computedAt,
          invoices: invoices.length,
          saleLines: f.saleLines.length,
          lots: f.lots.length,
          findings,
          health,
        };
        await this.alertNew(findings);
        return this.last;
      } finally {
        this.running = null;
      }
    })();
    return this.running;
  }

  private async alertNew(findings: Finding[]) {
    const errors = findings.filter((x) => x.severity === 'error');
    if (!this.alerted) {
      this.alerted = new Set(errors.map((x) => x.id));
      return;
    }
    const dismissed = new Set((await this.dismissalModel.find().select('findingId').lean()).map((d) => d.findingId));
    const fresh = errors.filter((x) => !this.alerted!.has(x.id) && !dismissed.has(x.id));
    errors.forEach((x) => this.alerted!.add(x.id));
    if (!fresh.length) return;
    await this.audit.record({
      action: 'alert',
      entity: 'profitWatch',
      entityLabel: 'نگهبان سود',
      entityId: fresh[0].invoiceId || '',
      title: `نگهبان سود: ${fa(fresh.length)} مورد مشکوک جدید${fresh[0].invoiceNumber ? ` (${fresh[0].invoiceNumber})` : ''}`,
      userFullName: 'نگهبان سود (خودکار)',
      userRole: 'system',
      body: fresh.slice(0, 20).map((x) => ({ rule: x.rule, title: x.title, detail: x.detail, invoiceNumber: x.invoiceNumber })),
    });
  }

  async report(severity?: string) {
    const r = await this.scan();
    const dismissals = await this.dismissalModel.find().lean();
    const byId = new Map(dismissals.map((d) => [d.findingId, d]));
    const all = r.findings.map((x) => {
      const d = byId.get(x.id);
      return d ? { ...x, dismissed: { by: d.byName, note: d.note, at: d.createdAt } } : x;
    });
    const open = all.filter((x) => !x.dismissed);
    const count = (s: Severity) => open.filter((x) => x.severity === s).length;
    const byRule: Record<string, number> = {};
    for (const x of open) byRule[x.rule] = (byRule[x.rule] ?? 0) + 1;
    return {
      status: {
        scannedAt: r.scannedAt,
        durationMs: r.durationMs,
        invoices: r.invoices,
        saleLines: r.saleLines,
        lots: r.lots,
        intervalSec: SCAN_INTERVAL_MS / 1000,
      },
      counts: { error: count('error'), warning: count('warning'), info: count('info'), dismissed: all.length - open.length },
      impact: Math.round(open.filter((x) => x.severity === 'error').reduce((s, x) => s + Math.abs(x.impact ?? 0), 0)),
      byRule,
      health: r.health,
      rules: RULES,
      findings: severity === 'dismissed' ? all.filter((x) => x.dismissed) : severity ? open.filter((x) => x.severity === severity) : open,
    };
  }

  async dismiss(findingId: string, note: string, byName: string) {
    await this.dismissalModel.updateOne({ findingId }, { $set: { findingId, note: note || '', byName } }, { upsert: true });
    return { ok: true };
  }

  async restore(findingId: string) {
    await this.dismissalModel.deleteOne({ findingId });
    return { ok: true };
  }

  // ---------------------------------------------------------------------------
  // Rules
  // ---------------------------------------------------------------------------

  private evaluate(f: FifoResult, invoices: RawInvoice[], products: any[]) {
    const out: Finding[] = [];
    const productById = new Map(products.map((p) => [String(p._id), p]));
    const now = Date.now();

    const push = (rule: string, x: Omit<Finding, 'rule' | 'severity' | 'title'> & { severity?: Severity; title?: string }) =>
      out.push({ ...x, rule, severity: x.severity ?? RULES[rule].severity, title: x.title ?? RULES[rule].label });

    const seen = new Map<string, RawInvoice>();
    for (const inv of invoices) {
      const id = String(inv._id);
      const isSale = inv.type === 'sale';
      const ref = { invoiceId: id, invoiceNumber: inv.invoiceNumber, invoiceType: inv.type, customerName: inv.customerName, date: inv.invoiceDate };
      const items = inv.items ?? [];

      items.forEach((it, idx) => {
        const lineRef = { ...ref, productId: String(it.productId), productName: it.productName };
        const product = productById.get(String(it.productId));
        if (!(it.quantity > 0)) push('zero_qty', { ...lineRef, id: `zero_qty:${id}:${idx}`, detail: `ردیف ${fa(idx + 1)}: تعداد ${fa(it.quantity ?? 0, 3)}` });
        if (it.quantity > 0 && (!(it.unitPrice > 0) || !(it.totalPrice > 0))) {
          push('zero_price', { ...lineRef, id: `zero_price:${id}:${idx}`, detail: `ردیف ${fa(idx + 1)}: فی ${toman(it.unitPrice ?? 0)}، جمع ${toman(it.totalPrice ?? 0)}` });
        }
        if (it.quantity > 0 && it.unitPrice > 0) {
          // Lines priced per kg multiply by the weight instead of the unit count.
          const candidates = [it.quantity * it.unitPrice, (it.weightKg || 0) * it.unitPrice, (it.secondaryQuantity || 0) * it.unitPrice];
          const off = Math.min(...candidates.map((c) => Math.abs(c - (it.totalPrice || 0))));
          if (off > tol(it.totalPrice || 0)) {
            push('line_math', {
              ...lineRef,
              id: `line_math:${id}:${idx}`,
              impact: off,
              detail: `${fa(it.quantity, 3)} ${it.unit} × ${toman(it.unitPrice)} = ${toman(it.quantity * it.unitPrice)} ولی جمع ردیف ${toman(it.totalPrice)} ثبت شده`,
            });
          }
        }
        if (!product) {
          push('unknown_product', { ...lineRef, id: `unknown_product:${id}:${idx}`, detail: `«${it.productName}» در فهرست کالاها پیدا نشد؛ سود و انبار آن دقیق نیست` });
        } else if (!(it.weightKg && it.weightKg > 0) && !product.weightPerUnitKg && product.unit !== 'کیلوگرم') {
          push('missing_weight', {
            ...lineRef,
            id: `missing_weight:${id}:${idx}`,
            detail: `وزن هر ${product.unit} «${product.name}» در کالا ثبت نشده؛ ${fa(it.quantity, 3)} ${it.unit} به‌عنوان ${fa(it.quantity, 3)} کیلو حساب شد`,
          });
        }
      });

      const sumItems = items.reduce((s, it) => s + (it.totalPrice || 0), 0);
      const discount = inv.discount || 0;
      const shipping = isSale && inv.shippingPayer === 'customer' ? inv.shippingCost || 0 : 0;
      const expectedFinal = Math.max(0, (inv.totalAmount || 0) - discount) + shipping;
      const doubleDiscount = isDoubleDiscount(inv, sumItems);

      if (doubleDiscount) {
        push('double_discount', {
          ...ref,
          id: `double_discount:${id}`,
          impact: discount,
          detail: `جمع ردیف‌ها ${toman(sumItems)}، مشتری ${toman(inv.totalAmount)} پرداخته ولی مبلغ نهایی ${toman(inv.finalAmount)} ثبت شده (تخفیف ${toman(discount)} دوبار کم شده). سود درست حساب می‌شود؛ فقط مبلغ نهایی فاکتور کم است.`,
        });
      } else {
        if (items.length && Math.abs(sumItems - (inv.totalAmount || 0)) > 5) {
          push('invoice_sum', { ...ref, id: `invoice_sum:${id}`, impact: sumItems - inv.totalAmount, detail: `جمع ردیف‌ها ${toman(sumItems)} ولی جمع فاکتور ${toman(inv.totalAmount)}` });
        }
      }

      if (!doubleDiscount && Math.abs(expectedFinal - (inv.finalAmount || 0)) > 5) {
        push('final_amount', {
          ...ref,
          id: `final_amount:${id}`,
          impact: (inv.finalAmount || 0) - expectedFinal,
          detail: `${toman(inv.totalAmount)} − تخفیف ${toman(discount)}${shipping ? ` + کرایه ${toman(shipping)}` : ''} = ${toman(expectedFinal)} ولی مبلغ نهایی ${toman(inv.finalAmount)}`,
        });
      }
      if (discount > 0 && inv.totalAmount > 0 && discount / inv.totalAmount > 0.1) {
        push('big_discount', { ...ref, id: `big_discount:${id}`, impact: discount, detail: `تخفیف ${toman(discount)} یعنی ${fa((discount / inv.totalAmount) * 100, 1)}٪ جمع فاکتور` });
      }

      if (isSale) {
        const final = inv.finalAmount || 0;
        const remaining = inv.remainingDebt ?? 0;
        const paid = inv.paidAmount ?? 0;
        if (remaining < -1 || remaining > final + tol(final) || paid > final + tol(final) || paid < -1) {
          push('payment_mismatch', { ...ref, id: `payment_mismatch:${id}`, impact: Math.max(paid - final, remaining - final, 0), detail: `مبلغ ${toman(final)}، پرداختی ${toman(paid)}، مانده ${toman(remaining)}` });
        }
        if ((inv.creditAmount ?? 0) > 0 && !inv.customerId) {
          push('credit_no_customer', { ...ref, id: `credit_no_customer:${id}`, impact: inv.creditAmount, detail: `${toman(inv.creditAmount!)} نسیه ثبت شده ولی به حساب مشتری وصل نیست` });
        }
      }
      if (inv.paymentMethod === 'split' && inv.splitDetails) {
        const s = ['pos', 'cash', 'transfer', 'cheque', 'credit'].reduce((a, k) => a + (Number(inv.splitDetails![k]) || 0), 0);
        if (Math.abs(s - (inv.finalAmount || 0)) > tol(inv.finalAmount || 0)) {
          push('split_mismatch', { ...ref, id: `split_mismatch:${id}`, impact: s - inv.finalAmount, detail: `جمع روش‌ها ${toman(s)} ولی مبلغ نهایی ${toman(inv.finalAmount)}` });
        }
      }

      if (new Date(inv.invoiceDate).getTime() > now + 36 * 3600_000) {
        push('future_date', { ...ref, id: `future_date:${id}`, detail: `تاریخ فاکتور ${dayKey(inv.invoiceDate)} است` });
      }

      const signature = [
        inv.type,
        inv.customerName,
        dayKey(inv.invoiceDate),
        Math.round(inv.finalAmount || 0),
        items.map((it) => `${it.productId}:${it.quantity}:${it.unitPrice}`).sort().join(','),
      ].join('|');
      const twin = seen.get(signature);
      // Walk-in customers often buy the same bag several times a day; only a near-instant repeat is a double entry.
      const gapMin = twin?.createdAt && inv.createdAt ? Math.abs(new Date(inv.createdAt).getTime() - new Date(twin.createdAt).getTime()) / 60000 : Infinity;
      const isDuplicate = twin && items.length && (inv.customerId ? true : gapMin <= DUPLICATE_WALKIN_MINUTES);
      if (isDuplicate) {
        const clock = (d?: Date) =>
          d
            ? new Date(d).toLocaleString('fa-IR', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit' })
            : '';
        const names = items.map((it) => it.productName).filter(Boolean).slice(0, 4).join('، ');
        push('duplicate', {
          ...ref,
          id: `duplicate:${id}`,
          impact: inv.finalAmount,
          otherInvoiceId: String(twin!._id),
          otherInvoiceNumber: twin!.invoiceNumber,
          detail: `نسخهٔ اضافه ${inv.invoiceNumber} ساعت ${clock(inv.createdAt)} است. نسخهٔ اول ${twin!.invoiceNumber} ساعت ${clock(twin!.createdAt)} است. مشتری ${inv.customerName || '—'}، مبلغ ${toman(inv.finalAmount)}${names ? `، کالا: ${names}` : ''}.`,
        });
      }
      if (!twin) seen.set(signature, inv);
    }

    this.saleLineRules(f, push);
    this.purchaseRules(f, push);
    this.productRules(f, products, push);

    out.sort(
      (a, b) =>
        SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
        new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime(),
    );
    return { findings: out, health: this.health(f, invoices) };
  }

  private saleLineRules(f: FifoResult, push: (rule: string, x: any) => void) {
    const occurrence = new Map<string, number>();
    const lineId = (l: SaleLine) => {
      const k = `${l.invoiceId}:${l.productId}`;
      const n = occurrence.get(k) ?? 0;
      occurrence.set(k, n + 1);
      return `${k}:${n}`;
    };
    const byProduct = new Map<string, { l: SaleLine; id: string; perKg: number; t: number }[]>();

    for (const l of f.saleLines) {
      const id = lineId(l);
      const ref = { invoiceId: l.invoiceId, invoiceNumber: l.invoiceNumber, invoiceType: 'sale', productId: l.productId, productName: l.productName, customerName: l.customerName, date: l.date };
      if (l.estimatedKg > 0.01) {
        push('estimated_cost', {
          ...ref,
          id: `estimated_cost:${id}`,
          detail:
            l.fulfillment === 'factory'
              ? 'قیمت کارخانه این ردیف وارد نشده؛ سود از روی آخرین خرید مغازه تخمین زده شد'
              : `${fa(l.estimatedKg, 1)} کیلو از ${fa(l.kg, 1)} کیلو قبل از این فروش بار خرید ندارد. با قیمت خریدهای بعدی حساب نمی‌شود.`,
        });
      }
      if (l.kg <= 0 || l.revenue <= 0) continue;
      const perKg = l.revenue / l.kg;
      if (!byProduct.has(l.productId)) byProduct.set(l.productId, []);
      byProduct.get(l.productId)!.push({ l, id, perKg, t: new Date(l.date).getTime() });

      if (l.cost <= 0) continue;
      const margin = (l.profit / l.revenue) * 100;
      const costPerKg = l.cost / l.kg;
      const costPerUnit = l.quantity ? l.cost / l.quantity : 0;
      const sellPerUnit = l.quantity ? l.revenue / l.quantity : 0;
      const unitName = l.unit && l.unit !== 'کیلوگرم' ? l.unit : '';
      const lots = l.consumptions
        .filter((c) => c.lotInvoiceNumber)
        .map((c) => c.lotInvoiceNumber)
        .filter((n, i, a) => a.indexOf(n) === i)
        .slice(0, 3);
      const where = l.fulfillment === 'factory' ? 'از کارخانه — ' : '';
      const fromLot = lots.length ? ` از فاکتور ${lots.join('، ')}` : '';
      const rates = [
        unitName ? `فروش هر ${unitName} ${toman(sellPerUnit)}` : '',
        `فروش هر کیلو ${toman(perKg)}`,
        unitName ? `خرید هر ${unitName} ${toman(costPerUnit)}` : '',
        `خرید هر کیلو ${toman(costPerKg)}`,
      ]
        .filter(Boolean)
        .join('، ');
      const detail = `${where}${rates}${fromLot} — ${margin >= 0 ? 'سود' : 'زیان'} ${fa(Math.abs(margin), 1)}٪ (${toman(l.profit)})`;
      if (margin < LOSS_ERROR) push('sale_loss_big', { ...ref, id: `sale_loss_big:${id}`, impact: l.profit, detail });
      else if (margin < LOSS_WARN) push('sale_loss', { ...ref, id: `sale_loss:${id}`, impact: l.profit, detail });
      else if (margin > HIGH_MARGIN && l.fulfillment !== 'factory') push('sale_high_margin', { ...ref, id: `sale_high_margin:${id}`, impact: l.profit, detail });
    }

    const windowMs = OUTLIER_WINDOW_DAYS * 86400000;
    for (const rows of byProduct.values()) {
      for (const r of rows) {
        const near = rows
          .filter((o) => o.l.invoiceId !== r.l.invoiceId && o.l.fulfillment === r.l.fulfillment && Math.abs(o.t - r.t) <= windowMs)
          .map((o) => o.perKg);
        if (near.length < OUTLIER_MIN_NEIGHBOURS) continue;
        const med = median(near);
        const dev = med ? (r.perKg - med) / med : 0;
        if (Math.abs(dev) <= OUTLIER_THRESHOLD) continue;
        push('price_outlier', {
          invoiceId: r.l.invoiceId,
          invoiceNumber: r.l.invoiceNumber,
          invoiceType: 'sale',
          productId: r.l.productId,
          productName: r.l.productName,
          customerName: r.l.customerName,
          date: r.l.date,
          id: `price_outlier:${r.id}`,
          impact: (r.perKg - med) * r.l.kg,
          detail: `هر کیلو ${toman(r.perKg)} فروخته شده؛ میانه ${fa(near.length)} فروش هفته اطراف ${toman(med)} است (${dev > 0 ? '+' : '−'}${fa(Math.abs(dev) * 100, 1)}٪)`,
        });
      }
    }
  }

  private purchaseRules(f: FifoResult, push: (rule: string, x: any) => void) {
    for (const c of f.priceChanges) {
      const pct = c.oldCost ? (c.newCost - c.oldCost) / c.oldCost : 0;
      if (Math.abs(pct) <= PURCHASE_JUMP) continue;
      push('purchase_jump', {
        id: `purchase_jump:${c.invoiceId}:${c.productId}`,
        invoiceId: c.invoiceId,
        invoiceNumber: c.invoiceNumber,
        invoiceType: 'purchase',
        productId: c.productId,
        productName: c.productName,
        date: c.date,
        detail: `بهای هر کیلو از ${toman(c.oldCost)} به ${toman(c.newCost)} رسید (${pct > 0 ? '+' : '−'}${fa(Math.abs(pct) * 100, 1)}٪) — قیمت خرید را چک کنید`,
      });
    }

    const salesByProduct = new Map<string, SaleLine[]>();
    for (const l of f.saleLines) {
      if (l.kg <= 0) continue;
      if (!salesByProduct.has(l.productId)) salesByProduct.set(l.productId, []);
      salesByProduct.get(l.productId)!.push(l);
    }
    const span = 14 * 86400000;
    for (const lot of f.lots) {
      const t = new Date(lot.date).getTime();
      const near = (salesByProduct.get(lot.productId) ?? []).filter((l) => Math.abs(new Date(l.date).getTime() - t) <= span);
      const kg = near.reduce((s, l) => s + l.kg, 0);
      if (kg <= 0) continue;
      const sell = near.reduce((s, l) => s + l.revenue, 0) / kg;
      if (lot.costPerKg <= sell) continue;
      push('purchase_above_sell', {
        id: `purchase_above_sell:${lot.id}`,
        invoiceId: lot.invoiceId,
        invoiceNumber: lot.invoiceNumber,
        invoiceType: 'purchase',
        productId: lot.productId,
        productName: lot.productName,
        customerName: lot.supplier,
        date: lot.date,
        impact: (sell - lot.costPerKg) * lot.kgIn,
        detail: `بهای تمام‌شده هر کیلو ${toman(lot.costPerKg)} ولی میانگین فروش دو هفته اطراف ${toman(sell)}`,
      });
    }
  }

  private productRules(f: FifoResult, products: any[], push: (rule: string, x: any) => void) {
    const purchasedQty = new Map<string, number>();
    const soldQty = new Map<string, number>();
    for (const inv of f.invoices) {
      const purchase = inv.type === 'purchase';
      if (inv.fulfillment === 'factory') continue;
      for (const it of inv.items) {
        if (purchase && it.received === false) continue;
        if (!it.productId) continue;
        const m = purchase ? purchasedQty : soldQty;
        m.set(it.productId, (m.get(it.productId) ?? 0) + (it.quantity || 0));
      }
    }

    for (const p of products) {
      if (p.isActive === false) continue;
      const pid = String(p._id);
      const ref = { productId: pid, productName: p.name };
      const wpu = p.weightPerUnitKg || (p.unit === 'کیلوگرم' ? 1 : 0);
      if ((p.stock ?? 0) < 0) {
        push('negative_stock', { ...ref, id: `negative_stock:${pid}`, detail: `موجودی «${p.name}» ${fa(p.stock, 2)} ${p.unit} است` });
      }
      if (purchasedQty.has(pid) || soldQty.has(pid)) {
        const expected = (purchasedQty.get(pid) ?? 0) - (soldQty.get(pid) ?? 0);
        const actual = p.stock ?? 0;
        const gap = actual - expected;
        if (Math.abs(gap) >= 0.05) {
          push('stock_mismatch', {
            ...ref,
            id: `stock_mismatch:${pid}:${Math.round(gap)}`,
            impact: gap * (wpu || 1) * (f.lastCost.get(pid) ?? 0),
            detail: `جمع خرید منهای فروش از آریو ${fa(expected, 2)} ${p.unit || 'واحد'} است ولی موجودی ثبت‌شده ${fa(actual, 2)} است (${gap > 0 ? 'اضافه' : 'کسری'} ${fa(Math.abs(gap), 2)})`,
          });
        }
      }
      const last = f.lastCost.get(pid);
      const lowest = [p.priceWholesale, p.priceSupermarket, p.priceRetail || p.sellPrice].filter((v) => v > 0);
      if (wpu > 0 && last && lowest.length) {
        const minPerKg = Math.min(...lowest) / wpu;
        if (minPerKg < last) {
          push('list_below_cost', {
            ...ref,
            id: `list_below_cost:${pid}:${Math.round(minPerKg)}:${Math.round(last)}`,
            impact: (minPerKg - last) * wpu,
            detail: `کمترین قیمت فروش هر کیلو ${toman(minPerKg)} ولی آخرین بهای خرید ${toman(last)}`,
          });
        }
      }
    }
  }

  /** Self-checks of the FIFO engine itself, so the profit figures can be trusted. */
  private health(f: FifoResult, invoices: RawInvoice[]): HealthCheck[] {
    const badLots = f.lots.filter((l) => Math.abs(l.kgIn - l.kgSold - l.kgLeft) > 0.01);
    const badLines = f.saleLines.filter((l) => Math.abs(l.kg - l.consumptions.reduce((s, c) => s + c.kg, 0)) > 0.01);

    const revenueByInvoice = new Map<string, number>();
    for (const l of f.saleLines) revenueByInvoice.set(l.invoiceId, (revenueByInvoice.get(l.invoiceId) ?? 0) + l.revenue);
    // Money actually received (without delivery); for double-discounted imports that is totalAmount.
    const offRevenue = invoices.filter((i) => {
      if (i.type !== 'sale' || !(i.totalAmount > 0)) return false;
      const ship = i.shippingPayer === 'customer' ? i.shippingCost || 0 : 0;
      const sumItems = (i.items ?? []).reduce((s, it) => s + (it.totalPrice || 0), 0);
      const received = isDoubleDiscount(i, sumItems) ? i.totalAmount : i.finalAmount - ship;
      return Math.abs((revenueByInvoice.get(String(i._id)) ?? 0) - received) > Math.max(2, received * 0.0002);
    });

    const profitLines = f.saleLines.reduce((s, l) => s + l.profit, 0);
    const profitInvoices = [...f.invoiceProfit.values()].reduce((s, p) => s + p.profit, 0);
    const estimatedKg = f.saleLines.reduce((s, l) => s + l.estimatedKg, 0);
    const soldKg = f.saleLines.reduce((s, l) => s + l.kg, 0);

    return [
      {
        id: 'lot_balance',
        label: 'تراز هر بار خرید (ورودی = فروخته + مانده)',
        ok: !badLots.length,
        detail: badLots.length ? `${fa(badLots.length)} بار تراز نیست` : `همه ${fa(f.lots.length)} بار تراز است`,
      },
      {
        id: 'sale_consumed',
        label: 'وزن هر فروش دقیقاً از بارها کم شده',
        ok: !badLines.length,
        detail: badLines.length ? `${fa(badLines.length)} ردیف ناهماهنگ` : `${fa(f.saleLines.length)} ردیف فروش بررسی شد`,
      },
      {
        id: 'revenue_reconcile',
        label: 'فروش در سود = مبلغ فاکتورها (بدون کرایه)',
        ok: !offRevenue.length,
        detail: offRevenue.length
          ? `${fa(offRevenue.length)} فاکتور فروش: ${offRevenue.slice(0, 5).map((i) => i.invoiceNumber).join('، ')}`
          : 'همه فاکتورهای فروش با سود تطبیق دارند',
      },
      {
        id: 'profit_sum',
        label: 'جمع سود ردیف‌ها = جمع سود فاکتورها',
        ok: Math.abs(profitLines - profitInvoices) < 1,
        detail: `${toman(profitLines)}`,
      },
      {
        id: 'cost_coverage',
        label: 'قیمت خرید همه فروش‌ها از بار واقعی آمده',
        ok: estimatedKg < 0.01,
        detail: estimatedKg < 0.01 ? 'هیچ فروشی تخمینی نیست' : `${fa(estimatedKg, 1)} کیلو از ${fa(soldKg, 1)} کیلو فروش قیمت خرید تخمینی دارد`,
      },
    ];
  }
}
