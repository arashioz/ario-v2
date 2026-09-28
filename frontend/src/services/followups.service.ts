import { api } from './api';

export type FollowUpResult = 'answered' | 'promised' | 'no_answer' | 'busy' | 'ordered' | 'wrong_number';
export type DueReason = 'promise' | 'scheduled' | 'debt' | 'inactive';

export const RESULT_LABELS: Record<FollowUpResult, string> = {
  answered: 'صحبت شد',
  promised: 'قول پرداخت داد',
  ordered: 'سفارش داد',
  no_answer: 'جواب نداد',
  busy: 'بعداً تماس',
  wrong_number: 'شماره اشتباه',
};

export const REASON_LABELS: Record<DueReason, string> = {
  promise: 'موعد قول پرداخت',
  scheduled: 'پیگیری زمان‌بندی‌شده',
  debt: 'بدهی پیگیری‌نشده',
  inactive: 'مدتی خرید نکرده',
};

export interface DueItem {
  customer: { _id: string; name: string; phoneNumber?: string; balance: number; customerType?: string };
  reason: DueReason;
  dueSince: string | null;
  overdueDays: number;
  lastContactAt: string | null;
  lastContactResult: FollowUpResult | null;
  lastContactNote: string | null;
  lastPurchaseAt: string | null;
  daysSincePurchase: number | null;
}

export interface DueResponse {
  items: DueItem[];
  counts: Record<DueReason | 'total', number>;
  todayCalls: number;
}

export interface FollowUpLog {
  _id: string;
  customer: string | { _id: string; name: string; phoneNumber?: string; balance: number };
  result: FollowUpResult;
  reason?: string;
  note?: string;
  promisedAmount: number;
  nextFollowUpAt?: string;
  createdByName?: string;
  createdAt: string;
}

export interface LogFollowUpInput {
  result: FollowUpResult;
  reason?: string;
  note?: string;
  promisedAmount?: number;
  /** ISO date; undefined = automatic, '' = no further follow-up */
  nextFollowUpAt?: string;
}

export const followUpsService = {
  async getDue(): Promise<DueResponse> {
    return (await api.get('/follow-ups/due')).data;
  },
  async recent(limit = 50): Promise<FollowUpLog[]> {
    return (await api.get('/follow-ups/recent', { params: { limit } })).data;
  },
  async history(customerId: string): Promise<FollowUpLog[]> {
    return (await api.get(`/follow-ups/customer/${customerId}`)).data;
  },
  async log(customerId: string, data: LogFollowUpInput): Promise<FollowUpLog> {
    return (await api.post(`/follow-ups/customer/${customerId}`, data)).data;
  },
};

export const relativeDays = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'امروز';
  if (days === 1) return 'دیروز';
  return `${days.toLocaleString('fa-IR')} روز پیش`;
};
