import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import mongoose, { Connection } from 'mongoose';
import { createReadStream, createWriteStream, promises as fs } from 'fs';
import { once } from 'events';
import { join } from 'path';
import { createGzip } from 'zlib';
import { SettingsService } from '../settings/settings.service';

const { EJSON } = mongoose.mongo.BSON;

export const BACKUP_FORMAT = 'ario-app-backup/1';
export type BackupKind = 'backup' | 'export';

export interface BackupFile {
  name: string;
  kind: BackupKind;
  size: number;
  createdAt: string;
}

const FILE_RE = /^ario-(backup|invoices)-\d{4}-\d{2}-\d{2}(-\d{4})?\.(json\.gz|csv)$/;
const CHECK_EVERY_MS = 10 * 60 * 1000;

const pad = (n: number) => String(n).padStart(2, '0');
/** Server-local calendar day (TZ env decides; Asia/Tehran in docker). */
const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const SALE_TYPES: Record<string, string> = { retail: 'تک‌فروشی', supermarket: 'سوپرمارکت', wholesale: 'عمده' };
const PAY_METHODS: Record<string, string> = {
  pos: 'کارتخوان',
  cash: 'نقدی',
  transfer: 'کارت‌به‌کارت',
  cheque: 'چک',
  credit: 'نسیه',
  split: 'ترکیبی',
};
const faDate = new Intl.DateTimeFormat('fa-IR-u-ca-persian-nu-latn', { year: 'numeric', month: '2-digit', day: '2-digit' });
const faTime = new Intl.DateTimeFormat('fa-IR-u-nu-latn', { hour: '2-digit', minute: '2-digit', hour12: false });

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

@Injectable()
export class BackupService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(BackupService.name);
  private readonly root = process.env.BACKUP_DIR || join(process.cwd(), 'backups');
  private readonly dailyDir = join(this.root, 'daily');
  private timer?: NodeJS.Timeout;
  private running: Promise<BackupFile> | null = null;
  lastError: string | null = null;

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly settings: SettingsService,
  ) {}

  onModuleInit() {
    // First check shortly after boot so a server that was off at the scheduled hour catches up.
    setTimeout(() => void this.tick(), 60 * 1000).unref();
    this.timer = setInterval(() => void this.tick(), CHECK_EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    try {
      const { backup } = await this.settings.get();
      if (!backup?.enabled) return;
      const now = new Date();
      if (now.getHours() < (backup.hour ?? 2)) return;
      const today = dayKey(now);
      const files = await this.list();
      if (!files.some((f) => f.kind === 'backup' && f.name.includes(`-${today}`))) {
        await this.run();
      }
      const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      if (!files.some((f) => f.kind === 'export' && f.name.includes(`-${dayKey(yesterday)}`))) {
        await this.writeDailyExport(yesterday);
      }
      await this.prune(backup.keepDays ?? 14);
    } catch (e: any) {
      this.lastError = e?.message || String(e);
      this.log.error(`Scheduled backup failed: ${this.lastError}`);
    }
  }

  async list(): Promise<BackupFile[]> {
    await fs.mkdir(this.dailyDir, { recursive: true });
    const names = (await fs.readdir(this.dailyDir)).filter((n) => FILE_RE.test(n));
    const files = await Promise.all(
      names.map(async (name) => {
        const st = await fs.stat(join(this.dailyDir, name));
        return {
          name,
          kind: (name.startsWith('ario-backup-') ? 'backup' : 'export') as BackupKind,
          size: st.size,
          createdAt: st.mtime.toISOString(),
        };
      }),
    );
    return files.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** Concurrent callers share one in-flight dump. */
  run(): Promise<BackupFile> {
    if (!this.running) {
      this.running = this.dump().finally(() => (this.running = null));
    }
    return this.running;
  }

  /**
   * One gzipped JSON-lines file: a header line, then {"c":collection,"d":doc} per document
   * in canonical EJSON so ObjectIds and Dates survive a restore.
   */
  private async dump(): Promise<BackupFile> {
    await fs.mkdir(this.dailyDir, { recursive: true });
    const now = new Date();
    const name = `ario-backup-${dayKey(now)}-${pad(now.getHours())}${pad(now.getMinutes())}.json.gz`;
    const tmp = join(this.dailyDir, `.${name}.tmp`);
    const db = this.connection.db;
    if (!db) throw new Error('Database not connected');

    const collections = (await db.listCollections({}, { nameOnly: true }).toArray())
      .map((c) => c.name)
      .filter((n) => !n.startsWith('system.'))
      .sort();

    const gzip = createGzip({ level: 6 });
    const out = createWriteStream(tmp);
    // Listen before end(). A small backup finishes inside gzip.end(), and attaching
    // the listener afterwards waits forever.
    const done = new Promise<void>((resolve, reject) => {
      out.on('finish', () => resolve());
      out.on('error', reject);
      gzip.on('error', reject);
    });
    gzip.pipe(out);
    const write = async (line: string) => {
      if (!gzip.write(line + '\n')) await once(gzip, 'drain');
    };

    const counts: Record<string, number> = {};
    try {
      await write(JSON.stringify({ format: BACKUP_FORMAT, db: db.databaseName, createdAt: now.toISOString(), collections }));
      for (const c of collections) {
        counts[c] = 0;
        for await (const doc of db.collection(c).find({})) {
          await write(`{"c":${JSON.stringify(c)},"d":${EJSON.stringify(doc, { relaxed: false })}}`);
          counts[c]++;
        }
      }
      await write(JSON.stringify({ end: true, counts }));
      gzip.end();
      await done;
      await fs.rename(tmp, join(this.dailyDir, name));
    } catch (e: any) {
      gzip.destroy();
      out.destroy();
      await fs.rm(tmp, { force: true });
      this.lastError = e?.message || String(e);
      throw e;
    }

    this.lastError = null;
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    this.log.log(`Backup ${name}: ${collections.length} collections, ${total} documents`);
    const st = await fs.stat(join(this.dailyDir, name));
    return { name, kind: 'backup', size: st.size, createdAt: st.mtime.toISOString() };
  }

  /** CSV (UTF-8 BOM so Excel reads Persian) of every invoice dated on the given local day. */
  async dailyCsv(day: Date): Promise<string> {
    const from = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    const to = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
    const db = this.connection.db;
    if (!db) throw new Error('Database not connected');
    const invoices = await db
      .collection('invoices')
      .find({ invoiceDate: { $gte: from, $lt: to } })
      .sort({ invoiceDate: 1, createdAt: 1 })
      .toArray();

    const head = [
      'شماره',
      'نوع',
      'نوع فروش',
      'تاریخ',
      'ساعت',
      'مشتری',
      'تلفن',
      'اقلام',
      'وزن (کیلو)',
      'جمع',
      'تخفیف',
      'مبلغ نهایی',
      'روش پرداخت',
      'کارتخوان',
      'نقدی',
      'کارت‌به‌کارت',
      'چک',
      'نسیه',
      'پرداخت‌شده',
      'مانده',
      'ثبت‌کننده',
      'توضیحات',
    ];
    const rows = invoices.map((inv: any) => {
      const date = new Date(inv.invoiceDate || inv.createdAt);
      const split = inv.splitDetails || {};
      const pm = inv.paymentMethod;
      const part = (k: string) => (pm === 'split' ? split[k] || 0 : pm === k ? inv.finalAmount || 0 : 0);
      const items = (inv.items || []).map((it: any) => `${it.productName} × ${it.quantity} ${it.unit || ''}`.trim()).join(' | ');
      return [
        inv.invoiceNumber,
        inv.type === 'purchase' ? 'خرید' : 'فروش',
        inv.type === 'purchase' ? '' : SALE_TYPES[inv.saleType] || inv.saleType,
        faDate.format(date),
        faTime.format(date),
        inv.customerName,
        inv.customerPhone,
        items,
        Math.round((inv.totalWeightKg || 0) * 100) / 100,
        inv.totalAmount || 0,
        inv.discount || 0,
        inv.finalAmount || 0,
        PAY_METHODS[pm] || pm,
        part('pos'),
        part('cash'),
        part('transfer'),
        part('cheque'),
        pm === 'split' ? split.credit || 0 : inv.creditAmount || (pm === 'credit' ? inv.finalAmount || 0 : 0),
        inv.paidAmount || 0,
        inv.remainingDebt || 0,
        inv.createdByName,
        inv.notes,
      ];
    });
    return '\uFEFF' + [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  }

  private async writeDailyExport(day: Date) {
    const csv = await this.dailyCsv(day);
    await fs.mkdir(this.dailyDir, { recursive: true });
    await fs.writeFile(join(this.dailyDir, `ario-invoices-${dayKey(day)}.csv`), csv, 'utf8');
  }

  parseDay(value?: string): Date {
    if (!value) return new Date();
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!m) throw new BadRequestException('تاریخ نامعتبر است');
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (Number.isNaN(d.getTime())) throw new BadRequestException('تاریخ نامعتبر است');
    return d;
  }

  dayKey(d: Date) {
    return dayKey(d);
  }

  private resolve(name: string) {
    if (!FILE_RE.test(name)) throw new BadRequestException('نام فایل نامعتبر است');
    return join(this.dailyDir, name);
  }

  async open(name: string) {
    const path = this.resolve(name);
    const st = await fs.stat(path).catch(() => null);
    if (!st?.isFile()) throw new NotFoundException('فایل پیدا نشد');
    return { stream: createReadStream(path), size: st.size };
  }

  async remove(name: string) {
    await fs.rm(this.resolve(name), { force: true });
  }

  /** Keeps the newest `keepDays` days of each kind; always keeps at least the latest backup. */
  private async prune(keepDays: number) {
    const cutoff = Date.now() - Math.max(1, keepDays) * 24 * 60 * 60 * 1000;
    const files = await this.list();
    const latestBackup = files.find((f) => f.kind === 'backup');
    for (const f of files) {
      if (f === latestBackup) continue;
      if (new Date(f.createdAt).getTime() < cutoff) await this.remove(f.name);
    }
  }
}
