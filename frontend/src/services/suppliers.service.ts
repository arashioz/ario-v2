import { api } from './api';
import { deliverFile } from '../lib/download';

export type SupplierPaymentMethod = 'card_to_card' | 'card' | 'transfer' | 'cash' | 'cheque' | 'pos';

export const SUPPLIER_METHOD_LABELS: Record<SupplierPaymentMethod, string> = {
  card_to_card: 'کارت‌به‌کارت',
  card: 'واریز کارتی',
  transfer: 'حواله / پایا',
  cash: 'نقد',
  cheque: 'چک',
  pos: 'کارتخوان',
};

export interface SupplierPaymentRow {
  _id: string;
  date: string;
  amount: number;
  method: SupplierPaymentMethod;
  destination: string;
  destinationAccount: string;
  notes: string;
  rawSupplier: string;
  legacy: boolean;
  externalRef?: string;
  allocations: { invoiceId: string; invoiceNumber: string; amount: number }[];
  unallocated: number;
  createdAt: string;
}

export interface SupplierInvoiceRow {
  invoiceId: string;
  invoiceNumber: string;
  date: string;
  amount: number;
  kg: number;
  credit: number;
  upfront: number;
  paid: number;
  remaining: number;
  fulfillment?: 'shop' | 'factory';
  settledAt: string | null;
  ageDays: number;
  payments: { paymentId: string; date: string; amount: number }[];
}

export interface SupplierAccount {
  supplier: string;
  summary: {
    purchasesTotal: number;
    purchasesCount: number;
    purchasedKg: number;
    paidOnSpot: number;
    creditTotal: number;
    paymentsTotal: number;
    paymentsCount: number;
    adjustmentsTotal: number;
    adjustmentsCount: number;
    totalPaid: number;
    debt: number;
    prepaid: number;
    unallocated: number;
    openInvoices: number;
    oldestOpenDate: string | null;
    oldestOpenInvoice: string | null;
    lastPaymentDate: string | null;
  };
  purchaseChannels?: {
    shop: { count: number; amount: number; kg: number };
    factory: { count: number; amount: number; kg: number };
  };
  byDestination: { destination: string; amount: number; count: number; lastDate: string; accounts: string[] }[];
  byMethod: { method: SupplierPaymentMethod; amount: number; count: number }[];
  payments: SupplierPaymentRow[];
  invoices: SupplierInvoiceRow[];
  adjustments: SupplierAdjustmentRow[];
  timeline: { kind: 'purchase' | 'payment' | 'adjustment'; id: string; date: string; amount: number; increasesDebt: boolean; label: string; balance: number }[];
  destinations: string[];
}

export interface SupplierAdjustmentRow {
  _id: string;
  date: string;
  /** Signed. Positive increases what we owe. */
  amount: number;
  kind: 'opening' | 'reconcile';
  externalRef: string;
  title: string;
  notes: string;
  relatedInvoiceNumber: string;
  createdAt?: string;
}

export interface SupplierAdjustmentInput {
  supplier?: string;
  date: string;
  amount: number;
  kind?: 'opening' | 'reconcile';
  title: string;
  notes?: string;
  relatedInvoiceNumber?: string;
  externalRef?: string;
}

export interface SupplierPaymentInput {
  supplier?: string;
  amount: number;
  /** YYYY-MM-DD */
  date: string;
  method: SupplierPaymentMethod;
  destination?: string;
  destinationAccount?: string;
  notes?: string;
}

export interface SupplierBankAccount {
  holder: string;
  bank: string;
  cardNumber: string;
  iban: string;
  accountNumber: string;
}

export interface SupplierCompany {
  _id: string | null;
  name: string;
  phone: string;
  contactName: string;
  address: string;
  notes: string;
  accounts: SupplierBankAccount[];
  isActive: boolean;
}

export interface SupplierListItem {
  _id: string | null;
  name: string;
  phone: string;
  contactName: string;
  accountsCount: number;
  isActive: boolean;
  registered: boolean;
  isParent: boolean;
  debt: number;
  prepaid: number;
  purchasesTotal: number;
  purchasesCount: number;
  purchasedKg: number;
  paymentsTotal: number;
  openInvoices: number;
  lastPurchaseDate: string | null;
}

export interface SupplierProductRow {
  productId: string;
  name: string;
  unit: string;
  kg: number;
  quantity: number;
  amount: number;
  invoices: number;
  lastDate: string | null;
  lastUnitPrice: number;
  lastPricePerKg: number;
  avgPricePerKg: number;
  stock: number | null;
  isDefault: boolean;
}

export interface SupplierTrade {
  revenue: number;
  cost: number;
  profit: number;
  kg: number;
  salesCount: number;
  sales: { invoiceId: string; invoiceNumber: string; date: string | null; customerName: string; amount: number; profit: number }[];
}

export interface SupplierProfile {
  company: SupplierCompany;
  registered: boolean;
  isParent: boolean;
  account: SupplierAccount;
  trade?: SupplierTrade;
  products: SupplierProductRow[];
}

export type SupplierCompanyInput = Partial<Omit<SupplierCompany, '_id'>> & { name?: string };

export interface SupplierStatement {
  supplier: string;
  from: string | null;
  to: string | null;
  opening: { debit: number; credit: number };
  period: { debit: number; credit: number };
  closing: { debit: number; credit: number };
  products: { productId: string; name: string; unit: string; quantity: number; kg: number; amount: number; invoices: number }[];
}

export const PARENT_COMPANY = 'شرکت قند بلالی';

const cleanSupplier = (s: string) =>
  (s || '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\s+/g, ' ')
    .trim();

/** Same parent-company aliases as the server. Other companies stay on their own account. */
export function isParentCompany(name: string | null | undefined): boolean {
  const s = cleanSupplier(name ?? '');
  if (!s || s === 'شرکت' || s.startsWith('شرکت بنام') || s.startsWith('شرکت به نام') || s.includes('بلالی')) return true;
  return s === PARENT_COMPANY;
}

/** "IR19 0120 …" / "6219 8619 …" for display. */
export const formatAccountNumber = (a: string) =>
  a.startsWith('IR') ? a.replace(/(.{4})/g, '$1 ').trim() : a.replace(/(\d{4})(?=\d)/g, '$1-');

export const suppliersService = {
  async list(): Promise<SupplierListItem[]> {
    return (await api.get('/suppliers')).data;
  },
  async profile(name?: string): Promise<SupplierProfile> {
    return (await api.get('/suppliers/profile', { params: { name } })).data;
  },
  async reassignProducts(input: { productIds: string[]; to: string; from?: string }): Promise<{ products: number; movedInvoices: number; splitInvoices: number; to: string }> {
    return (await api.post('/suppliers/products/reassign', input)).data;
  },
  async createCompany(input: SupplierCompanyInput): Promise<SupplierCompany> {
    return (await api.post('/suppliers/companies', input)).data;
  },
  async updateCompany(id: string, input: SupplierCompanyInput): Promise<SupplierCompany> {
    return (await api.patch(`/suppliers/companies/${id}`, input)).data;
  },
  async removeCompany(id: string): Promise<{ message: string }> {
    return (await api.delete(`/suppliers/companies/${id}`)).data;
  },
  async statement(name: string | undefined, from?: string, to?: string): Promise<SupplierStatement> {
    const res = await api.get('/suppliers/statement', { params: { name, from, to } });
    return res.data;
  },

  async account(name?: string): Promise<SupplierAccount> {
    return (await api.get('/suppliers/account', { params: { name } })).data;
  },
  async createPayment(input: SupplierPaymentInput): Promise<SupplierAccount> {
    return (await api.post('/suppliers/payments', input)).data;
  },
  async updatePayment(id: string, input: Partial<SupplierPaymentInput>): Promise<SupplierAccount> {
    return (await api.patch(`/suppliers/payments/${id}`, input)).data;
  },
  async removePayment(id: string): Promise<SupplierAccount> {
    return (await api.delete(`/suppliers/payments/${id}`)).data;
  },
  async createAdjustment(input: SupplierAdjustmentInput): Promise<SupplierAccount> {
    return (await api.post('/suppliers/adjustments', input)).data;
  },
  async updateAdjustment(id: string, input: Partial<SupplierAdjustmentInput>): Promise<SupplierAccount> {
    return (await api.patch(`/suppliers/adjustments/${id}`, input)).data;
  },
  async removeAdjustment(id: string): Promise<SupplierAccount> {
    return (await api.delete(`/suppliers/adjustments/${id}`)).data;
  },
  /** خروجی اکسل صورت‌حساب و مغایرت‌گیری برای شرکت مادر و سایر شرکت‌ها */
  async exportReconciliation(name?: string): Promise<void> {
    const res = await api.get<Blob>('/suppliers/export', {
      params: name ? { name } : {},
      responseType: 'blob',
      timeout: 60_000,
    });
    const safe = (name || 'شرکت_مادر').replace(/[/\\?%*:|"<> ]/g, '_');
    await deliverFile(res.data, `صورت_حساب_مغایرت_${safe}.csv`);
  },
};
