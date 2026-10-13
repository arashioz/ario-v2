import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { SplashScreen } from './SplashScreen';
import { ORDERS_CHANGED, pendingOrders, syncOrders, type PendingOrder } from '../services/offlineOrders';
import { currentOwner } from '../services/offlineCache';
import { num } from '../lib/format';

export const OfflineOrderSync: React.FC = () => {
  const { isAuthenticated, user } = useAuth();
  const { showNotification } = useNotification();
  const [busy, setBusy] = useState(false);
  const [orders, setOrders] = useState<PendingOrder[]>([]);
  const [expanded, setExpanded] = useState(false);
  const inFlight = useRef(false);
  const refresh = useCallback(() => setOrders(pendingOrders(user?.id)), [user?.id]);
  const sync = useCallback(async () => {
    if (inFlight.current || !isAuthenticated || !navigator.onLine || !pendingOrders(user?.id).some((o) => !o.review)) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const result = await syncOrders();
      if (currentOwner() !== user?.id) return;
      if (result.count) showNotification({ title: 'سفارش‌های ذخیره‌شده ثبت شدند', message: `${num(result.count)} سفارش ثبت شد: ${result.labels.join('، ')}`, type: 'success', duration: 7000 });
      const failed = pendingOrders(user?.id).filter((o) => o.review);
      if (failed.length) showNotification({ title: 'بعضی سفارش‌ها نیاز به بررسی دارند', message: 'جزئیات را در صف سفارش‌ها ببینید؛ این سفارش‌ها از دستگاه پاک نشده‌اند.', type: 'warning' });
    } finally { inFlight.current = false; setBusy(false); refresh(); }
  }, [isAuthenticated, user?.id, showNotification, refresh]);
  useEffect(() => {
    refresh(); void sync();
    const wake = () => { if (document.visibilityState === 'visible') void sync(); };
    const reconnect = () => { void sync(); };
    window.addEventListener('online', reconnect);
    window.addEventListener('focus', reconnect);
    window.addEventListener(ORDERS_CHANGED, refresh);
    window.addEventListener('storage', refresh);
    document.addEventListener('visibilitychange', wake);
    const retry = window.setInterval(() => { if (document.visibilityState === 'visible') void sync(); }, 30000);
    return () => {
      clearInterval(retry);
      window.removeEventListener('online', reconnect); window.removeEventListener('focus', reconnect);
      window.removeEventListener(ORDERS_CHANGED, refresh); window.removeEventListener('storage', refresh);
      document.removeEventListener('visibilitychange', wake);
    };
  }, [refresh, sync]);
  if (!isAuthenticated) return null;
  return <>
    {busy && <SplashScreen message="در حال ثبت سفارش‌های ذخیره‌شده…" />}
    {!!orders.length && <div className="fixed top-[env(safe-area-inset-top,0px)] inset-x-3 z-[9999] mx-auto max-w-md rounded-xl border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900 shadow-lg" dir="rtl">
      <button onClick={() => setExpanded((v) => !v)} className="w-full flex justify-between gap-2 p-1"><strong>{num(orders.length)} سفارش در صف دستگاه</strong><span>{expanded ? 'بستن' : 'جزئیات'}</span></button>
      {expanded && <div className="max-h-64 overflow-auto space-y-3 p-2">
        {orders.map((order) => <div key={order.id} className="border-t border-amber-200 pt-2"><strong>{order.payload.customerName}</strong><p className="mt-1 leading-5">{order.error || 'منتظر اتصال برای ثبت خودکار'}</p>{order.review && <p className="text-[10px] leading-5">این سفارش خودکار دوباره ثبت نمی‌شود. وضعیت آن را در فاکتورها بررسی کنید.</p>}</div>)}
        <button onClick={() => void sync()} disabled={busy} className="rounded-lg bg-amber-700 px-3 py-2 text-white">ارسال سفارش‌های در انتظار</button>
      </div>}
    </div>}
  </>;
};
