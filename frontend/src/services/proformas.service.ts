import { api } from './api';
import type { CreateInvoiceInput, DepositAccounts, Invoice, InvoiceItem, ShippingPayer, SplitDetails } from './invoices.service';

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
    return (await api.patch(`/proformas/${id}`, terms)).data;
  },
  async ship(id: string, terms: ProformaTerms & { date?: string }): Promise<{ proforma: Proforma; invoice: Invoice }> {
    return (await api.post(`/proformas/${id}/ship`, terms)).data;
  },
  async cancel(id: string): Promise<Proforma> {
    return (await api.post(`/proformas/${id}/cancel`)).data;
  },
};
