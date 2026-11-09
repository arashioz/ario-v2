import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomBytes } from 'crypto';
import { AppSettings, AppSettingsDocument, POS_LAYOUTS, POS_SECTIONS, POS_SIZES, SALES_LAYOUTS } from './schemas/app-settings.schema';

const SMS_KEYS = ['invoice', 'proforma', 'debt', 'suggest'] as const;

export const DEFAULT_CUSTOMER_WATCH = {
  gradeAMonthAmount: 30_000_000,
  gradeBMonthAmount: 10_000_000,
  gradeCMonthAmount: 2_000_000,
  gradeAYearAmount: 250_000_000,
  gradeBYearAmount: 80_000_000,
  gradeCYearAmount: 20_000_000,
  quietDaysA: 21,
  quietDaysB: 30,
  quietDaysC: 45,
  quietDaysD: 75,
  dropSizeInvoices: 6,
  dropSizeDropPercent: 40,
  suggestMode: 'mix' as 'mix' | 'last' | 'top',
  suggestTopProducts: 4,
  ruleQuiet: true,
  ruleDebt: true,
  ruleDropOff: true,
  ruleChampion: true,
  planFollowUp: true,
  planDays: 2,
};

export type CustomerWatchSettings = typeof DEFAULT_CUSTOMER_WATCH;

export const normalizeWatch = (raw?: Record<string, any> | null): CustomerWatchSettings => {
  const d = DEFAULT_CUSTOMER_WATCH;
  const n = (v: unknown, fallback: number, min: number, max: number) => {
    const x = Number(v);
    if (!Number.isFinite(x)) return fallback;
    return Math.min(max, Math.max(min, Math.round(x)));
  };
  const mode = raw?.suggestMode === 'last' || raw?.suggestMode === 'top' ? raw.suggestMode : 'mix';
  return {
    gradeAMonthAmount: n(raw?.gradeAMonthAmount, d.gradeAMonthAmount, 0, 1_000_000_000_000),
    gradeBMonthAmount: n(raw?.gradeBMonthAmount, d.gradeBMonthAmount, 0, 1_000_000_000_000),
    gradeCMonthAmount: n(raw?.gradeCMonthAmount, d.gradeCMonthAmount, 0, 1_000_000_000_000),
    gradeAYearAmount: n(raw?.gradeAYearAmount, d.gradeAYearAmount, 0, 1_000_000_000_000),
    gradeBYearAmount: n(raw?.gradeBYearAmount, d.gradeBYearAmount, 0, 1_000_000_000_000),
    gradeCYearAmount: n(raw?.gradeCYearAmount, d.gradeCYearAmount, 0, 1_000_000_000_000),
    quietDaysA: n(raw?.quietDaysA, d.quietDaysA, 1, 365),
    quietDaysB: n(raw?.quietDaysB, d.quietDaysB, 1, 365),
    quietDaysC: n(raw?.quietDaysC, d.quietDaysC, 1, 365),
    quietDaysD: n(raw?.quietDaysD, d.quietDaysD, 1, 365),
    dropSizeInvoices: n(raw?.dropSizeInvoices, d.dropSizeInvoices, 1, 30),
    dropSizeDropPercent: n(raw?.dropSizeDropPercent, d.dropSizeDropPercent, 5, 90),
    suggestMode: mode,
    suggestTopProducts: n(raw?.suggestTopProducts, d.suggestTopProducts, 1, 12),
    ruleQuiet: raw?.ruleQuiet !== false,
    ruleDebt: raw?.ruleDebt !== false,
    ruleDropOff: raw?.ruleDropOff !== false,
    ruleChampion: raw?.ruleChampion !== false,
    planFollowUp: raw?.planFollowUp !== false,
    planDays: n(raw?.planDays, d.planDays, 0, 30),
  };
};

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
  'factorySalesEnabled',
  'openDetailAfterSave',
  'performanceRunAt',
] as const;

const VIEW_FLAGS = ['groupByDay', 'showWeight', 'showPayment', 'showItems', 'showSaleType'] as const;
const POS_FLAGS = ['showImages', 'showPerKg', 'showStock', 'cartPopupBeforeInvoice'] as const;

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
      } else if (k === 'autoSaleType' || k === 'proformaForBulk' || k === 'factorySalesEnabled' || k === 'openDetailAfterSave') {
        set[k] = !!body[k];
      } else if (k === 'performanceRunAt') {
        const t = String(body[k] || '').replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).trim();
        if (!/^\d{1,2}:\d{2}$/.test(t)) throw new BadRequestException('ساعت محاسبه عملکرد نامعتبر است');
        const [h, m] = t.split(':').map(Number);
        if (h > 23 || m > 59) throw new BadRequestException('ساعت محاسبه عملکرد نامعتبر است');
        set[k] = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
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

    if (body.salesTarget && typeof body.salesTarget === 'object') {
      const amount = Math.max(0, Math.round(Number(body.salesTarget.amount) || 0));
      const kg = Math.max(0, Math.round((Number(body.salesTarget.kg) || 0) * 10) / 10);
      set.salesTarget = { amount, kg };
    }

    if (Array.isArray(body.homeWarehouses)) {
      set.homeWarehouses = [...new Set(body.homeWarehouses.map((s: unknown) => String(s || '').trim()).filter(Boolean))];
    }

    if (body.salesFocusCompany !== undefined) {
      set.salesFocusCompany = String(body.salesFocusCompany || '').trim();
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

    if (body.customerWatch && typeof body.customerWatch === 'object') {
      set.customerWatch = normalizeWatch({ ...doc.customerWatch, ...body.customerWatch });
    }

    if (body.loyalty && typeof body.loyalty === 'object') {
      const day = (n: unknown, fallback: number, max: number) => {
        const v = Math.round(Number(n));
        if (!Number.isFinite(v) || v < 1 || v > max) throw new BadRequestException('عدد برنامه مشتریان نامعتبر است');
        return v;
      };
      const amount = Math.round(Number(body.loyalty.championAmount));
      if (!Number.isFinite(amount) || amount < 0) throw new BadRequestException('مبلغ وفاداری نامعتبر است');
      set.loyalty = {
        championInvoices: day(body.loyalty.championInvoices, 6, 500),
        championAmount: amount,
        quietDays: day(body.loyalty.quietDays, 21, 365),
        planDays: day(body.loyalty.planDays, 3, 90),
      };
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
