import { useEffect, useState } from 'react';
import { api } from './api';

export type SalesLayout = 'cards' | 'compact' | 'table';
export type SaleType = 'retail' | 'supermarket' | 'wholesale';

export interface SalesView {
  layout: SalesLayout;
  groupByDay: boolean;
  showWeight: boolean;
  showPayment: boolean;
  showItems: boolean;
  showSaleType: boolean;
}

export type PosLayout = 'grid' | 'tiles' | 'list';
export type PosSize = 'sm' | 'md';

export interface PosView {
  layout: PosLayout;
  size: PosSize;
  showImages: boolean;
  showPerKg: boolean;
  showStock: boolean;
}

export type PosSectionId = 'tiers' | 'cart' | 'search' | 'categories' | 'products';

export interface PosSection {
  id: PosSectionId;
  visible: boolean;
}

export const POS_SECTION_LABELS: Record<PosSectionId, string> = {
  tiers: 'سطح قیمت (تک / سوپرمارکت / عمده)',
  cart: 'سبد خرید',
  search: 'جستجوی کالا',
  categories: 'دکمه‌های دسته‌بندی',
  products: 'لیست کالاها',
};

export const DEFAULT_POS_SECTIONS: PosSection[] = [
  { id: 'tiers', visible: true },
  { id: 'cart', visible: true },
  { id: 'search', visible: true },
  { id: 'categories', visible: true },
  { id: 'products', visible: true },
];

/** Stored order, with any section missing from it appended so nothing disappears after an update. */
export const normalizePosSections = (list?: PosSection[] | null): PosSection[] => {
  const known = new Set(DEFAULT_POS_SECTIONS.map((s) => s.id));
  const seen = new Set<string>();
  const out = (list || []).filter((s) => s && known.has(s.id) && !seen.has(s.id) && seen.add(s.id));
  for (const s of DEFAULT_POS_SECTIONS) if (!seen.has(s.id)) out.push({ ...s });
  return out;
};

/** A shop bank account; `id` is what payments reference. */
export interface BankCard {
  id: string;
  label: string;
  bankName: string;
  accountNumber: string;
  cardNumber: string;
  iban: string;
  accountHolder: string;
  isDefault: boolean;
}

export const bankCardTitle = (c: Pick<BankCard, 'label' | 'bankName' | 'cardNumber' | 'accountNumber'>) => {
  const name = c.label || c.bankName || 'حساب';
  const tail = (c.cardNumber || c.accountNumber || '').replace(/\D/g, '').slice(-4);
  return tail ? `${name} (${tail}…)` : name;
};

export type SmsTemplateKey = 'invoice' | 'proforma' | 'debt';
export type SmsTemplates = Record<SmsTemplateKey, string>;

const RULE = '────────────';

/** Previous built-in invoice text. A shop that never edited it should pick up the new layout. */
const LEGACY_INVOICE_SMS = [
  '{shop}',
  'فاکتور {number} - {date}',
  'خریدار: {customer}',
  '{items}',
  'وزن کل: {weight}',
  'تخفیف: {discount}',
  'هزینه ارسال: {shipping}',
  'مبلغ فاکتور: {total}',
  'نحوه پرداخت: {payment}',
  'مانده این فاکتور: {remaining}',
  'مانده کل حساب شما: {balance}',
  'شماره کارت جهت واریز: {card} به نام {holder}',
  'با تشکر از خرید شما',
].join('\n');

export const DEFAULT_SMS_TEMPLATES: SmsTemplates = {
  invoice: [
    'فاکتور فروش {number}',
    '{shop}',
    RULE,
    'مشتری: {customer}',
    'موبایل: {mobile}',
    'تاریخ: {date}',
    'پرداخت: {payment}',
    RULE,
    'اقلام:',
    '{items}',
    RULE,
    'تناژ: {weight}',
    'مبلغ فاکتور: {total}',
    'پرداخت‌شده: {paid}',
    'مانده نسیه: {remaining}',
    'وضعیت: {status}',
    RULE,
    'با تشکر 🙏',
    '{cardBlock}',
  ].join('\n'),
  proforma: [
    '{shop}',
    'پیش‌فاکتور {number} - {date}',
    'خریدار: {customer}',
    '{items}',
    'وزن کل: {weight}',
    'تخفیف: {discount}',
    'هزینه ارسال: {shipping}',
    'مبلغ نهایی: {total}',
    'شماره کارت جهت واریز: {card} به نام {holder}',
  ].join('\n'),
  debt: [
    '{customer} گرامی',
    'مانده حساب شما نزد {shop}: {balance}',
    'فاکتورهای باز:',
    '{invoices}',
    'شماره کارت جهت واریز: {card} به نام {holder}',
    'شبا: {sheba}',
    'با سپاس - {shop} {phone}',
  ].join('\n'),
};

export const SMS_TEMPLATE_LABELS: Record<SmsTemplateKey, string> = {
  invoice: 'پیامک فاکتور فروش',
  proforma: 'پیامک پیش‌فاکتور',
  debt: 'گزارش حساب مشتری (یادآوری بدهی)',
};

/** Placeholders each template understands. */
export const SMS_PLACEHOLDERS: Record<SmsTemplateKey, [string, string][]> = {
  invoice: [
    ['shop', 'نام فروشگاه'],
    ['phone', 'تلفن فروشگاه'],
    ['number', 'شماره فاکتور'],
    ['date', 'تاریخ'],
    ['customer', 'نام مشتری'],
    ['mobile', 'موبایل مشتری'],
    ['items', 'ریز اقلام'],
    ['status', 'وضعیت، مثل نسیه باز'],
    ['cardBlock', 'کارت واریز، فقط وقتی مانده دارد'],
    ['weight', 'وزن کل'],
    ['subtotal', 'جمع اقلام'],
    ['discount', 'تخفیف'],
    ['shipping', 'هزینه ارسال'],
    ['total', 'مبلغ فاکتور'],
    ['payment', 'نحوه پرداخت'],
    ['paid', 'پرداخت‌شده'],
    ['remaining', 'مانده فاکتور'],
    ['balance', 'مانده کل حساب'],
    ['card', 'شماره کارت'],
    ['sheba', 'شبا'],
    ['holder', 'صاحب حساب'],
    ['bank', 'نام بانک'],
    ['footer', 'متن پایین فاکتور'],
  ],
  proforma: [
    ['shop', 'نام فروشگاه'],
    ['phone', 'تلفن فروشگاه'],
    ['number', 'شماره پیش‌فاکتور'],
    ['date', 'تاریخ'],
    ['customer', 'نام مشتری'],
    ['items', 'ریز اقلام'],
    ['weight', 'وزن کل'],
    ['subtotal', 'جمع اقلام'],
    ['discount', 'تخفیف'],
    ['shipping', 'هزینه ارسال'],
    ['total', 'مبلغ نهایی'],
    ['card', 'شماره کارت'],
    ['sheba', 'شبا'],
    ['holder', 'صاحب حساب'],
    ['bank', 'نام بانک'],
  ],
  debt: [
    ['shop', 'نام فروشگاه'],
    ['phone', 'تلفن فروشگاه'],
    ['customer', 'نام مشتری'],
    ['balance', 'مانده کل حساب'],
    ['invoices', 'لیست فاکتورهای باز'],
    ['count', 'تعداد فاکتورهای باز'],
    ['date', 'تاریخ امروز'],
    ['card', 'شماره کارت'],
    ['sheba', 'شبا'],
    ['holder', 'صاحب حساب'],
    ['bank', 'نام بانک'],
  ],
};

export interface AppSettings {
  shopName: string;
  shopPhone: string;
  shopAddress: string;
  invoiceFooter: string;
  supermarketMinKg: number;
  wholesaleMinKg: number;
  autoSaleType: boolean;
  proformaForBulk: boolean;
  salesView: SalesView;
  posView: PosView;
  /** Category heading order on the sales screen. */
  categoryOrder: string[];
  /** Order of subcategories per category on the sales screen. */
  subcategoryOrder: Record<string, string[]>;
  /** Order of product IDs on the sales screen. */
  productOrder: string[];
  /** Order and visibility of the blocks on the sales screen. */
  posSections: PosSection[];
  bankCards: BankCard[];
  smsTemplates: SmsTemplates;
  backup: BackupSettings;
  legacy?: { cashBalance?: number; cardBalance?: number; openingDate?: string; exportedAt?: string } | null;
}

export interface BackupSettings {
  enabled: boolean;
  /** Server-local hour (0-23) from which the day's backup is taken. */
  hour: number;
  keepDays: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  shopName: 'فروشگاه آریو',
  shopPhone: '',
  shopAddress: '',
  invoiceFooter: '',
  supermarketMinKg: 200,
  wholesaleMinKg: 1500,
  autoSaleType: true,
  proformaForBulk: true,
  salesView: { layout: 'cards', groupByDay: true, showWeight: true, showPayment: true, showItems: false, showSaleType: true },
  posView: { layout: 'grid', size: 'sm', showImages: true, showPerKg: true, showStock: true },
  categoryOrder: [],
  subcategoryOrder: {},
  productOrder: [],
  posSections: DEFAULT_POS_SECTIONS,
  bankCards: [],
  smsTemplates: DEFAULT_SMS_TEMPLATES,
  backup: { enabled: true, hour: 2, keepDays: 14 },
  legacy: null,
};

export const SALE_TYPE_LABELS: Record<SaleType, string> = {
  retail: 'تک‌فروشی',
  supermarket: 'سوپرمارکت',
  wholesale: 'عمده بنکداری',
};

/** Price tier a cart of this weight gets automatically. */
export const saleTypeForKg = (kg: number, s: Pick<AppSettings, 'supermarketMinKg' | 'wholesaleMinKg'>): SaleType =>
  kg >= s.wholesaleMinKg ? 'wholesale' : kg >= s.supermarketMinKg ? 'supermarket' : 'retail';

let cached: AppSettings | null = null;
let inflight: Promise<AppSettings> | null = null;
const listeners = new Set<(s: AppSettings) => void>();

const publish = (s: AppSettings) => {
  cached = {
    ...DEFAULT_SETTINGS,
    ...s,
    salesView: { ...DEFAULT_SETTINGS.salesView, ...(s.salesView || {}) },
    posView: { ...DEFAULT_SETTINGS.posView, ...(s.posView || {}) },
    backup: { ...DEFAULT_SETTINGS.backup, ...(s.backup || {}) },
    categoryOrder: Array.isArray(s.categoryOrder) ? s.categoryOrder : [],
    subcategoryOrder: typeof s.subcategoryOrder === 'object' && s.subcategoryOrder ? s.subcategoryOrder : {},
    productOrder: Array.isArray(s.productOrder) ? s.productOrder : [],
    posSections: normalizePosSections(s.posSections),
    bankCards: Array.isArray(s.bankCards) ? s.bankCards : [],
    // An empty template falls back to the built-in text.
    smsTemplates: Object.fromEntries(
      (Object.keys(DEFAULT_SMS_TEMPLATES) as SmsTemplateKey[]).map((k) => {
        const saved = s.smsTemplates?.[k]?.trim() || '';
        const untouched = !saved || (k === 'invoice' && saved === LEGACY_INVOICE_SMS);
        return [k, untouched ? DEFAULT_SMS_TEMPLATES[k] : saved];
      }),
    ) as SmsTemplates,
  };
  listeners.forEach((l) => l(cached!));
  return cached;
};

export const settingsService = {
  async get(force = false): Promise<AppSettings> {
    if (cached && !force) return cached;
    if (!inflight) {
      inflight = api
        .get<AppSettings>('/settings')
        .then((r) => publish(r.data))
        .finally(() => {
          inflight = null;
        });
    }
    return inflight;
  },
  async update(
    patch: Omit<Partial<AppSettings>, 'posView' | 'salesView' | 'smsTemplates' | 'backup'> & {
      posView?: Partial<PosView>;
      backup?: Partial<BackupSettings>;
      salesView?: Partial<SalesView>;
      categoryOrder?: string[];
      subcategoryOrder?: Record<string, string[]>;
      productOrder?: string[];
      smsTemplates?: Partial<SmsTemplates>;
    },
  ): Promise<AppSettings> {
    return publish((await api.patch<AppSettings>('/settings', patch)).data);
  },
};

/** Shop settings shared by every screen; refreshed whenever they are saved. */
export function useSettings(): AppSettings {
  const [s, setS] = useState<AppSettings>(cached ?? DEFAULT_SETTINGS);
  useEffect(() => {
    listeners.add(setS);
    settingsService.get().then(setS).catch(() => undefined);
    return () => {
      listeners.delete(setS);
    };
  }, []);
  return s;
}
