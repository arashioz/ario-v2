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
  timeline: { kind: 'purchase' | 'payment'; id: string; date: string; amount: number; label: string; balance: number }[];
  destinations: string[];
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

export interface SupplierProfile {
  company: SupplierCompany;
  registered: boolean;
  isParent: boolean;
  account: SupplierAccount;
  products: SupplierProductRow[];
}

export type SupplierCompanyInput = Partial<Omit<SupplierCompany, '_id'>> & { name?: string };

export const PARENT_COMPANY = 'شرکت قند بلالی';

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
