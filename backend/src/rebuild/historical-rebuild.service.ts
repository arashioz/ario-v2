import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Invoice, InvoiceDocument } from '../invoices/schemas/invoice.schema';
import { AccountingService } from '../accounting/accounting.service';
import { PerformanceService } from '../accounting/performance.service';
import { ProfitWatchService } from '../accounting/profit-watch.service';
import { PerformanceSnapshot, PerformanceSnapshotDocument } from '../accounting/schemas/performance-snapshot.schema';
import { PricePeriodService } from '../pricing/price-period.service';
import { PricePeriod, PricePeriodDocument } from '../pricing/schemas/price-period.schema';
import { derivedProfitSet, historicalSaleProfit } from './sale-profit';
import { HistoricalRebuildBackup, HistoricalRebuildBackupDocument } from './schemas/historical-rebuild-backup.schema';
import { HistoricalRebuildRun, HistoricalRebuildRunDocument, SourceFingerprint } from './schemas/historical-rebuild-run.schema';

const VERSION = 'v1';
const BATCH = 80;

@Injectable()
export class HistoricalRebuildService {
  constructor(
    @InjectModel(HistoricalRebuildRun.name) private readonly runs: Model<HistoricalRebuildRunDocument>,
    @InjectModel(HistoricalRebuildBackup.name) private readonly backups: Model<HistoricalRebuildBackupDocument>,
    @InjectModel(Invoice.name) private readonly invoices: Model<InvoiceDocument>,
    @InjectModel(PricePeriod.name) private readonly periods: Model<PricePeriodDocument>,
    @InjectModel(PerformanceSnapshot.name) private readonly snapshots: Model<PerformanceSnapshotDocument>,
    private readonly pricePeriods: PricePeriodService,
    private readonly performance: PerformanceService,
    private readonly accounting: AccountingService,
    private readonly watcher: ProfitWatchService,
  ) {}

  async status() {
    await this.ensure();
    return this.runs.findOne({ version: VERSION }).lean();
  }

  /** Counts and a fingerprint of invoice money. Writes no invoice, price, or report. */
  async preflight() {
    const run = await this.lock();
    try {
      const survey = await this.survey();
      const reset = !run.pricesDone && ['idle', 'rolled_back', 'failed', 'preflight'].includes(run.phase);
      return await this.unlock({
        ...survey,
        error: '',
        ...(reset ? { phase: 'preflight' } : {}),
      });
    } catch (error) {
      await this.fail(error);
      throw error;
    }
  }

  /** Rebuild buy-price spans from purchase invoices. Invoice amounts stay as they are. */
  async prices() {
    const run = await this.lock();
    try {
      if (!run.source) throw new BadRequestException('اول پیش‌بررسی را بزنید');
      await this.backupOnce('periods', async () => {
        const rows = await this.periods.find().lean();
        return rows.map((row) => {
          const { _id, ...payload } = row as { _id?: unknown };
          return { payload };
        });
      });
      const built = await this.pricePeriods.rebuild();
      return await this.unlock({
        phase: 'prices',
        periods: built.length,
        pricesDone: true,
        profitsDone: false,
        performanceDone: false,
        cursor: '',
        salesSeen: 0,
        profitsUpdated: 0,
        profitsUnchanged: 0,
        unresolved: 0,
        error: '',
      });
    } catch (error) {
      await this.fail(error);
      throw error;
    }
  }

  /** One batch of sales. Safe to call again; it continues from the last saved invoice. */
  async profits() {
    const run = await this.lock();
    try {
      if (!run.pricesDone) throw new BadRequestException('اول بازه قیمت خرید ساخته شود');
      const periods = await this.pricePeriods.list();
      const filter: Record<string, unknown> = { type: 'sale' };
      if (run.cursor && Types.ObjectId.isValid(run.cursor)) filter._id = { $gt: new Types.ObjectId(run.cursor) };
      const sales = await this.invoices
        .find(filter)
        .sort({ _id: 1 })
        .limit(BATCH)
        .select('fulfillment invoiceDate discount items costAmount profitAmount')
        .exec();

      let updated = 0;
      let unchanged = 0;
      let unresolved = 0;
      for (const sale of sales) {
        const next = historicalSaleProfit(sale, periods);
        unresolved += next.lines.filter((line) => line.unresolved).length;
        const same = sale.costAmount === next.costAmount
          && sale.profitAmount === next.profitAmount
          && (sale.items || []).every((item, i) => item.unitCost === next.lines[i]?.unitCost && item.profit === next.lines[i]?.profit);
        if (same) {
          unchanged++;
          continue;
        }
        await this.backups.updateOne(
          { kind: 'profit', runId: VERSION, invoiceId: String(sale._id) },
          {
            $setOnInsert: {
              kind: 'profit',
              runId: VERSION,
              invoiceId: String(sale._id),
              costAmount: Math.round(Number(sale.costAmount) || 0),
              profitAmount: Math.round(Number(sale.profitAmount) || 0),
              lines: (sale.items || []).map((item) => ({
                unitCost: Math.round(Number(item.unitCost) || 0),
                profit: Math.round(Number(item.profit) || 0),
              })),
            },
          },
          { upsert: true },
        );
        await this.invoices.updateOne({ _id: sale._id }, { $set: derivedProfitSet(next.lines, next.costAmount, next.profitAmount) });
        updated++;
      }

      const done = sales.length < BATCH;
      let sourceOk = true;
      if (done && run.source) {
        const now = await this.fingerprint();
        sourceOk = this.sameSource(run.source, now);
      }
      if (done && !sourceOk) {
        return await this.unlock({
          phase: 'failed',
          error: 'مبلغ، تعداد یا تاریخ فاکتورها وسط کار عوض شده. سود نوشته‌شده مشتق است؛ قیمت فاکتور عوض نشده. عملکرد ساخته نشد.',
          salesSeen: (run.salesSeen || 0) + sales.length,
          profitsUpdated: (run.profitsUpdated || 0) + updated,
          profitsUnchanged: (run.profitsUnchanged || 0) + unchanged,
          unresolved: (run.unresolved || 0) + unresolved,
          cursor: sales.length ? String(sales[sales.length - 1]._id) : run.cursor,
        });
      }
      return await this.unlock({
        phase: done ? 'profits' : 'profits',
        profitsDone: done,
        performanceDone: false,
        salesSeen: (run.salesSeen || 0) + sales.length,
        profitsUpdated: (run.profitsUpdated || 0) + updated,
        profitsUnchanged: (run.profitsUnchanged || 0) + unchanged,
        unresolved: (run.unresolved || 0) + unresolved,
        cursor: sales.length ? String(sales[sales.length - 1]._id) : run.cursor,
        error: '',
      });
    } catch (error) {
      await this.fail(error);
      throw error;
    }
  }

  /**
   * After the operator confirms: refresh every report that stores or caches numbers.
   * Invoice prices, quantities, dates and totals are not written.
   * Sales targets, marketing, cashbox and expenses are not derived from this profit and stay as they are.
   */
  async performanceStep() {
    const run = await this.lock();
    try {
      if (!run.profitsDone) throw new BadRequestException('اول سود همه فاکتورهای فروش ثبت شود');
      await this.backupOnce('performance', async () => {
        const rows = await this.snapshots.find().lean();
        return rows.map((row) => {
          const { _id, ...payload } = row as { _id?: unknown };
          return { payload };
        });
      });
      await this.performance.rebuild();
      this.accounting.clearCache();
      await this.watcher.scan(true);
      const reportNote = 'عملکرد، فروش، سود، انبار، گرانی بار، نسیه، نمودار قیمت و پایش سود';
      return await this.unlock({ phase: 'ready', performanceDone: true, reportNote, error: '' });
    } catch (error) {
      await this.fail(error);
      throw error;
    }
  }

  /**
   * Puts back the derived profit, price spans, and performance charts from the backup.
   * Purchase and sale prices, quantities, dates, and invoice totals stay untouched.
   * This returns the previous profit numbers, which may still be the old wrong ones.
   */
  async rollback() {
    const run = await this.lock();
    try {
      const profits = await this.backups.find({ kind: 'profit', runId: VERSION }).lean();
      for (const row of profits) {
        if (!Types.ObjectId.isValid(row.invoiceId)) continue;
        await this.invoices.updateOne(
          { _id: row.invoiceId },
          { $set: derivedProfitSet(row.lines || [], Math.round(row.costAmount || 0), Math.round(row.profitAmount || 0)) },
        );
      }
      const periodBackup = await this.backups.find({ kind: 'periods', runId: VERSION }).lean();
      if (periodBackup.length) {
        await this.periods.deleteMany({});
        await this.periods.insertMany(periodBackup.map((row) => row.payload || {}));
      }
      const performanceBackup = await this.backups.find({ kind: 'performance', runId: VERSION }).lean();
      if (performanceBackup.length) {
        await this.snapshots.deleteMany({});
        await this.snapshots.insertMany(performanceBackup.map((row) => row.payload || {}));
      }
      this.accounting.clearCache();
      return await this.unlock({
        phase: 'rolled_back',
        reportNote: '',
        pricesDone: false,
        profitsDone: false,
        performanceDone: false,
        cursor: '',
        salesSeen: 0,
        profitsUpdated: 0,
        profitsUnchanged: 0,
        unresolved: 0,
        error: '',
      });
    } catch (error) {
      await this.fail(error);
      throw error;
    }
  }

  private async survey() {
    const [purchases, salesTotal, span, source] = await Promise.all([
      this.invoices.countDocuments({ type: 'purchase' }),
      this.invoices.countDocuments({ type: 'sale' }),
      this.invoices.aggregate<{ from: Date; to: Date }>([
        { $match: { type: { $in: ['sale', 'purchase'] } } },
        { $group: { _id: null, from: { $min: '$invoiceDate' }, to: { $max: '$invoiceDate' } } },
      ]),
      this.fingerprint(),
    ]);
    return {
      purchases,
      salesTotal,
      from: span[0]?.from,
      to: span[0]?.to,
      source,
    };
  }

  private async fingerprint(): Promise<SourceFingerprint> {
    const [row] = await this.invoices.aggregate<SourceFingerprint & { _id: null }>([
      { $match: { type: { $in: ['sale', 'purchase'] } } },
      {
        $project: {
          finalAmount: { $ifNull: ['$finalAmount', 0] },
          totalAmount: { $ifNull: ['$totalAmount', 0] },
          lineMoney: { $sum: '$items.totalPrice' },
          lineQty: { $sum: '$items.quantity' },
        },
      },
      {
        $group: {
          _id: null,
          n: { $sum: 1 },
          finalAmount: { $sum: '$finalAmount' },
          totalAmount: { $sum: '$totalAmount' },
          lineMoney: { $sum: '$lineMoney' },
          lineQty: { $sum: '$lineQty' },
        },
      },
    ]);
    return {
      n: row?.n || 0,
      finalAmount: Math.round(row?.finalAmount || 0),
      totalAmount: Math.round(row?.totalAmount || 0),
      lineMoney: Math.round(row?.lineMoney || 0),
      lineQty: Math.round((row?.lineQty || 0) * 1000) / 1000,
    };
  }

  private sameSource(before: SourceFingerprint, after: SourceFingerprint) {
    return before.n === after.n
      && before.finalAmount === after.finalAmount
      && before.totalAmount === after.totalAmount
      && before.lineMoney === after.lineMoney
      && before.lineQty === after.lineQty;
  }

  private async backupOnce(kind: 'periods' | 'performance', load: () => Promise<{ payload?: Record<string, unknown> }[]>) {
    const existing = await this.backups.countDocuments({ kind, runId: VERSION });
    if (existing) return;
    const rows = await load();
    for (let i = 0; i < rows.length; i += 200) {
      await this.backups.insertMany(rows.slice(i, i + 200).map((row) => ({
        kind,
        runId: VERSION,
        invoiceId: '',
        payload: row.payload,
      })));
    }
  }

  private async ensure() {
    await this.runs.updateOne({ version: VERSION }, { $setOnInsert: { version: VERSION, phase: 'idle' } }, { upsert: true });
  }

  private async lock() {
    await this.ensure();
    const stale = new Date(Date.now() - 20 * 60 * 1000);
    const run = await this.runs.findOneAndUpdate(
      { version: VERSION, $or: [{ busy: { $ne: true } }, { updatedAt: { $lt: stale } }] },
      { $set: { busy: true } },
      { new: true },
    );
    if (!run) throw new ConflictException('این اصلاح همین حالا در حال اجراست');
    return run;
  }

  private async unlock(patch: Record<string, unknown>) {
    await this.runs.updateOne({ version: VERSION }, { $set: { ...patch, busy: false } });
    return this.runs.findOne({ version: VERSION }).lean();
  }

  private async fail(error: unknown) {
    const message = error instanceof Error ? error.message : 'اصلاح متوقف شد';
    await this.runs.updateOne({ version: VERSION }, { $set: { busy: false, phase: 'failed', error: message } }).catch(() => undefined);
  }
}
