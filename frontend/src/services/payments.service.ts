import { api } from './api';

/** Beh-Pardakht Mellat (درگاه اینترنتی بانک ملت) — shop-side client. */

export interface MellatCapabilities {
  enabled: boolean;
  configured: boolean;
  terminalId: string;
  payPageUrl: string;
  currency: string;
}

export interface MellatLaunch {
  paymentId: string;
  orderId: number;
  refId: string;
  amountToman: number;
  payPageUrl: string;
  mobileNo: string;
  merchantName: string;
}

export type MellatStatus = 'initiated' | 'failed' | 'verified' | 'settled' | 'reversed' | 'refunded';

export interface MellatTransaction {
  _id: string;
  orderId: number;
  refId: string;
  saleReferenceId: string;
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  amountToman: number;
  gatewayAmount: number;
  status: MellatStatus;
  resCode: string;
  resLabel: string;
  cardHolderPan: string;
  createdAt?: string;
  settledAt?: string | null;
  bookedAt?: string | null;
}

export const MELLAT_STATUS_LABELS: Record<MellatStatus, string> = {
  initiated: 'در انتظار پرداخت مشتری',
  failed: 'ناموفق',
  verified: 'تأیید شده (هنوز واریز نشده)',
  settled: 'واریز شد',
  reversed: 'برگشت داده شد',
  refunded: 'استرداد شد',
};

/** The bank call happens server side and can be slow; the shared 10s default is too tight. */
const GATEWAY_TIMEOUT = { timeout: 35000 };

let capabilitiesCache: Promise<MellatCapabilities> | null = null;

export const paymentsService = {
  /** Cached: the payment sheets ask for it on every open. */
  capabilities: async (refresh = false): Promise<MellatCapabilities> => {
    if (!capabilitiesCache || refresh) {
      capabilitiesCache = api
        .get<MellatCapabilities>('/payments/mellat/capabilities')
        .then((r) => r.data)
        .catch(() => ({ enabled: false, configured: false, terminalId: '', payPageUrl: '', currency: 'rials' }));
    }
    return capabilitiesCache;
  },

  /** Step 1 (bpPayRequest). Throws with the bank's Persian reason when the terminal refuses. */
  launch: async (
    invoiceId: string,
    body: { amount?: number; mobileNo?: string; description?: string },
  ): Promise<MellatLaunch> => {
    const response = await api.post<MellatLaunch>(`/payments/mellat/invoice/${invoiceId}`, body, GATEWAY_TIMEOUT);
    capabilitiesCache = null;
    return response.data;
  },

  list: async (params?: { invoiceId?: string; status?: string }): Promise<MellatTransaction[]> => {
    const response = await api.get<MellatTransaction[]>('/payments/mellat', { params });
    return response.data;
  },

  get: async (id: string): Promise<MellatTransaction> => {
    const response = await api.get<MellatTransaction>(`/payments/mellat/${id}`);
    return response.data;
  },

  /** bpInquiryRequest — use it when a customer closed the bank page and never came back. */
  refresh: async (id: string): Promise<MellatTransaction> => {
    const response = await api.post<MellatTransaction>(`/payments/mellat/${id}/refresh`, {}, GATEWAY_TIMEOUT);
    return response.data;
  },

  reverse: async (id: string): Promise<MellatTransaction> => {
    const response = await api.post<MellatTransaction>(`/payments/mellat/${id}/reverse`, {}, GATEWAY_TIMEOUT);
    return response.data;
  },

  refund: async (id: string, amount: number, note?: string): Promise<{ ok: boolean; message: string }> => {
    const response = await api.post(`/payments/mellat/${id}/refund`, { amount, note }, GATEWAY_TIMEOUT);
    return response.data;
  },
};

/**
 * Step 2 of the flow must be a real browser POST: the gateway matches the Referer against the
 * domain registered for this terminal and answers with code 62 when it does not line up. So the
 * app builds a one-shot form and submits it — the customer pays on the bank page and the bank
 * POSTs the browser back to /api/payments/mellat/callback.
 */
export function openMellatPage(launch: MellatLaunch): void {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = launch.payPageUrl;
  form.target = '_self';
  form.acceptCharset = 'UTF-8';

  const add = (name: string, value: string) => {
    if (!value) return;
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  };

  // RefId is case sensitive and must be sent exactly as the gateway issued it (document note).
  add('RefId', launch.refId);
  add('MobileNo', launch.mobileNo);
  add('merchantName', launch.merchantName);

  document.body.appendChild(form);
  form.submit();
  document.body.removeChild(form);
}

/** Reads the result the bank redirected back with, and cleans the URL. */
export function readMellatReturn(): { ok: boolean; message: string; orderId: string } | null {
  const params = new URLSearchParams(window.location.search);
  const outcome = params.get('mellat');
  if (!outcome) return null;
  const result = {
    ok: outcome === 'ok',
    message: params.get('mellatMsg') || (outcome === 'ok' ? 'پرداخت اینترنتی تأیید و واریز شد.' : 'پرداخت اینترنتی انجام نشد.'),
    orderId: params.get('mellatOrder') || '',
  };
  params.delete('mellat');
  params.delete('mellatMsg');
  params.delete('mellatOrder');
  const query = params.toString();
  window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  return result;
}
