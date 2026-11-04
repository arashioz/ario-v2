import React, { useEffect, useState } from 'react';
import { accountingService, type HistoryRebuildRun } from '../../services/accounting.service';
import { apiErrorMessage } from '../../services/invoices.service';
import { useNotification } from '../../context/NotificationContext';
import { num } from '../../lib/format';

export const HistoricalRebuildPanel: React.FC = () => {
  const { showNotification } = useNotification();
  const [run, setRun] = useState<HistoryRebuildRun | null>(null);
  const [busy, setBusy] = useState('');

  const load = async () => {
    try {
      setRun(await accountingService.historyRebuildStatus());
    } catch {
      setRun(null);
    }
  };

  useEffect(() => { void load(); }, []);

  const act = async (id: string, job: () => Promise<HistoryRebuildRun>, done: string) => {
    setBusy(id);
    try {
      const next = await job();
      setRun(next);
      if (next.error) showNotification({ title: 'اصلاح متوقف شد', message: next.error, type: 'error' });
      else if (done) showNotification({ title: 'انجام شد', message: done, type: 'success' });
      return next;
    } catch (error) {
      showNotification({ title: 'انجام نشد', message: apiErrorMessage(error, 'این مرحله اجرا نشد'), type: 'error' });
      return null;
    } finally {
      setBusy('');
    }
  };

  const profits = async () => {
    setBusy('profits');
    try {
      let next = await accountingService.historyProfits();
      setRun(next);
      while (next && !next.profitsDone && next.phase !== 'failed') {
        next = await accountingService.historyProfits();
        setRun(next);
      }
      if (next?.error) showNotification({ title: 'اصلاح متوقف شد', message: next.error, type: 'error' });
      else if (next?.profitsDone) showNotification({ title: 'سود فاکتورها ثبت شد', message: 'مرحله بعد، ساخت دوباره عملکرد است.', type: 'success' });
    } catch (error) {
      showNotification({ title: 'سود ثبت نشد', message: apiErrorMessage(error, 'دسته سود ثبت نشد. دوباره بزنید تا از همان‌جا ادامه دهد.'), type: 'error' });
      await load();
    } finally {
      setBusy('');
    }
  };

  const reports = async () => {
    const ok = window.confirm(
      'گزارش‌ها با سود جدید به‌روز شوند؟\n\n' +
      'عملکرد، فروش، سود، انبار، گرانی بار، نسیه، نمودار قیمت و پایش سود از نو خوانده می‌شوند.\n' +
      'قیمت، تعداد، تاریخ و مبلغ فاکتورها عوض نمی‌شود.\n' +
      'تارگت فروش، بازاریابی، صندوق و هزینه‌ها از این سود ساخته نمی‌شوند و دست نمی‌خورند.',
    );
    if (!ok) return;
    await act('performance', () => accountingService.historyPerformance(), 'گزارش‌ها به‌روز شد');
  };

  const rollback = async () => {
    if (!window.confirm('سود، بازه قیمت و نمودار عملکرد به قبل از این اصلاح برمی‌گردد. قیمت و مبلغ خود فاکتورها عوض نمی‌شود.')) return;
    await act('rollback', () => accountingService.historyRollback(), 'به وضعیت قبلی برگشت');
  };

  const seen = run?.salesSeen || 0;
  const total = run?.salesTotal || 0;
  const width = total > 0 ? Math.min(100, Math.round((seen / total) * 100)) : 0;

  return (
    <section className="rounded-3xl bg-white border border-amber-200 p-4 space-y-3">
      <h2 className="text-sm font-bold text-slate-900">اصلاح فاکتورهای قدیمی</h2>
      <p className="text-[12px] text-slate-600 leading-6">
        چهار مرحله، به ترتیب. قیمت، تعداد، تاریخ و مبلغ فاکتور خرید و فروش دست نمی‌خورد. فقط سود ذخیره‌شده با بهای خرید همان تاریخ عوض می‌شود و بعد نمودار عملکرد از نو ساخته می‌شود.
      </p>
      <ol className="text-[11px] text-slate-500 leading-6 list-decimal pr-4">
        <li className={run && run.phase !== 'idle' ? 'text-emerald-700' : ''}>پیش‌بررسی، بدون هیچ تغییری</li>
        <li className={run?.pricesDone ? 'text-emerald-700' : ''}>بازه قیمت خرید از فاکتورهای خرید</li>
        <li className={run?.profitsDone ? 'text-emerald-700' : ''}>سود فروش‌ها، دسته‌دسته</li>
        <li className={run?.performanceDone ? 'text-emerald-700' : ''}>با تأیید شما: به‌روزرسانی همه گزارش‌ها</li>
      </ol>
      {total > 0 && (
        <div>
          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full bg-amber-500" style={{ width: `${width}%` }} />
          </div>
          <p className="text-[10px] text-slate-400 mt-1">
            {num(seen)} از {num(total)} فاکتور فروش · {num(run?.profitsUpdated || 0)} سود عوض شد
            {(run?.unresolved || 0) > 0 ? ` · ${num(run?.unresolved || 0)} ردیف بدون قیمت خرید در آن تاریخ` : ''}
          </p>
        </div>
      )}
      {run?.reportNote && <p className="text-[11px] text-emerald-800 leading-5">به‌روز شد: {run.reportNote}</p>}
      {run?.error && <p className="text-[11px] text-rose-700 leading-5">{run.error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={!!busy} onClick={() => void act('preflight', () => accountingService.historyPreflight(), 'پیش‌بررسی تمام شد')} className="rounded-xl bg-slate-800 py-2.5 text-[11px] font-bold text-white disabled:opacity-40">
          {busy === 'preflight' ? 'در حال بررسی…' : '۱. پیش‌بررسی'}
        </button>
        <button type="button" disabled={!!busy || !run?.purchases && !run?.salesTotal} onClick={() => void act('prices', () => accountingService.historyPrices(), 'بازه قیمت ساخته شد')} className="rounded-xl bg-amber-600 py-2.5 text-[11px] font-bold text-white disabled:opacity-40">
          {busy === 'prices' ? 'در حال ساخت…' : '۲. بازه قیمت'}
        </button>
        <button type="button" disabled={!!busy || !run?.pricesDone || !!run?.profitsDone} onClick={() => void profits()} className="rounded-xl bg-sky-600 py-2.5 text-[11px] font-bold text-white disabled:opacity-40">
          {busy === 'profits' ? 'در حال ثبت سود…' : '۳. سود فاکتورها'}
        </button>
        <button type="button" disabled={!!busy || !run?.profitsDone} onClick={() => void reports()} className="col-span-2 rounded-xl bg-emerald-600 py-2.5 text-[11px] font-bold text-white disabled:opacity-40">
          {busy === 'performance' ? 'در حال به‌روزرسانی گزارش‌ها…' : run?.performanceDone ? 'گزارش‌ها به‌روز شد' : '۴. تأیید و به‌روزرسانی گزارش‌ها'}
        </button>
      </div>
      {(run?.pricesDone || run?.profitsUpdated) ? (
        <button type="button" disabled={!!busy} onClick={() => void rollback()} className="w-full rounded-xl border border-slate-200 py-2 text-[11px] font-bold text-slate-500 disabled:opacity-40">
          {busy === 'rollback' ? 'در حال برگشت…' : 'برگشت به سود و نمودار قبلی'}
        </button>
      ) : null}
    </section>
  );
};
