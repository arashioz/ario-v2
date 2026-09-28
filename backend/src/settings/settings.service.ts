import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomBytes } from 'crypto';
import { AppSettings, AppSettingsDocument, POS_LAYOUTS, POS_SECTIONS, POS_SIZES, SALES_LAYOUTS } from './schemas/app-settings.schema';

const SMS_KEYS = ['invoice', 'proforma', 'debt'] as const;

const toLatin = (s: string) =>
  s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

const SCALARS = [
  'shopName',
  'shopPhone',
  'shopAddress',
  'invoiceFooter',
  'supermarketMinKg',
  'wholesaleMinKg',
  'autoSaleType',
  'proformaForBulk',
] as const;

const VIEW_FLAGS = ['groupByDay', 'showWeight', 'showPayment', 'showItems', 'showSaleType'] as const;
const POS_FLAGS = ['showImages', 'showPerKg', 'showStock'] as const;

@Injectable()
export class SettingsService {
  constructor(@InjectModel(AppSettings.name) private model: Model<AppSettingsDocument>) {}

  async get(): Promise<AppSettingsDocument> {
    const doc = await this.model.findOne().exec();
    if (!doc) return this.model.create({});
    if (doc.bankCards?.some((c) => !c.id)) {
      doc.bankCards.forEach((c) => {
        if (!c.id) c.id = randomBytes(6).toString('hex');
      });
      doc.markModified('bankCards');
      await doc.save();
    }
    return doc;
  }

  async update(body: Record<string, any>): Promise<AppSettingsDocument> {
    const doc = await this.get();
    const set: Record<string, any> = {};

    for (const k of SCALARS) {
      if (body[k] === undefined) continue;
      if (k === 'supermarketMinKg' || k === 'wholesaleMinKg') {
        const v = Number(body[k]);
        if (!Number.isFinite(v) || v < 0) throw new BadRequestException('حد وزن نامعتبر است');
        set[k] = v;
      } else if (k === 'autoSaleType' || k === 'proformaForBulk') {
        set[k] = !!body[k];
      } else {
        set[k] = String(body[k]).trim();
      }
    }
    const sm = set.supermarketMinKg ?? doc.supermarketMinKg;
    const wh = set.wholesaleMinKg ?? doc.wholesaleMinKg;
    if (wh <= sm) throw new BadRequestException('حد عمده باید بیشتر از حد سوپرمارکت باشد');

    if (body.salesView && typeof body.salesView === 'object') {
      const v = body.salesView;
      if (v.layout !== undefined) {
        if (!SALES_LAYOUTS.includes(v.layout)) throw new BadRequestException('نوع نمایش نامعتبر است');
        set['salesView.layout'] = v.layout;
      }
      for (const f of VIEW_FLAGS) if (v[f] !== undefined) set[`salesView.${f}`] = !!v[f];
    }

    if (body.posView && typeof body.posView === 'object') {
      const v = body.posView;
      if (v.layout !== undefined) {
        if (!POS_LAYOUTS.includes(v.layout)) throw new BadRequestException('چیدمان نامعتبر است');
        set['posView.layout'] = v.layout;
      }
      if (v.size !== undefined) {
        if (!POS_SIZES.includes(v.size)) throw new BadRequestException('اندازه نامعتبر است');
        set['posView.size'] = v.size;
      }
      for (const f of POS_FLAGS) if (v[f] !== undefined) set[`posView.${f}`] = !!v[f];
    }

    if (Array.isArray(body.categoryOrder)) {
      set.categoryOrder = [...new Set(body.categoryOrder.map((s: unknown) => String(s || '').trim()).filter(Boolean))];
    }

    if (body.subcategoryOrder && typeof body.subcategoryOrder === 'object') {
      const sanitized: Record<string, string[]> = {};
      for (const [cat, subs] of Object.entries(body.subcategoryOrder)) {
        if (Array.isArray(subs)) {
          sanitized[cat] = [...new Set(subs.map((s: unknown) => String(s || '').trim()).filter(Boolean))];
        }
      }
      set.subcategoryOrder = sanitized;
    }

    if (Array.isArray(body.productOrder)) {
      set.productOrder = [...new Set(body.productOrder.map((s: unknown) => String(s || '').trim()).filter(Boolean))];
    }

    if (Array.isArray(body.posSections)) {
      const seen = new Set<string>();
      const list = body.posSections
        .filter((s: any) => s && POS_SECTIONS.includes(s.id) && !seen.has(s.id) && seen.add(s.id))
        .map((s: any) => ({ id: s.id, visible: s.visible !== false }));
      for (const id of POS_SECTIONS) if (!seen.has(id)) list.push({ id, visible: true });
      set.posSections = list;
    }

    if (Array.isArray(body.bankCards)) {
      const ids = new Set<string>();
      const cards = body.bankCards
        .filter((c: any) => c && (c.cardNumber || c.iban || c.accountNumber || c.label))
        .map((c: any) => {
          let id = String(c.id || '').trim();
          if (!id || ids.has(id)) id = randomBytes(6).toString('hex');
          ids.add(id);
          return {
            id,
            label: String(c.label || '').trim(),
            bankName: String(c.bankName || '').trim(),
            accountNumber: toLatin(String(c.accountNumber || '')).replace(/[^\d-]/g, ''),
            cardNumber: toLatin(String(c.cardNumber || '')).replace(/\D/g, ''),
            iban: toLatin(String(c.iban || '')).replace(/\s/g, '').toUpperCase(),
            accountHolder: String(c.accountHolder || '').trim(),
            isDefault: !!c.isDefault,
          };
        });
      for (const c of cards) {
        if (c.cardNumber && c.cardNumber.length !== 16) throw new BadRequestException(`شماره کارت «${c.label || c.bankName}» باید ۱۶ رقم باشد`);
        if (c.iban && !/^IR\d{24}$/.test(c.iban.startsWith('IR') ? c.iban : `IR${c.iban}`)) {
          throw new BadRequestException(`شماره شبای «${c.label || c.bankName}» باید ۲۴ رقم باشد`);
        }
        if (c.iban && !c.iban.startsWith('IR')) c.iban = `IR${c.iban}`;
      }
      const firstDefault = cards.findIndex((c: any) => c.isDefault);
      cards.forEach((c: any, i: number) => (c.isDefault = i === firstDefault));
      set.bankCards = cards;
    }

    if (body.smsTemplates && typeof body.smsTemplates === 'object') {
      for (const k of SMS_KEYS) {
        if (body.smsTemplates[k] !== undefined) set[`smsTemplates.${k}`] = String(body.smsTemplates[k] ?? '').slice(0, 2000);
      }
    }

    if (body.backup && typeof body.backup === 'object') {
      const b = body.backup;
      if (b.enabled !== undefined) set['backup.enabled'] = !!b.enabled;
      if (b.hour !== undefined) {
        const h = Number(b.hour);
        if (!Number.isInteger(h) || h < 0 || h > 23) throw new BadRequestException('ساعت پشتیبان‌گیری نامعتبر است');
        set['backup.hour'] = h;
      }
      if (b.keepDays !== undefined) {
        const d = Number(b.keepDays);
        if (!Number.isInteger(d) || d < 1 || d > 365) throw new BadRequestException('تعداد روز نگهداری باید بین ۱ تا ۳۶۵ باشد');
        set['backup.keepDays'] = d;
      }
    }

    await this.model.updateOne({ _id: doc._id }, { $set: set }).exec();
    return this.get();
  }
}
