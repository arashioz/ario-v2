import type { AuditAction } from './schemas/audit-log.schema';

export interface EntityDef {
  entity: string;
  label: string;
  /** Mongoose model name, used to snapshot the record before/after the request. */
  model?: string;
  /** Field the route id refers to (default `_id`). */
  key?: string;
  /** The collection holds a single document (settings). */
  singleton?: boolean;
}

const E = (entity: string, label: string, model?: string, extra: Partial<EntityDef> = {}): EntityDef => ({
  entity,
  label,
  model,
  ...extra,
});

/** First path segment after /api → entity; nested literal segments may point to a sub-entity. */
const RESOURCES: Record<string, { def: EntityDef; subs?: Record<string, EntityDef> }> = {
  invoices: { def: E('invoice', 'فاکتور', 'Invoice') },
  products: { def: E('product', 'کالا', 'Product'), subs: { categories: E('productCategory', 'دسته‌بندی کالا') } },
  customers: {
    def: E('customer', 'مشتری', 'Customer'),
    subs: { transactions: E('customerTransaction', 'تراکنش مشتری', 'CustomerTransaction') },
  },
  cheques: { def: E('cheque', 'چک', 'Cheque') },
  expenses: { def: E('expense', 'هزینه', 'Expense') },
  suppliers: {
    def: E('supplier', 'تأمین‌کننده'),
    subs: {
      companies: E('supplierCompany', 'شرکت تأمین‌کننده', 'SupplierCompany'),
      payments: E('supplierPayment', 'پرداخت به تأمین‌کننده', 'SupplierPayment'),
    },
  },
  notes: { def: E('note', 'یادداشت', 'ShopNote') },
  settings: { def: E('settings', 'تنظیمات', 'AppSettings', { singleton: true }) },
  proformas: { def: E('proforma', 'پیش‌فاکتور', 'Proforma') },
  'follow-ups': { def: E('followUp', 'پیگیری مشتری', 'FollowUp') },
  history: { def: E('history', 'تاریخچه'), subs: { 'company-payments': E('companyPayment', 'پرداخت شرکت', 'CompanyPayment') } },
  shares: { def: E('share', 'لینک اشتراک', 'ShareLink', { key: 'token' }) },
  auth: { def: E('user', 'کاربر', 'User'), subs: { users: E('user', 'کاربر', 'User') } },
  accounting: { def: E('profitWatch', 'نگهبان سود') },
  backup: { def: E('backup', 'پشتیبان'), subs: { files: E('backupFile', 'فایل پشتیبان') } },
};

/** Verb shown for POST sub-actions such as /invoices/:id/payments. */
const ACTION_VERBS: Record<string, string> = {
  payments: 'ثبت پرداخت',
  ship: 'ارسال',
  cancel: 'لغو',
  image: 'آپلود عکس',
  transactions: 'ثبت تراکنش',
  'send-sms': 'ارسال پیامک',
  pdf: 'ساخت PDF',
  price: 'تغییر قیمت',
  stock: 'تغییر موجودی',
  status: 'تغییر وضعیت',
  'bulk-price': 'تغییر گروهی قیمت',
  rename: 'تغییر نام',
  dismiss: 'بررسی‌شده زدن',
  restore: 'برگرداندن هشدار',
  scan: 'بررسی دستی',
  run: 'گرفتن نسخه',
};

export const ACTION_LABELS: Record<AuditAction, string> = {
  create: 'ثبت',
  update: 'ویرایش',
  delete: 'حذف',
  action: 'عملیات',
  login: 'ورود',
  login_failed: 'ورود ناموفق',
  logout: 'خروج',
  password: 'تغییر رمز',
  alert: 'هشدار',
};

export interface ResolvedRoute {
  action: AuditAction;
  def: EntityDef;
  /** Value of the id path parameter, if any. */
  id?: string;
  verb: string;
  /** DELETE /notes/done removes every finished note. */
  bulkFilter?: Record<string, unknown>;
}

const isParam = (s: string) => s.startsWith(':');

/**
 * `routePath` is the Express pattern (e.g. `/api/invoices/:id/delete`), `params` the matched values.
 * Returns null for routes that should not be audited.
 */
export function resolveRoute(method: string, routePath: string, params: Record<string, string>): ResolvedRoute | null {
  const segs = routePath.replace(/^\/?api\/?/, '').split('/').filter(Boolean);
  if (!segs.length) return null;
  const [resource, ...rest0] = segs;
  const res = RESOURCES[resource];
  if (!res) return null;

  let def = res.def;
  let rest = rest0;
  if (rest[0] && !isParam(rest[0]) && res.subs?.[rest[0]]) {
    def = res.subs[rest[0]];
    rest = rest.slice(1);
  }

  const paramSeg = rest.find(isParam);
  const id = paramSeg ? params[paramSeg.slice(1)] : undefined;
  const tail = rest.filter((s) => !isParam(s));
  const last = tail[tail.length - 1];

  if (resource === 'auth') {
    if (last === 'login') return { action: 'login', def, verb: ACTION_LABELS.login };
    if (last === 'logout') return { action: 'logout', def, verb: ACTION_LABELS.logout };
    if (last === 'password') return { action: 'password', def, verb: 'تغییر رمز خود' };
    if (last === 'register') return { action: 'create', def, verb: 'ساخت حساب' };
  }

  if (method === 'DELETE' || last === 'delete') {
    if (resource === 'notes' && last === 'done') {
      return { action: 'delete', def, verb: 'حذف یادداشت‌های انجام‌شده', bulkFilter: { done: true } };
    }
    if (last === 'image') return { action: 'delete', def, id, verb: 'حذف عکس' };
    return { action: 'delete', def, id, verb: ACTION_LABELS.delete };
  }

  if (method === 'PUT' || method === 'PATCH') {
    const verb = last && ACTION_VERBS[last] ? ACTION_VERBS[last] : ACTION_LABELS.update;
    return { action: 'update', def, id, verb };
  }

  if (method === 'POST') {
    if (!id && !tail.length) return { action: 'create', def, verb: ACTION_LABELS.create };
    return { action: 'action', def, id, verb: (last && ACTION_VERBS[last]) || ACTION_LABELS.action };
  }
  return null;
}

/** Best short label for a record in log titles. */
export function recordLabel(doc: any): string {
  if (!doc || typeof doc !== 'object') return '';
  const pick =
    doc.invoiceNumber ||
    doc.number ||
    doc.chequeNumber ||
    doc.fullName ||
    doc.name ||
    doc.username ||
    doc.title ||
    doc.categoryName ||
    doc.supplier ||
    doc.partyName ||
    doc.text ||
    doc.description ||
    '';
  const s = String(pick);
  return s.length > 60 ? `${s.slice(0, 57)}…` : s;
}

export function recordAmount(doc: any): number | undefined {
  if (!doc || typeof doc !== 'object') return undefined;
  const v = doc.finalAmount ?? doc.amount;
  return typeof v === 'number' ? v : undefined;
}
