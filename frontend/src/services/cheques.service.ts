import { api } from './api';

export interface Cheque {
  _id: string;
  type: 'received' | 'paid';
  chequeNumber: string;
  sayadNumber?: string;
  bankName: string;
  branchName?: string;
  amount: number;
  issueDate: string;
  dueDate: string;
  customerId?: string;
  partyName: string;
  partyPhone?: string;
  drawerName?: string;
  status: 'pending' | 'passed' | 'bounced' | 'endorsed';
  statusDate?: string;
  statusNotes?: string;
  invoiceNumber?: string;
  notes?: string;
  recordedByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChequeStats {
  pendingReceivedAmount: number;
  pendingReceivedCount: number;
  pendingPaidAmount: number;
  pendingPaidCount: number;
  dueSoonCount: number;
  dueSoonAmount: number;
  passedAmount: number;
  bouncedCount: number;
  bouncedAmount: number;
}

export interface CreateChequeInput {
  type: 'received' | 'paid';
  chequeNumber: string;
  sayadNumber?: string;
  bankName: string;
  branchName?: string;
  amount: number;
  issueDate?: string;
  dueDate: string;
  customerId?: string;
  partyName: string;
  partyPhone?: string;
  drawerName?: string;
  status?: 'pending' | 'passed' | 'bounced' | 'endorsed';
  invoiceNumber?: string;
  notes?: string;
}

export interface UpdateChequeStatusInput {
  status: 'pending' | 'passed' | 'bounced' | 'endorsed';
  statusDate?: string;
  statusNotes?: string;
}

export const chequesService = {
  async getAll(params?: {
    type?: string;
    status?: string;
    dueSoon?: string;
    search?: string;
  }): Promise<Cheque[]> {
    const res = await api.get<Cheque[]>('/cheques', { params });
    return res.data;
  },

  async getStats(): Promise<ChequeStats> {
    const res = await api.get<ChequeStats>('/cheques/stats');
    return res.data;
  },

  async getById(id: string): Promise<Cheque> {
    const res = await api.get<Cheque>(`/cheques/${id}`);
    return res.data;
  },

  async create(data: CreateChequeInput): Promise<Cheque> {
    const res = await api.post<Cheque>('/cheques', data);
    return res.data;
  },

  async updateStatus(id: string, data: UpdateChequeStatusInput): Promise<Cheque> {
    const res = await api.patch<Cheque>(`/cheques/${id}/status`, data);
    return res.data;
  },

  async delete(id: string): Promise<boolean> {
    const res = await api.delete<{ success: boolean }>(`/cheques/${id}`);
    return res.data.success;
  },
};
