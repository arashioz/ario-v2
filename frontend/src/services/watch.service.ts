import { api } from './api';

export type Severity = 'error' | 'warning' | 'info';

export interface WatchFinding {
  id: string;
  rule: string;
  severity: Severity;
  title: string;
  detail: string;
  invoiceId?: string;
  invoiceNumber?: string;
  otherInvoiceId?: string;
  otherInvoiceNumber?: string;
  invoiceType?: 'sale' | 'purchase';
  productId?: string;
  productName?: string;
  customerName?: string;
  date?: string;
  impact?: number;
  dismissed?: { by: string; note: string; at?: string };
}

export interface WatchReport {
  status: { scannedAt: string; durationMs: number; invoices: number; saleLines: number; lots: number; intervalSec: number };
  counts: Record<Severity | 'dismissed', number>;
  impact: number;
  byRule: Record<string, number>;
  health: { id: string; label: string; ok: boolean; detail: string }[];
  rules: Record<string, { label: string; severity: Severity; help: string }>;
  findings: WatchFinding[];
}

export interface PriceChartProduct {
  productId: string;
  name: string;
  unit: string;
  category: string;
  weightPerUnitKg: number;
  soldKg: number;
  purchases: { date: string; costPerKg: number; invoicePricePerKg: number; kg: number; invoiceNumber: string; invoiceId: string; supplier: string }[];
  sales: { date: string; avgPerKg: number; minPerKg: number; maxPerKg: number; kg: number; count: number }[];
  list: { date: string; price: number; perKg: number | null; by: string }[];
  changes?: { date: string; unitPrice: number; pricePerKg: number; invoiceNumber: string; invoiceId: string }[];
  current: { retail: number; supermarket: number; wholesale: number; retailPerKg: number; wholesalePerKg: number };
  lastCostPerKg: number | null;
  costChange30Percent: number;
  avgSell30PerKg: number | null;
  listMarginPercent: number | null;
}

export const watchService = {
  async report(severity?: Severity | 'dismissed'): Promise<WatchReport> {
    return (await api.get('/accounting/watch', { params: severity ? { severity } : {} })).data;
  },
  async rescan(): Promise<WatchReport> {
    return (await api.post('/accounting/watch/scan', null, { timeout: 60000 })).data;
  },
  async dismiss(id: string, note = '') {
    return (await api.post('/accounting/watch/dismiss', { id, note })).data;
  },
  async restore(id: string) {
    return (await api.post('/accounting/watch/restore', { id })).data;
  },
  async priceChart(): Promise<PriceChartProduct[]> {
    return (await api.get('/accounting/price-chart', { timeout: 30000 })).data;
  },
};
