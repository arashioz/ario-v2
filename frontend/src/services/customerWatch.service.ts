import { api } from './api';
import type { InvoiceItem } from './invoices.service';
import type { Proforma } from './proformas.service';

export type WatchGrade = 'A' | 'B' | 'C' | 'D';

export const GRADE_LABELS: Record<WatchGrade, string> = {
  A: 'طلایی',
  B: 'نقره‌ای',
  C: 'برنزی',
  D: 'راکد',
};

export const GRADE_TONE: Record<WatchGrade, string> = {
  A: 'bg-amber-100 text-amber-800 border-amber-200',
  B: 'bg-slate-200 text-slate-700 border-slate-300',
  C: 'bg-orange-100 text-orange-800 border-orange-200',
  D: 'bg-rose-50 text-rose-700 border-rose-200',
};

export interface CustomerWatchSettings {
  gradeAMonthAmount: number;
  gradeBMonthAmount: number;
  gradeCMonthAmount: number;
  gradeAYearAmount: number;
  gradeBYearAmount: number;
  gradeCYearAmount: number;
  quietDaysA: number;
  quietDaysB: number;
  quietDaysC: number;
  quietDaysD: number;
  dropSizeInvoices: number;
  dropSizeDropPercent: number;
  suggestMode: 'mix' | 'last' | 'top';
  suggestTopProducts: number;
  ruleQuiet: boolean;
  ruleDebt: boolean;
  ruleDropOff: boolean;
  ruleChampion: boolean;
  planFollowUp: boolean;
  planDays: number;
}

export const DEFAULT_WATCH: CustomerWatchSettings = {
  gradeAMonthAmount: 30_000_000,
  gradeBMonthAmount: 10_000_000,
  gradeCMonthAmount: 2_000_000,
  gradeAYearAmount: 250_000_000,
  gradeBYearAmount: 80_000_000,
  gradeCYearAmount: 20_000_000,
  quietDaysA: 21,
  quietDaysB: 30,
  quietDaysC: 45,
  quietDaysD: 75,
  dropSizeInvoices: 6,
  dropSizeDropPercent: 40,
  suggestMode: 'mix',
  suggestTopProducts: 4,
  ruleQuiet: true,
  ruleDebt: true,
  ruleDropOff: true,
  ruleChampion: true,
  planFollowUp: true,
  planDays: 2,
};

export interface WatchQueueRow {
  _id: string;
  name: string;
  phoneNumber?: string;
  balance: number;
  watchGrade?: WatchGrade | '';
  watchScore?: number;
  watchMonthAmount?: number;
  watchDropKg?: number;
  watchTopProductName?: string;
  watchReason?: string;
  watchAction?: string;
  lastSaleAt?: string;
}

export interface WatchBoard {
  rules: CustomerWatchSettings;
  scored: number;
  total: number;
  grades: Record<WatchGrade | 'none', number>;
  queue: WatchQueueRow[];
  queueCount: number;
}

export interface SuggestItem extends InvoiceItem {
  stock?: number;
}

export interface WatchSuggestion {
  source: string;
  sourceLabel: string;
  saleType: string;
  dropAmount: number;
  dropKg: number;
  items: SuggestItem[];
  totalAmount: number;
  totalWeightKg: number;
}

export interface WatchResume {
  customer: {
    id: string;
    name: string;
    phoneNumber: string;
    customerType?: string;
    balance: number;
    lastSaleAt?: string | null;
    lastContactAt?: string | null;
    lastContactResult?: string;
    lastContactNote?: string;
  };
  grade: WatchGrade;
  score: number;
  quietDays: number | null;
  monthAmount: number;
  monthKg: number;
  monthInvoices: number;
  yearAmount: number;
  yearKg: number;
  yearInvoices: number;
  dropAmount: number;
  dropKg: number;
  topProductName: string;
  topProductKg: number;
  reason: string;
  action: string;
  lastInvoiceId: string;
  lastInvoiceNumber: string;
  recent: { id: string; number: string; date: string; amount: number; kg: number; items: string[] }[];
  suggestion: WatchSuggestion;
}

export const customerWatchService = {
  board: async (): Promise<WatchBoard> => (await api.get('/watch/board')).data,
  scan: async (): Promise<WatchBoard & { scanned: number; planned: number }> =>
    (await api.post('/watch/scan', {}, { timeout: 120000 })).data,
  resume: async (id: string, params?: { source?: string; invoiceId?: string }): Promise<WatchResume> =>
    (await api.get(`/watch/customers/${id}`, { params })).data,
  suggest: async (id: string, params?: { source?: string; invoiceId?: string }): Promise<WatchSuggestion> =>
    (await api.get(`/watch/customers/${id}/suggest`, { params })).data,
  toProforma: async (id: string, body?: { source?: string; invoiceId?: string }): Promise<Proforma> =>
    (await api.post(`/watch/customers/${id}/proforma`, body || {})).data,
};
