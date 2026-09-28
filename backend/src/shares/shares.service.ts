import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomBytes } from 'crypto';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { ShareKind, ShareLink, ShareLinkDocument, SHARE_KINDS } from './schemas/share-link.schema';
import { SuppliersService } from '../suppliers/suppliers.service';
import { SettingsService } from '../settings/settings.service';
import { PARENT_COMPANY } from '../suppliers/supplier-names';

const UPLOAD_DIR = join(process.cwd(), 'uploads', 'shares');

/** Whole days on the Tehran calendar. */
const dayStart = (ymd?: string) => (ymd ? new Date(`${ymd.slice(0, 10)}T00:00:00+03:30`) : null);
const dayEnd = (ymd?: string) => (ymd ? new Date(`${ymd.slice(0, 10)}T23:59:59.999+03:30`) : null);

@Injectable()
export class SharesService {
  constructor(
    @InjectModel(ShareLink.name) private model: Model<ShareLinkDocument>,
    private suppliers: SuppliersService,
    private settings: SettingsService,
  ) {}

  async create(kind: ShareKind, params: Record<string, string>, createdByName: string) {
    if (!SHARE_KINDS.includes(kind)) throw new BadRequestException('نوع گزارش نامعتبر است');
    const clean: Record<string, string> = {};
    for (const k of ['supplier', 'from', 'to']) if (params?.[k]) clean[k] = String(params[k]);
    const title = `گزارش واریزی‌ها به ${clean.supplier || PARENT_COMPANY}`;
    const doc = await this.model.create({
      token: randomBytes(12).toString('base64url'),
      kind,
      params: clean,
      title,
      createdByName,
    });
    return { token: doc.token, title: doc.title, kind: doc.kind, params: doc.params, createdAt: doc.createdAt };
  }

  async find(token: string) {
    const doc = await this.model.findOne({ token }).exec();
    if (!doc) throw new NotFoundException('این لینک معتبر نیست یا حذف شده است');
    return doc;
  }

  list() {
    return this.model.find().sort({ createdAt: -1 }).limit(50).lean();
  }

  async remove(token: string) {
    const doc = await this.find(token);
    await doc.deleteOne();
    return { message: 'لینک حذف شد' };
  }

  /** Live report data behind a public link. */
  async data(token: string) {
    const link = await this.find(token);
    const settings = await this.settings.get();
    const base = { token, kind: link.kind, title: link.title, params: link.params, shopName: settings.shopName, generatedAt: new Date(), hasPdf: !!link.pdfFile };

    const supplier = link.params.supplier || PARENT_COMPANY;
    const account = await this.suppliers.account(supplier);
    const from = dayStart(link.params.from);
    const to = dayEnd(link.params.to);
    const inRange = (d: Date) => (!from || +new Date(d) >= +from) && (!to || +new Date(d) <= +to);
    const payments = account.payments.filter((p) => inRange(p.date));
    const purchases = account.invoices.filter((i) => inRange(i.date));

    const group = <T extends string>(key: (p: (typeof payments)[number]) => T) => {
      const m = new Map<T, { key: T; amount: number; count: number; accounts: Set<string> }>();
      for (const p of payments) {
        const k = key(p);
        const g = m.get(k) ?? { key: k, amount: 0, count: 0, accounts: new Set<string>() };
        g.amount += p.amount;
        g.count++;
        if (p.destinationAccount) g.accounts.add(p.destinationAccount);
        m.set(k, g);
      }
      return [...m.values()].sort((a, b) => b.amount - a.amount).map((g) => ({ key: g.key, amount: g.amount, count: g.count, accounts: [...g.accounts] }));
    };

    return {
      ...base,
      supplier: account.supplier,
      period: { from: link.params.from || null, to: link.params.to || null },
      summary: {
        paymentsTotal: payments.reduce((s, p) => s + p.amount, 0),
        paymentsCount: payments.length,
        purchasesTotal: purchases.reduce((s, i) => s + i.amount, 0),
        purchasesCount: purchases.length,
        purchasesKg: purchases.reduce((s, i) => s + (i.kg || 0), 0),
        debtNow: account.summary.debt,
        prepaidNow: account.summary.prepaid,
        allTimePurchases: account.summary.purchasesTotal,
        allTimePaid: account.summary.totalPaid,
      },
      byDestination: group((p) => p.destination || 'نامشخص'),
      byMethod: group((p) => p.method),
      payments: payments.map((p) => ({
        date: p.date,
        amount: p.amount,
        method: p.method,
        destination: p.destination || 'نامشخص',
        destinationAccount: p.destinationAccount || '',
        notes: p.notes || '',
        invoices: p.allocations.map((a) => a.invoiceNumber),
      })),
    };
  }

  async savePdf(token: string, file?: { buffer: Buffer; mimetype?: string; size?: number }) {
    const link = await this.find(token);
    if (!file?.buffer?.length) throw new BadRequestException('فایل PDF دریافت نشد');
    if (file.buffer.subarray(0, 4).toString() !== '%PDF') throw new BadRequestException('فایل ارسالی PDF نیست');
    if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });
    const name = `${token}.pdf`;
    writeFileSync(join(UPLOAD_DIR, name), file.buffer);
    link.pdfFile = name;
    await link.save();
    return { token, pdf: true };
  }

  async pdfPath(token: string) {
    const link = await this.find(token);
    const path = link.pdfFile ? join(UPLOAD_DIR, link.pdfFile) : '';
    if (!path || !existsSync(path)) throw new NotFoundException('فایل PDF هنوز ساخته نشده است');
    return { path, title: link.title };
  }
}
