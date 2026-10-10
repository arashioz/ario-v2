import { api } from './api';
import { apiErrorMessage, type CreateInvoiceInput, type DepositAccounts, type Invoice, type InvoiceItem, type ShippingPayer, type SplitDetails } from './invoices.service';

export type ProformaStatus = 'pending' | 'shipped' | 'cancelled';

export interface Proforma {
  _id: string;
  number: string;
  status: ProformaStatus;
  saleType: 'retail' | 'supermarket' | 'wholesale';
  fulfillment?: 'shop' | 'factory';
  customerId?: string;
  customerName: string;
  customerPhone?: string;
  branchName?: string;
  orderDate: string;
  items: InvoiceItem[];
  totalAmount: number;
  discount: number;
  finalAmount: number;
  totalWeightKg: number;
  paymentMethod: Invoice['paymentMethod'];
  splitDetails?: SplitDetails;
  depositAccounts?: DepositAccounts;
  paidAmount: number;
  dueDays?: number;
  shippingPayer: ShippingPayer;
  shippingCost: number;
  notes?: string;
  invoiceId?: string;
  invoiceNumber?: string;
  shippedAt?: string;
  cancelledAt?: string;
  createdByName: string;
  createdAt: string;
}

export interface ProformaTerms {
  shippingPayer?: ShippingPayer;
  shippingCost?: number;
  paymentMethod?: Invoice['paymentMethod'];
  splitDetails?: SplitDetails;
  depositAccounts?: DepositAccounts;
  paidAmount?: number;
  discount?: number;
  dueDays?: number;
  notes?: string;
  branchName?: string;
  fulfillment?: 'shop' | 'factory';
  items?: { productId: string; unitPrice: number; factoryUnitCost?: number }[];
}

export const PROFORMA_STATUS_LABELS: Record<ProformaStatus, string> = {
  pending: 'در انتظار ارسال',
  shipped: 'ارسال و نهایی شد',
  cancelled: 'لغو شده',
};

/** Older servers reject dueDays with forbidNonWhitelisted. Drop it and retry once. */
const withoutDueDays = <T extends { dueDays?: number }>(terms: T): Omit<T, 'dueDays'> => {
  const rest = { ...terms };
  delete rest.dueDays;
  return rest;
};

const staleDueDays = (err: unknown) => apiErrorMessage(err, '').includes('dueDays');

export const proformasService = {
  async create(input: CreateInvoiceInput): Promise<Proforma> {
    return (await api.post('/proformas', input)).data;
  },
  async list(status: ProformaStatus | 'all' = 'pending'): Promise<Proforma[]> {
    return (await api.get('/proformas', { params: { status } })).data;
  },
  async summary(): Promise<{ pendingCount: number; pendingAmount: number; pendingKg: number }> {
    return (await api.get('/proformas/summary')).data;
  },
  async update(id: string, terms: ProformaTerms): Promise<Proforma> {
    try {
      return (await api.patch(`/proformas/${id}`, terms)).data;
    } catch (err) {
      if (terms.dueDays == null || !staleDueDays(err)) throw err;
      return (await api.patch(`/proformas/${id}`, withoutDueDays(terms))).data;
    }
  },
  async ship(id: string, terms: ProformaTerms & { date?: string }): Promise<{ proforma: Proforma; invoice: Invoice }> {
    try {
      return (await api.post(`/proformas/${id}/ship`, terms)).data;
    } catch (err) {
      if (terms.dueDays == null || !staleDueDays(err)) throw err;
      return (await api.post(`/proformas/${id}/ship`, withoutDueDays(terms))).data;
    }
  },
  async cancel(id: string): Promise<Proforma> {
    return (await api.post(`/proformas/${id}/cancel`)).data;
  },
};
