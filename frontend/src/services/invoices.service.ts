import { api } from './api';

export interface InvoiceItem {
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
  secondaryQuantity?: number;
  secondaryUnit?: string;
  unitPrice: number;
  totalPrice: number;
  weightKg?: number;
}

export interface SplitDetails {
  pos?: number;
  cash?: number;
  transfer?: number;
  cheque?: number;
  credit?: number;
}

/** Shop bank account id (settings.bankCards[].id) each card method was deposited to. */
export interface DepositAccounts {
  pos?: string;
  transfer?: string;
}

export type ShippingPayer = 'none' | 'customer' | 'me';

export const SHIPPING_PAYER_LABELS: Record<ShippingPayer, string> = {
  none: 'بدون هزینه ارسال',
  customer: 'با مشتری',
  me: 'با من',
};

export interface Invoice {
  _id: string;
  invoiceNumber: string;
  type: 'sale' | 'purchase';
  saleType: 'retail' | 'supermarket' | 'wholesale';
  customerId?: string;
  customerName: string;
  customerPhone?: string;
  invoiceDate: string;
  items: InvoiceItem[];
  totalAmount: number;
  discount: number;
  finalAmount: number;
  totalWeightKg: number;
  paymentMethod: 'pos' | 'cash' | 'transfer' | 'cheque' | 'credit' | 'split';
  splitDetails?: SplitDetails;
  depositAccounts?: DepositAccounts;
  isPaid: boolean;
  paidAmount: number;
  remainingDebt: number;
  creditAmount?: number;
  /** Earlier customer credit applied to this invoice, without new money coming in. */
  creditApplied?: number;
  dueDate?: string;
  dueDays?: number;
  /** shop stock, or goods that left the factory and never touched the shop. */
  fulfillment?: 'shop' | 'factory';
  customerPrevBalance: number;
  customerNewBalance: number;
  shippingPayer?: ShippingPayer;
  shippingCost?: number;
  proformaNumber?: string;
  shippedAt?: string;
  legacyPayments?: { date: string; amount: number; method?: string; accountId?: string }[];
  notes?: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateInvoiceInput {
  type?: 'sale' | 'purchase';
  saleType?: 'retail' | 'supermarket' | 'wholesale';
  customerId?: string;
  customerName: string;
  customerPhone?: string;
  invoiceDate?: string;
  items: InvoiceItem[];
  totalAmount: number;
  discount?: number;
  finalAmount: number;
  totalWeightKg?: number;
  paymentMethod: 'pos' | 'cash' | 'transfer' | 'cheque' | 'credit' | 'split';
  splitDetails?: SplitDetails;
  paidAmount?: number;
  notes?: string;
  shippingPayer?: ShippingPayer;
  shippingCost?: number;
  depositAccounts?: DepositAccounts;
  dueDays?: number;
  fulfillment?: 'shop' | 'factory';
}

export const invoiceDueDate = (inv: Pick<Invoice, 'type' | 'remainingDebt' | 'dueDate' | 'dueDays' | 'invoiceDate' | 'createdAt'>): Date | null => {
  if (inv.type !== 'sale' || !(inv.remainingDebt > 0)) return null;
  if (inv.dueDate) return new Date(inv.dueDate);
  const base = new Date(inv.invoiceDate || inv.createdAt);
  return new Date(base.getTime() + (inv.dueDays ?? 15) * 86400000);
};

export const isOverdue = (inv: Invoice): boolean => {
  const due = invoiceDueDate(inv);
  return !!due && due.getTime() < Date.now();
};

export interface InvoiceStats {
  todaySalesAmount: number;
  todaySalesWeightKg: number;
  todaySalesTonnage: number;
  todayInvoicesCount: number;
  totalSalesAmount: number;
  totalSalesWeightKg: number;
  totalSalesTonnage: number;
  totalInvoicesCount: number;
  chartData: {
    date: string;
    dayName: string;
    amount: number;
    weightKg: number;
    tonnage: number;
  }[];
}

export const invoicesService = {
  getAll: async (params?: {
    type?: string;
    saleType?: string;
    customerId?: string;
    search?: string;
    isPaid?: string;
  }): Promise<Invoice[]> => {
    const response = await api.get<Invoice[]>('/invoices', { params });
    return response.data;
  },

  getById: async (id: string): Promise<Invoice> => {
    const response = await api.get<Invoice>(`/invoices/${id}`);
    return response.data;
  },

  getStats: async (): Promise<InvoiceStats> => {
    const response = await api.get<InvoiceStats>('/invoices/stats');
    return response.data;
  },

  create: async (data: CreateInvoiceInput): Promise<Invoice> => {
    const response = await api.post<Invoice>('/invoices', data);
    return response.data;
  },

  update: async (id: string, data: CreateInvoiceInput): Promise<Invoice> => {
    const response = await api.put<Invoice>(`/invoices/${id}`, data);
    return response.data;
  },

  remove: async (id: string, password: string): Promise<{ message: string }> => {
    const response = await api.post(`/invoices/${id}/delete`, { password });
    return response.data;
  },

  setDueDays: async (id: string, dueDays: number): Promise<Invoice> => {
    const response = await api.post<Invoice>(`/invoices/${id}/due`, { dueDays });
    return response.data;
  },

  addPayment: async (
    id: string,
    data: { amount: number; paymentMethod?: string; description?: string; accountId?: string },
  ): Promise<Invoice> => {
    const response = await api.post<Invoice>(`/invoices/${id}/payments`, data);
    return response.data;
  },
};

export const apiErrorMessage = (err: unknown, fallback: string): string => {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  if (Array.isArray(msg)) return msg[0];
  return msg || fallback;
};
