import { api } from './api';
import { currentOwner, isConnectionError } from './offlineCache';
import type { CreateInvoiceInput, Invoice } from './invoices.service';
import type { Proforma } from './proformas.service';

export type OrderKind = 'invoice' | 'proforma';
export interface PendingOrder {
  id: string; owner: string; kind: OrderKind; payload: CreateInvoiceInput;
  createdAt: string; error?: string; review?: boolean;
}
const PREFIX = 'ario-order:';
export const ORDERS_CHANGED = 'ario:orders-changed';
export const ORDERS_SYNCED = 'ario:orders-synced';
const changed = () => window.dispatchEvent(new Event(ORDERS_CHANGED));
const keyOf = (o: PendingOrder) => `${PREFIX}${o.owner}:${o.id}`;
export const newOrderId = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = bytes[6] & 15 | 64; bytes[8] = bytes[8] & 63 | 128;
  const s = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
};
export function pendingOrders(owner = currentOwner()): PendingOrder[] {
  if (!owner) return [];
  const result: PendingOrder[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(`${PREFIX}${owner}:`)) continue;
    try {
      const order = JSON.parse(localStorage.getItem(key) || 'null') as PendingOrder;
      if (order?.owner === owner && order.id && order.payload && ['invoice', 'proforma'].includes(order.kind)) result.push(order);
    } catch { /* Never remove unreadable user data automatically. */ }
  }
  return result.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
export function enqueueOrder(kind: OrderKind, payload: CreateInvoiceInput): PendingOrder {
  const owner = currentOwner();
  if (!owner) throw new Error('برای ذخیره سفارش باید وارد حساب شوید.');
  const order: PendingOrder = { id: newOrderId(), owner, kind, payload, createdAt: new Date().toISOString() };
  try { localStorage.setItem(keyOf(order), JSON.stringify(order)); }
  catch { throw new Error('فضای ذخیره‌سازی دستگاه کافی نیست؛ سفارش ذخیره نشد و سبد حفظ شده است.'); }
  changed();
  return order;
}
export function reserveQueuedStock<T extends { _id: string; stock: number }>(products: T[]): T[] {
  const reserved = new Map<string, number>();
  for (const order of pendingOrders()) {
    if (order.kind !== 'invoice' || order.payload.fulfillment === 'factory') continue;
    for (const line of order.payload.items) reserved.set(line.productId, (reserved.get(line.productId) || 0) + line.quantity);
  }
  return products.map((p) => ({ ...p, stock: Math.max(0, p.stock - (reserved.get(p._id) || 0)) }));
}
const sending = new Map<string, Promise<Invoice | Proforma | null>>();
export async function sendOrder(order: PendingOrder): Promise<Invoice | Proforma | null> {
  if (!navigator.onLine || currentOwner() !== order.owner || order.review) return null;
  const key = keyOf(order);
  if (sending.has(key)) return sending.get(key)!;
  const job = (async () => {
    try {
      const response = await api.post<Invoice | Proforma>(order.kind === 'invoice' ? '/invoices' : '/proformas', order.payload, {
        headers: { 'Idempotency-Key': order.id, Authorization: `Bearer ${localStorage.getItem('ario_token') || ''}` },
      });
      // Confirmed success is the ONLY automatic removal path.
      localStorage.removeItem(key);
      changed();
      window.dispatchEvent(new Event(ORDERS_SYNCED));
      return response.data;
    } catch (error) {
      const e = error as { response?: { status: number; data?: { message?: string | string[]; code?: string } } };
      const raw = e.response?.data?.message;
      const message = Array.isArray(raw) ? raw.join('، ') : raw;
      const review = !!e.response && e.response.data?.code !== 'ORDER_PENDING' && !isConnectionError(error) && ![401, 403, 429].includes(e.response.status);
      // Re-read existence: another tab might already have confirmed and removed it.
      try {
        if (localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ ...order, review, error: message || 'در انتظار اتصال و تأیید سرور' }));
      } catch { /* The original payload is already durable; preserve it if metadata no longer fits. */ }
      changed();
      return null;
    } finally { sending.delete(key); }
  })();
  sending.set(key, job);
  return job;
}
let syncing: Promise<{ count: number; labels: string[] }> | null = null;
export function syncOrders() {
  if (syncing) return syncing;
  const owner = currentOwner();
  const work = async () => {
    const labels: string[] = [];
    for (const order of pendingOrders(owner)) {
      if (!navigator.onLine || currentOwner() !== owner) break;
      if (order.review) continue;
      const result = await sendOrder(order);
      if (result) labels.push(('invoiceNumber' in result ? result.invoiceNumber : (result as Proforma).number) || order.payload.customerName);
      else break; // Back off on connection/auth errors; do not hammer the server.
    }
    return { count: labels.length, labels };
  };
  syncing = (navigator.locks ? navigator.locks.request('ario-order-sync', work) : work()).finally(() => { syncing = null; });
  return syncing;
}
