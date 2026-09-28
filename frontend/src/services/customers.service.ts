import { api } from './api';

/** shop: a store that buys to resell; walkin: a walk-in buyer (name and phone only). */
export type CustomerKind = 'shop' | 'walkin';

export const CUSTOMER_KIND_LABELS: Record<CustomerKind, string> = { shop: 'فروشنده', walkin: 'حضوری' };

export interface Customer {
  _id: string;
  name: string;
  phoneNumber: string;
  phoneSecondary?: string;
  address?: string;
  customerType?: 'retail' | 'supermarket' | 'wholesale';
  kind?: CustomerKind;
  latitude?: number;
  longitude?: number;
  notes?: string;
  balance: number; // >0: بدهکار, =0: تسویه, <0: بستانکار
  creditLimit: number;
  isActive: boolean;
  lastTransactionDate: string;
  createdAt: string;
  updatedAt: string;
}

export type TransactionType = 'debt' | 'payment' | 'adjustment';
export type PaymentMethod = 'cash' | 'pos' | 'transfer' | 'cheque';

export interface PaymentAllocation {
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
}

export interface CustomerTransaction {
  _id: string;
  customer: string;
  type: TransactionType;
  amount: number;
  balanceAfter: number;
  paymentMethod?: PaymentMethod;
  description: string;
  referenceNumber?: string;
  /** Card payments: shop bank account the money landed in. */
  accountId?: string;
  invoiceId?: string;
  invoiceNumber?: string;
  allocations?: PaymentAllocation[];
  recordedByName?: string;
  date: string;
  createdAt: string;
}

export interface PaymentRow extends Omit<CustomerTransaction, 'customer'> {
  customer: { _id: string; name: string; phoneNumber?: string } | null;
}

export interface CustomerStats {
  totalCustomers: number;
  debtorsCount: number;
  totalDebt: number;
  settledCount: number;
  shopsCount?: number;
  walkInCount?: number;
  creditorsCount: number;
  totalCredit: number;
}

export interface CreateCustomerInput {
  name: string;
  phoneNumber: string;
  phoneSecondary?: string;
  address?: string;
  customerType?: 'retail' | 'supermarket' | 'wholesale';
  kind?: CustomerKind;
  latitude?: number;
  longitude?: number;
  notes?: string;
  initialDebt?: number;
  creditLimit?: number;
}

export interface RecordTransactionInput {
  type: TransactionType;
  amount: number;
  paymentMethod?: PaymentMethod;
  description?: string;
  referenceNumber?: string;
  invoiceId?: string;
  date?: string;
  accountId?: string;
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'نقد',
  pos: 'کارتخوان',
  transfer: 'کارت‌به‌کارت',
  cheque: 'چک',
};

export const customersService = {
  async listPayments(params?: {
    from?: string;
    to?: string;
    search?: string;
  }): Promise<{ total: number; count: number; items: PaymentRow[] }> {
    const res = await api.get('/customers/payments', { params });
    return res.data;
  },

  async deleteTransaction(txId: string): Promise<{ message: string }> {
    const res = await api.delete(`/customers/transactions/${txId}`);
    return res.data;
  },

  async getCustomers(params?: {
    search?: string;
    filter?: 'all' | 'debtors' | 'settled' | 'creditors';
    kind?: CustomerKind;
  }): Promise<Customer[]> {
    const res = await api.get('/customers', { params });
    return res.data;
  },

  getAll(params?: {
    search?: string;
    filter?: 'all' | 'debtors' | 'settled' | 'creditors';
  }): Promise<Customer[]> {
    return this.getCustomers(params);
  },

  getStats(): Promise<CustomerStats> {
    return this.getCustomerStats();
  },

  create(data: CreateCustomerInput): Promise<Customer> {
    return this.createCustomer(data);
  },

  update(id: string, data: Partial<CreateCustomerInput>): Promise<Customer> {
    return this.updateCustomer(id, data);
  },

  async getCustomerStats(): Promise<CustomerStats> {
    const res = await api.get('/customers/stats');
    return res.data;
  },

  async getCustomer(id: string): Promise<Customer> {
    const res = await api.get(`/customers/${id}`);
    return res.data;
  },

  async createCustomer(data: CreateCustomerInput): Promise<Customer> {
    const res = await api.post('/customers', data);
    return res.data;
  },

  async updateCustomer(id: string, data: Partial<CreateCustomerInput>): Promise<Customer> {
    const res = await api.patch(`/customers/${id}`, data);
    return res.data;
  },

  async deleteCustomer(id: string): Promise<{ message: string }> {
    const res = await api.delete(`/customers/${id}`);
    return res.data;
  },

  async recordTransaction(
    customerId: string,
    data: RecordTransactionInput
  ): Promise<{ customer: Customer; transaction: CustomerTransaction }> {
    const res = await api.post(`/customers/${customerId}/transactions`, data);
    return res.data;
  },

  async getCustomerTransactions(customerId: string): Promise<CustomerTransaction[]> {
    const res = await api.get(`/customers/${customerId}/transactions`);
    return res.data;
  },

  async sendDebtReminderSms(customerId: string): Promise<{
    success: boolean;
    recipientName: string;
    phoneNumber: string;
    amount: number;
    messageText: string;
    sentAt: string;
  }> {
    const res = await api.post(`/customers/${customerId}/send-sms`);
    return res.data;
  },
};
