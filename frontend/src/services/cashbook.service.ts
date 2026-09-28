import { api } from './api';

export type CashChannel = 'cash' | 'bank' | 'cheque';

export const CHANNEL_LABELS: Record<CashChannel, string> = {
  cash: 'نقد (صندوق)',
  bank: 'بانک و کارت',
  cheque: 'چک',
};

export interface CashEntry {
  date: string;
  direction: 'in' | 'out';
  kind: string;
  channel: CashChannel;
  method: string;
  amount: number;
  title: string;
  ref?: string;
  accountId?: string;
}

export interface Cashbook {
  period: { from: string | null; to: string | null };
  summary: { in: number; out: number; net: number; count: number };
  byKind: { kind: string; label: string; direction: 'in' | 'out'; amount: number; count: number }[];
  byChannel: { channel: CashChannel; in: number; out: number; net: number }[];
  byMethod: { method: string; in: number; out: number; net: number }[];
  /** کارت‌به‌کارت received per shop account; accountId '' = not recorded. */
  byAccount: { accountId: string; in: number; count: number }[];
  byDay: { date: string; in: number; out: number }[];
  entries: CashEntry[];
}

export interface LegacyLedger {
  summary: { in: number; out: number; net: number; count: number };
  types: { type: string; label: string; direction: 'in' | 'out'; amount: number; count: number; first: string; last: string }[];
  rows: { _id: string; date: string; type: string; label: string; direction: 'in' | 'out'; amount: number; description: string }[];
}

export const cashbookService = {
  async cashbook(from?: string, to?: string): Promise<Cashbook> {
    return (await api.get('/history/cashbook', { params: { from, to } })).data;
  },
  async legacy(type?: string, limit = 300): Promise<LegacyLedger> {
    return (await api.get('/history/legacy-ledger', { params: { type, limit } })).data;
  },
};
