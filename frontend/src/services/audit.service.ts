import { api } from './api';

export type AuditAction = 'create' | 'update' | 'delete' | 'action' | 'login' | 'login_failed' | 'logout' | 'password' | 'alert';

export const ACTION_LABELS: Record<AuditAction, string> = {
  create: 'ثبت',
  update: 'ویرایش',
  delete: 'حذف',
  action: 'عملیات',
  login: 'ورود',
  login_failed: 'ورود ناموفق',
  logout: 'خروج',
  password: 'تغییر رمز',
  alert: 'هشدار نگهبان',
};

export interface AuditLog {
  _id: string;
  action: AuditAction;
  entity: string;
  entityLabel: string;
  entityId: string;
  title: string;
  amount?: number;
  success: boolean;
  error: string;
  userId: string;
  username: string;
  userFullName: string;
  userRole: string;
  method: string;
  path: string;
  statusCode?: number;
  ip: string;
  userAgent: string;
  durationMs?: number;
  createdAt: string;
  changesCount?: number;
  changes?: { path: string; from?: unknown; to?: unknown }[];
  before?: unknown;
  after?: unknown;
  body?: unknown;
}

export interface AuditQuery {
  action?: string;
  entity?: string;
  userId?: string;
  entityId?: string;
  search?: string;
  from?: string;
  to?: string;
  failed?: boolean;
  page?: number;
  limit?: number;
}

export interface AuditStats {
  total: number;
  last24h: { create: number; update: number; delete: number; failed: number; loginFailed: number; alerts: number };
  users: { userId: string; name: string; username: string; count: number }[];
  entities: { entity: string; label: string; count: number }[];
}

export const auditService = {
  async list(q: AuditQuery): Promise<{ items: AuditLog[]; total: number; page: number; pages: number }> {
    const params: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== '' && v !== false) params[k] = v === true ? 'true' : (v as string | number);
    return (await api.get('/audit-logs', { params })).data;
  },
  async get(id: string): Promise<AuditLog> {
    return (await api.get(`/audit-logs/${id}`)).data;
  },
  async stats(): Promise<AuditStats> {
    return (await api.get('/audit-logs/stats')).data;
  },
};

/** Persian names for common record fields shown in change lists. */
export const FIELD_LABELS: Record<string, string> = {
  invoiceNumber: 'شماره فاکتور',
  invoiceDate: 'تاریخ فاکتور',
  customerName: 'مشتری / تأمین‌کننده',
  customerPhone: 'تلفن مشتری',
  customerId: 'مشتری',
  totalAmount: 'جمع کل',
  discount: 'تخفیف',
  finalAmount: 'مبلغ نهایی',
  paidAmount: 'پرداختی',
  remainingDebt: 'مانده نسیه',
  creditAmount: 'نسیه',
  paymentMethod: 'روش پرداخت',
  isPaid: 'تسویه',
  shippingPayer: 'پرداخت‌کننده کرایه',
  shippingCost: 'کرایه',
  notes: 'توضیحات',
  items: 'اقلام',
  quantity: 'تعداد',
  unitPrice: 'فی',
  totalPrice: 'جمع ردیف',
  weightKg: 'وزن (کیلو)',
  productName: 'کالا',
  name: 'نام',
  fullName: 'نام کامل',
  username: 'نام کاربری',
  role: 'نقش',
  isActive: 'فعال',
  phoneNumber: 'تلفن',
  address: 'آدرس',
  balance: 'مانده حساب',
  creditLimit: 'سقف اعتبار',
  sellPrice: 'قیمت فروش',
  buyPrice: 'قیمت خرید',
  priceRetail: 'قیمت تکی',
  priceSupermarket: 'قیمت سوپرمارکت',
  priceWholesale: 'قیمت عمده',
  stock: 'موجودی',
  weightPerUnitKg: 'وزن هر واحد',
  category: 'دسته',
  amount: 'مبلغ',
  date: 'تاریخ',
  description: 'شرح',
  status: 'وضعیت',
  dueDate: 'سررسید',
  chequeNumber: 'شماره چک',
  bankName: 'بانک',
  text: 'متن',
  done: 'انجام‌شده',
  password: 'رمز عبور',
  image: 'عکس',
  categoryName: 'دسته هزینه',
  supplier: 'تأمین‌کننده',
};

export const fieldLabel = (path: string) =>
  path
    .split('.')
    .map((seg) => (/^\d+$/.test(seg) ? `ردیف ${Number(seg) + 1}` : FIELD_LABELS[seg] ?? seg))
    .join(' › ');
