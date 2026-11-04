import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Invoice, InvoiceDocument } from '../invoices/schemas/invoice.schema';
import { PerformanceSnapshot, PerformanceSnapshotDocument } from './schemas/performance-snapshot.schema';
import { SettingsService } from '../settings/settings.service';
import { goodsAmount } from './fifo';
import { dayKey, ymdToJalali } from '../common/jalali';

type Grain = 'day' | 'month' | 'year';
type Bucket = {
  purchaseAmount: number;
  purchaseKg: number;
  purchaseCount: number;
  saleAmount: number;
  saleKg: number;
  saleCount: number;
  profitAmount: number;
  paidIn: number;
  paidOut: number;
};

const empty = (): Bucket => ({
  purchaseAmount: 0,
  purchaseKg: 0,
  purchaseCount: 0,
  saleAmount: 0,
  saleKg: 0,
  saleCount: 0,
  profitAmount: 0,
  paidIn: 0,
  paidOut: 0,
});

const r0 = (n: number) => Math.round(n || 0);
const r1 = (n: number) => Math.round((n || 0) * 10) / 10;
const pad = (n: number) => String(n).padStart(2, '0');
const CHECK_MS = 60 * 1000;
const tehranClock = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

const nextDay = (ymd: string) => {
  const d = new Date(`${ymd}T12:00:00+03:30`);
  d.setDate(d.getDate() + 1);
  return dayKey(d);
};

const prevDay = (ymd: string) => {
  const d = new Date(`${ymd}T12:00:00+03:30`);
  d.setDate(d.getDate() - 1);
  return dayKey(d);
};

const monthOf = (ymd: string) => {
  const j = ymdToJalali(ymd);
  return `${j.jy}-${pad(j.jm)}`;
};

const yearOf = (ymd: string) => String(ymdToJalali(ymd).jy);

const add = (into: Bucket, extra: Partial<Bucket>) => {
  for (const key of Object.keys(extra) as (keyof Bucket)[]) into[key] += extra[key] || 0;
};

const kgOf = (inv: { items?: { weightKg?: number; secondaryQuantity?: number }[]; totalWeightKg?: number }) => {
  const lines = (inv.items || []).reduce((s, it) => s + (Number(it.weightKg) || Number(it.secondaryQuantity) || 0), 0);
  return lines > 0 ? lines : Number(inv.totalWeightKg) || 0;
};

const finish = (b: Bucket, prev?: Partial<Bucket> | null) => {
  const avgBuyPerKg = b.purchaseKg > 0 ? r0(b.purchaseAmount / b.purchaseKg) : 0;
  const avgSellPerKg = b.saleKg > 0 ? r0(b.saleAmount / b.saleKg) : 0;
  const growth = (now: number, then?: number) => (then && then > 0 ? Math.round(((now - then) / then) * 1000) / 10 : 0);
  return {
    purchaseAmount: r0(b.purchaseAmount),
    purchaseKg: r1(b.purchaseKg),
    purchaseCount: b.purchaseCount || 0,
    saleAmount: r0(b.saleAmount),
    saleKg: r1(b.saleKg),
    saleCount: b.saleCount || 0,
    profitAmount: r0(b.profitAmount),
    paidIn: r0(b.paidIn),
    paidOut: r0(b.paidOut),
    avgBuyPerKg,
    avgSellPerKg,
    saleGrowth: growth(b.saleAmount, prev?.saleAmount),
    purchaseGrowth: growth(b.purchaseAmount, prev?.purchaseAmount),
    profitGrowth: growth(b.profitAmount, prev?.profitAmount),
  };
};

const clockNow = () => tehranClock.format(new Date()).replace(' ', '');

export const normalizeRunAt = (raw?: string) => {
  const t = String(raw || '23:00').replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[^\d:]/g, '');
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return '23:00';
  const h = Math.min(23, Math.max(0, Number(m[1])));
  const min = Math.min(59, Math.max(0, Number(m[2])));
  return `${pad(h)}:${pad(min)}`;
};

@Injectable()
export class PerformanceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PerformanceService.name);
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<unknown> | null = null;

  constructor(
    @InjectModel(Invoice.name) private invoiceModel: Model<InvoiceDocument>,
    @InjectModel(PerformanceSnapshot.name) private snapModel: Model<PerformanceSnapshotDocument>,
    private readonly settings: SettingsService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => this.tick().catch((e) => this.logger.warn(e.message)), CHECK_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async state() {
    return this.snapModel.findOne({ grain: 'meta', key: 'state' }).lean();
  }

  async report() {
    const [meta, days, months, years, settings] = await Promise.all([
      this.state(),
      this.snapModel.find({ grain: 'day' }).sort({ key: 1 }).lean(),
      this.snapModel.find({ grain: 'month' }).sort({ key: 1 }).lean(),
      this.snapModel.find({ grain: 'year' }).sort({ key: 1 }).lean(),
      this.settings.get(),
    ]);
    const today = dayKey(new Date());
    return {
      rebuilt: !!meta?.rebuiltAt,
      auto: !!meta?.auto,
      rebuiltAt: meta?.rebuiltAt || null,
      lastComputedDay: meta?.lastComputedDay || null,
      runAt: normalizeRunAt((settings as any).performanceRunAt),
      computing: !!this.running,
      today: days.find((d) => d.key === today) || null,
      thisMonth: months.find((d) => d.key === monthOf(today)) || null,
      thisYear: years.find((d) => d.key === yearOf(today)) || null,
      days,
      months,
      years,
    };
  }

  async rebuild() {
    return this.run(() => this.computeAll());
  }

  /** Recalculate today (and any missed days) only. Does not scan the whole history. */
  async refresh() {
    return this.run(() => this.computeRecent());
  }

  private async tick() {
    const meta = await this.state();
    if (!meta?.auto) return;
    const today = dayKey(new Date());
    if (meta.lastNightlyDay === today) return;
    const settings = await this.settings.get();
    if (clockNow() < normalizeRunAt((settings as any).performanceRunAt)) return;
    await this.refresh();
    await this.snapModel.updateOne({ grain: 'meta', key: 'state' }, { $set: { lastNightlyDay: today } });
  }

  private async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.running) return this.running as Promise<T>;
    this.running = fn().finally(() => {
      this.running = null;
    });
    return this.running as Promise<T>;
  }

  private bounds(ymd: string) {
    return { from: new Date(`${ymd}T00:00:00+03:30`), to: new Date(`${nextDay(ymd)}T00:00:00+03:30`) };
  }

  private applyInvoice(inv: any, ymd: string, bucket: Bucket) {
    const when = dayKey(inv.invoiceDate || inv.createdAt || new Date());
    const paidDay = inv.paidAt ? dayKey(inv.paidAt) : when;
    const kg = kgOf(inv);
    if (inv.type === 'purchase') {
      if (when === ymd) add(bucket, { purchaseAmount: Math.max(0, Math.round(Number(inv.finalAmount) || 0)), purchaseKg: kg, purchaseCount: 1 });
      if (paidDay === ymd) {
        const paid = Math.max(0, Math.round(Number(inv.paidAmount) || 0));
        if (paid > 0) add(bucket, { paidOut: paid });
      }
    } else {
      if (when === ymd) add(bucket, { saleAmount: goodsAmount(inv), saleKg: kg, saleCount: 1, profitAmount: Math.round(Number(inv.profitAmount) || 0) });
      if (paidDay === ymd) {
        const paid = Math.max(0, Math.round(Number(inv.paidAmount) || 0));
        if (paid > 0) add(bucket, { paidIn: paid });
      }
    }
  }

  private async invoicesTouching(from: string, to: string) {
    const start = this.bounds(from).from;
    const end = this.bounds(to).to;
    return this.invoiceModel
      .find({
        type: { $in: ['sale', 'purchase'] },
        $or: [{ invoiceDate: { $gte: start, $lt: end } }, { paidAt: { $gte: start, $lt: end } }],
      })
      .select('type invoiceDate paidAt paidAmount finalAmount totalAmount discount shippingPayer shippingCost items profitAmount totalWeightKg createdAt')
      .lean();
  }

  private async writeDay(ymd: string, bucket: Bucket) {
    const prev = await this.snapModel.findOne({ grain: 'day', key: prevDay(ymd) }).lean();
    await this.snapModel.updateOne({ grain: 'day', key: ymd }, { $set: { grain: 'day', key: ymd, ...finish(bucket, prev) } }, { upsert: true });
  }

  private async rollup(grain: Grain, key: string, days: Array<Bucket & { key: string }>) {
    const bucket = empty();
    const match = grain === 'month' ? (ymd: string) => monthOf(ymd) === key : (ymd: string) => yearOf(ymd) === key;
    for (const day of days) if (match(day.key)) add(bucket, day);
    const siblings = await this.snapModel.find({ grain, key: { $lt: key } }).sort({ key: -1 }).limit(1).lean();
    await this.snapModel.updateOne({ grain, key }, { $set: { grain, key, ...finish(bucket, siblings[0]) } }, { upsert: true });
  }

  private async saveDays(from: string, to: string, buckets: Map<string, Bucket>) {
    const months = new Set<string>();
    const years = new Set<string>();
    for (let ymd = from; ymd <= to; ymd = nextDay(ymd)) {
      await this.writeDay(ymd, buckets.get(ymd) ?? empty());
      months.add(monthOf(ymd));
      years.add(yearOf(ymd));
    }
    const allDays = await this.snapModel.find({ grain: 'day' }).lean();
    for (const m of months) await this.rollup('month', m, allDays as any);
    for (const y of years) await this.rollup('year', y, allDays as any);
    await this.snapModel.updateOne(
      { grain: 'meta', key: 'state' },
      { $set: { grain: 'meta', key: 'state', auto: true, lastComputedDay: to } },
      { upsert: true },
    );
  }

  private async computeRecent() {
    const today = dayKey(new Date());
    const meta = await this.state();
    if (!meta?.rebuiltAt) return this.computeAll();
    const from = !meta.lastComputedDay || meta.lastComputedDay > today ? today : meta.lastComputedDay;
    const invoices = await this.invoicesTouching(from, today);
    const buckets = new Map<string, Bucket>();
    for (let ymd = from; ymd <= today; ymd = nextDay(ymd)) buckets.set(ymd, empty());
    for (const inv of invoices) {
      for (let ymd = from; ymd <= today; ymd = nextDay(ymd)) this.applyInvoice(inv, ymd, buckets.get(ymd)!);
    }
    await this.saveDays(from, today, buckets);
    this.logger.log(`Performance refreshed ${from}…${today} (${invoices.length} invoices)`);
    return this.report();
  }

  private async computeAll() {
    const invoices = await this.invoiceModel
      .find({ type: { $in: ['sale', 'purchase'] } })
      .select('type invoiceDate paidAt paidAmount finalAmount totalAmount discount shippingPayer shippingCost items profitAmount totalWeightKg createdAt')
      .lean();
    const days = new Map<string, Bucket>();
    const touch = (key: string) => {
      const row = days.get(key) ?? empty();
      days.set(key, row);
      return row;
    };
    const today = dayKey(new Date());
    for (const inv of invoices) {
      const when = dayKey(inv.invoiceDate || inv.createdAt || new Date());
      this.applyInvoice(inv, when, touch(when));
      const paidDay = inv.paidAt ? dayKey(inv.paidAt) : when;
      if (paidDay !== when) this.applyInvoice(inv, paidDay, touch(paidDay));
    }
    const keys = [...days.keys()].sort();
    const first = keys[0] || today;
    for (let ymd = first; ymd <= today; ymd = nextDay(ymd)) if (!days.has(ymd)) days.set(ymd, empty());
    const sorted = [...days.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
    await this.snapModel.deleteMany({ grain: { $in: ['day', 'month', 'year'] } });
    const ops = sorted.map(([key, b], i) => ({
      updateOne: { filter: { grain: 'day', key }, update: { $set: { grain: 'day', key, ...finish(b, i ? sorted[i - 1][1] : null) } }, upsert: true },
    }));
    for (let i = 0; i < ops.length; i += 200) await this.snapModel.bulkWrite(ops.slice(i, i + 200), { ordered: false });
    const stored = await this.snapModel.find({ grain: 'day' }).lean();
    const months = [...new Set(stored.map((d) => monthOf(d.key)))].sort();
    const years = [...new Set(stored.map((d) => yearOf(d.key)))].sort();
    for (const m of months) await this.rollup('month', m, stored as any);
    for (const y of years) await this.rollup('year', y, stored as any);
    await this.snapModel.updateOne(
      { grain: 'meta', key: 'state' },
      { $set: { grain: 'meta', key: 'state', rebuiltAt: new Date(), auto: true, lastComputedDay: today } },
      { upsert: true },
    );
    this.logger.log(`Performance rebuilt through ${today} (${invoices.length} invoices)`);
    return this.report();
  }
}
