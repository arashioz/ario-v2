import { api } from './api';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export interface ShareLinkInfo {
  token: string;
  title: string;
  kind: 'supplier-payments';
  params: Record<string, string>;
  createdAt: string;
  pdfFile?: string;
}

export interface SupplierPaymentsReport {
  token: string;
  kind: 'supplier-payments';
  title: string;
  shopName: string;
  generatedAt: string;
  hasPdf: boolean;
  supplier: string;
  period: { from: string | null; to: string | null };
  summary: {
    paymentsTotal: number;
    paymentsCount: number;
    purchasesTotal: number;
    purchasesCount: number;
    purchasesKg: number;
    debtNow: number;
    prepaidNow: number;
    allTimePurchases: number;
    allTimePaid: number;
  };
  byDestination: { key: string; amount: number; count: number; accounts: string[] }[];
  byMethod: { key: string; amount: number; count: number; accounts: string[] }[];
  payments: {
    date: string;
    amount: number;
    method: string;
    destination: string;
    destinationAccount: string;
    notes: string;
    invoices: string[];
  }[];
}

const absolute = (path: string) => new URL(path, window.location.origin).toString();

export const sharesService = {
  async create(kind: 'supplier-payments', params: Record<string, string | undefined>): Promise<ShareLinkInfo> {
    const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => !!v)) as Record<string, string>;
    return (await api.post('/shares', { kind, params: clean })).data;
  },
  async list(): Promise<ShareLinkInfo[]> {
    return (await api.get('/shares')).data;
  },
  async remove(token: string) {
    return (await api.delete(`/shares/${token}`)).data;
  },
  async uploadPdf(token: string, pdf: Blob) {
    const form = new FormData();
    form.append('file', pdf, `report-${token}.pdf`);
    return (await api.post(`/shares/${token}/pdf`, form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60000 })).data;
  },
  /** Public — no login needed. */
  async report(token: string): Promise<SupplierPaymentsReport> {
    return (await api.get(`/public/shares/${token}`)).data;
  },
  onlineUrl: (token: string) => absolute(`/share/${token}`),
  pdfUrl: (token: string) => absolute(`${API_BASE}/public/shares/${token}/pdf`),
};
