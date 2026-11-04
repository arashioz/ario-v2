import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Invoice, InvoiceDocument } from '../invoices/schemas/invoice.schema';
import { PerformanceSnapshot, PerformanceSnapshotDocument } from './schemas/performance-snapshot.schema';
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
const TICK_MS = 10 * 60 * 1000;

const nextDay = (ymd: string) => {
  const d = new Date(`${ymd}T12:00:00+03:30`);
  d.setDate(d.getDate() + 1);
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

const finish = (b: Bucket, prev?: Bucket | null) => {
  const avgBuyPerKg = b.purchaseKg > 0 ? r0(b.purchaseAmount / b.purchaseKg) : 0;
  const avgSellPerKg = b.saleKg > 0 ? r0(b.saleAmount / b.saleKg) : 0;
  const growth = (now: number, then?: number) => (then && then > 0 ? Math.round(((now - then) / then) * 1000) / 10 : 0);
  return {
    ...b,
    purchaseAmount: r0(b.purchaseAmount),
    purchaseKg: r1(b.purchaseKg),
    saleAmount: r0(b.saleAmount),
    saleKg: r1(b.saleKg),
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

@Injectable()
export class PerformanceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PerformanceService.name);
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<unknown> | null = null;

  constructor(
    @InjectModel(Invoice.name) private invoiceModel: Model<InvoiceDocument>,
    @InjectModel(PerformanceSnapshot.name) private snapModel: Model<PerformanceSnapshotDocument>,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => this.catchUp().catch((e) => this.logger.warn(e.message)), TICK_MS);
    setTimeout(() => this.catchUp().catch(() => undefined), 8000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async state() {
    return this.snapModel.findOne({ grain: 'meta', key: 'state' }).lean();
  }

  async report() {
    const meta = await this.state();
    if (meta?.auto && meta.lastComputedDay !== dayKey(new Date())) await this.catchUp();
    const fresh = meta?.auto ? await this.state() : meta;
    const [days, months, years] = await Promise.all([
      this.snapModel.find({ grain: 'day' }).sort({ key: 1 }).lean(),
      this.snapModel.find({ grain: 'month' }).sort({ key: 1 }).lean(),
      this.snapModel.find({ grain: 'year' }).sort({ key: 1 }).lean(),
    ]);
    const today = dayKey(new Date());
    const month = monthOf(today);
    const year = yearOf(today);
    const state = fresh || meta;
    return {
      rebuilt: !!state?.rebuiltAt,
      auto: !!state?.auto,
      rebuiltAt: state?.rebuiltAt || null,
      lastComputedDay: state?.lastComputedDay || null,
      computing: !!this.running,
      today: days.find((d) => d.key === today) || null,
      thisMonth: months.find((d) => d.key === month) || null,
      thisYear: years.find((d) => d.key === year) || null,
      days,
      months,
      years,
    };
  }

  async rebuild() {
    if (this.running) return this.running;
    this.running = this.computeAll()
      .finally(() => {
        this.running = null;
      });
    return this.running;
  }

  async catchUp() {
    const meta = await this.state();
    if (!meta?.auto) return { skipped: true };
    if (this.running) return this.running;
    this.running = this.computeAll()
      .finally(() => {
        this.running = null;
      });
    return this.running;
  }

  private async computeAll() {
    const invoices = await this.invoiceModel
      .find({ type: { $in: ['sale', 'purchase'] } })
      .select('type invoiceDate paidAt paidAmount remainingDebt finalAmount totalAmount discount shippingPayer shippingCost items profitAmount totalWeightKg')
      .lean();
    const days = new Map<string, Bucket>();
    const touch = (key: string) => {
      const row = days.get(key) ?? empty();
      days.set(key, row);
      return row;
    };

    for (const inv of invoices) {
      const when = dayKey(inv.invoiceDate || (inv as any).createdAt || new Date());
      const paidDay = inv.paidAt ? dayKey(inv.paidAt) : when;
      const kg = kgOf(inv);
      if (inv.type === 'purchase') {
        const amount = Math.max(0, Math.round(Number(inv.finalAmount) || 0));
        add(touch(when), { purchaseAmount: amount, purchaseKg: kg, purchaseCount: 1 });
        const paid = Math.max(0, Math.round(Number(inv.paidAmount) || 0));
        if (paid > 0) add(touch(paidDay), { paidOut: paid });
      } else {
        const amount = goodsAmount(inv as any);
        const profit = Math.round(Number(inv.profitAmount) || 0);
        add(touch(when), { saleAmount: amount, saleKg: kg, saleCount: 1, profitAmount: profit });
        const paid = Math.max(0, Math.round(Number(inv.paidAmount) || 0));
        if (paid > 0) add(touch(paidDay), { paidIn: paid });
      }
    }

    const today = dayKey(new Date());
    const keys = [...days.keys()].sort();
    const first = keys[0] || today;
    for (let ymd = first; ymd <= today; ymd = nextDay(ymd)) if (!days.has(ymd)) days.set(ymd, empty());

    const months = new Map<string, Bucket>();
    const years = new Map<string, Bucket>();
    const sortedDays = [...days.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
    for (const [ymd, b] of sortedDays) {
      const m = monthOf(ymd);
      const y = yearOf(ymd);
      if (!months.has(m)) months.set(m, empty());
      if (!years.has(y)) years.set(y, empty());
      add(months.get(m)!, b);
      add(years.get(y)!, b);
    }

    const write = async (grain: Grain, rows: [string, Bucket][]) => {
      const ops = rows.map(([key, b], i) => {
        const prev = i > 0 ? rows[i - 1][1] : null;
        return {
          updateOne: {
            filter: { grain, key },
            update: { $set: { grain, key, ...finish(b, prev) } },
            upsert: true,
          },
        };
      });
      await this.snapModel.deleteMany({ grain });
      for (let i = 0; i < ops.length; i += 200) await this.snapModel.bulkWrite(ops.slice(i, i + 200), { ordered: false });
    };

    await write('day', sortedDays);
    await write('month', [...months.entries()].sort(([a], [b]) => (a < b ? -1 : 1)));
    await write('year', [...years.entries()].sort(([a], [b]) => (a < b ? -1 : 1)));
    await this.snapModel.updateOne(
      { grain: 'meta', key: 'state' },
      { $set: { grain: 'meta', key: 'state', rebuiltAt: new Date(), auto: true, lastComputedDay: today, purchaseCount: invoices.length } },
      { upsert: true },
    );
    this.logger.log(`Performance rebuilt through ${today} (${invoices.length} invoices)`);
    return this.report();
  }
}
