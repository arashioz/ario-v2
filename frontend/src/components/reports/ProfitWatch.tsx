import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertOctagon, AlertTriangle, CheckCircle2, ChevronDown, Eye, Info, RefreshCw, RotateCcw, ShieldCheck, XCircle } from 'lucide-react';
import { watchService } from '../../services/watch.service';
import type { Severity, WatchFinding, WatchReport } from '../../services/watch.service';
import { apiErrorMessage } from '../../services/invoices.service';
import { useNotification } from '../../context/NotificationContext';
import { formatJalaliIso } from '../../lib/jalali';
import { formatToman, formatTomanSigned, num } from '../../lib/format';
import { Empty, Segments } from './ReportUI';

const POLL_MS = 20_000;

/** Keeps the latest watcher report fresh while the page is open. */
export function useProfitWatch() {
  const [report, setReport] = useState<WatchReport | null>(null);
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);

  const reload = useCallback(async () => {
    try {
      setReport(await watchService.report());
      setError('');
    } catch (err) {
      setError(apiErrorMessage(err, 'نگهبان سود در دسترس نیست'));
    }
  }, []);

  const rescan = useCallback(async () => {
    try {
      setScanning(true);
      setReport(await watchService.rescan());
    } catch (err) {
      setError(apiErrorMessage(err, 'بررسی دوباره ناموفق بود'));
    } finally {
      setScanning(false);
    }
  }, []);

  useEffect(() => {
    reload();
    const t = setInterval(() => document.visibilityState === 'visible' && reload(), POLL_MS);
    return () => clearInterval(t);
  }, [reload]);

  return { report, error, scanning, reload, rescan };
}

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

const ago = (iso: string, now: number) => {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${num(s)} ثانیه پیش`;
  if (s < 3600) return `${num(Math.floor(s / 60))} دقیقه پیش`;
  return `${num(Math.floor(s / 3600))} ساعت پیش`;
};

const SEVERITY: Record<Severity, { label: string; chip: string; card: string; icon: React.ElementType }> = {
  error: { label: 'خطا', chip: 'bg-rose-100 text-rose-700', card: 'bg-rose-50/60 border-rose-200', icon: AlertOctagon },
  warning: { label: 'هشدار', chip: 'bg-amber-100 text-amber-700', card: 'bg-amber-50/50 border-amber-200', icon: AlertTriangle },
  info: { label: 'نکته', chip: 'bg-sky-100 text-sky-700', card: 'bg-sky-50/50 border-sky-100', icon: Info },
};

export const ProfitWatchCard: React.FC<{
  report: WatchReport | null;
  error: string;
  scanning: boolean;
  onRescan: () => void;
  onOpen: () => void;
}> = ({ report, error, scanning, onRescan, onOpen }) => {
  const now = useNow();
  const [showHealth, setShowHealth] = useState(false);
  const healthy = report?.health.every((h) => h.ok);
  const open = report ? report.counts.error + report.counts.warning : 0;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-slate-900 text-emerald-400 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-[13px] font-extrabold text-slate-800">نگهبان سود</h3>
              <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mt-0.5">
                <span className="relative flex w-2 h-2">
                  <span className={`absolute inline-flex w-full h-full rounded-full opacity-60 ${error ? 'bg-rose-400' : 'bg-emerald-400 animate-ping'}`} />
                  <span className={`relative inline-flex w-2 h-2 rounded-full ${error ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                </span>
                {error ? error : report ? `فعال · آخرین بررسی ${ago(report.status.scannedAt, now)}` : 'در حال بررسی…'}
              </div>
            </div>
          </div>
          <button
            onClick={onRescan}
            disabled={scanning}
            className="p-2 rounded-xl bg-slate-50 text-slate-600 active:scale-95 disabled:opacity-50"
            title="بررسی دوباره همین حالا"
          >
            <RefreshCw className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {report && (
          <>
            <p className="text-[11px] text-slate-500 leading-5 mt-3">
              همه <b className="font-mono">{num(report.status.invoices)}</b> فاکتور، <b className="font-mono">{num(report.status.saleLines)}</b> ردیف فروش و{' '}
              <b className="font-mono">{num(report.status.lots)}</b> بار خرید با قاعده‌های ثابت حسابداری (بدون هوش مصنوعی) بررسی شد. با هر تغییر فاکتور یا کالا دوباره
              بررسی می‌شود.
            </p>
            <button onClick={onOpen} className="w-full grid grid-cols-3 gap-2 mt-3 text-center">
              {(['error', 'warning', 'info'] as Severity[]).map((s) => (
                <div key={s} className={`rounded-2xl py-2 ${report.counts[s] ? SEVERITY[s].chip : 'bg-slate-50 text-slate-400'}`}>
                  <div className="text-base font-bold font-mono">{num(report.counts[s])}</div>
                  <div className="text-[10px]">{SEVERITY[s].label}</div>
                </div>
              ))}
            </button>
            {report.counts.error > 0 && report.impact > 0 && (
              <div className="text-[11px] text-rose-700 mt-2 text-center">
                مبلغ درگیر در خطاها: <b className="font-mono">{formatToman(report.impact)}</b>
              </div>
            )}
            {open > 0 && (
              <button onClick={onOpen} className="w-full mt-3 py-2.5 rounded-2xl bg-slate-900 text-white text-xs font-bold active:scale-[0.98]">
                دیدن و رسیدگی به {num(open)} مورد
              </button>
            )}
          </>
        )}
      </div>

      {report && (
        <div className="border-t border-slate-100">
          <button onClick={() => setShowHealth((v) => !v)} className="w-full flex items-center justify-between px-4 py-2.5 text-[11px]">
            <span className={`flex items-center gap-1.5 font-bold ${healthy ? 'text-emerald-700' : 'text-amber-700'}`}>
              {healthy ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
              سلامت موتور محاسبه سود: {num(report.health.filter((h) => h.ok).length)} از {num(report.health.length)}
            </span>
            <ChevronDown className={`w-4 h-4 text-slate-400 transition ${showHealth ? 'rotate-180' : ''}`} />
          </button>
          {showHealth && (
            <div className="px-4 pb-3 space-y-1.5">
              {report.health.map((h) => (
                <div key={h.id} className="flex items-start gap-2 text-[11px]">
                  {h.ok ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" /> : <XCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />}
                  <div>
                    <div className="font-bold text-slate-700">{h.label}</div>
                    <div className="text-slate-400">{h.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

type Filter = Severity | 'dismissed';
const PAGE = 30;

export const ProfitWatchList: React.FC<{
  report: WatchReport | null;
  onChanged: () => void;
  onOpenInvoice: (id: string) => void;
}> = ({ report, onChanged, onOpenInvoice }) => {
  const { showNotification } = useNotification();
  const [filter, setFilter] = useState<Filter>('error');
  const [rule, setRule] = useState<string>('');
  const [limit, setLimit] = useState(PAGE);
  const [dismissed, setDismissed] = useState<WatchFinding[] | null>(null);
  const [busy, setBusy] = useState('');

  useEffect(() => {
    if (filter !== 'dismissed') return;
    watchService.report('dismissed').then((r) => setDismissed(r.findings)).catch(() => setDismissed([]));
  }, [filter, report]);

  useEffect(() => {
    setLimit(PAGE);
    setRule('');
  }, [filter]);

  const pool = useMemo(() => {
    if (!report) return [];
    return filter === 'dismissed' ? dismissed ?? [] : report.findings.filter((f) => f.severity === filter);
  }, [report, filter, dismissed]);

  const rules = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of pool) m.set(f.rule, (m.get(f.rule) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [pool]);

  const list = rule ? pool.filter((f) => f.rule === rule) : pool;

  const act = async (f: WatchFinding, restore: boolean) => {
    try {
      setBusy(f.id);
      if (restore) await watchService.restore(f.id);
      else await watchService.dismiss(f.id);
      showNotification({ title: restore ? 'برگشت داده شد' : 'بررسی شد', message: restore ? 'این مورد دوباره در فهرست است.' : 'این مورد دیگر هشدار داده نمی‌شود.', type: 'success' });
      onChanged();
    } catch (err) {
      showNotification({ title: 'خطا', message: apiErrorMessage(err, 'انجام نشد'), type: 'error' });
    } finally {
      setBusy('');
    }
  };

  if (!report) return <Empty>در حال بررسی فاکتورها…</Empty>;

  return (
    <div className="space-y-2.5">
      <Segments<Filter>
        value={filter}
        onChange={setFilter}
        items={[
          ['error', `خطا (${num(report.counts.error)})`],
          ['warning', `هشدار (${num(report.counts.warning)})`],
          ['info', `نکته (${num(report.counts.info)})`],
          ['dismissed', `بررسی‌شده (${num(report.counts.dismissed)})`],
        ]}
      />

      {rules.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          <button onClick={() => setRule('')} className={`shrink-0 px-3 py-1.5 rounded-xl text-[11px] font-bold ${!rule ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
            همه
          </button>
          {rules.map(([r, n]) => (
            <button
              key={r}
              onClick={() => setRule(r)}
              className={`shrink-0 px-3 py-1.5 rounded-xl text-[11px] font-bold ${rule === r ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}
            >
              {report.rules[r]?.label ?? r} ({num(n)})
            </button>
          ))}
        </div>
      )}

      {rule && report.rules[rule] && <p className="text-[11px] text-slate-500 px-1 leading-5">{report.rules[rule].help}</p>}

      {list.length === 0 ? (
        <Empty>{filter === 'dismissed' ? 'موردی بررسی‌شده علامت نخورده.' : 'موردی نیست؛ همه‌چیز درست است.'}</Empty>
      ) : (
        list.slice(0, limit).map((f) => {
          const sev = SEVERITY[f.severity];
          const Icon = sev.icon;
          return (
            <div key={f.id} className={`rounded-2xl border p-3 ${sev.card}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0">
                  <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${f.severity === 'error' ? 'text-rose-600' : f.severity === 'warning' ? 'text-amber-600' : 'text-sky-600'}`} />
                  <div className="min-w-0">
                    <h3 className="text-xs font-bold text-slate-800">{f.title}</h3>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      {[f.invoiceNumber, f.date ? formatJalaliIso(f.date) : '', f.customerName, f.productName].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                </div>
                {f.impact !== undefined && Math.abs(f.impact) >= 1 && (
                  <span className="text-[10px] font-bold font-mono text-slate-600 shrink-0">{formatTomanSigned(f.impact)}</span>
                )}
              </div>
              <p className="text-[11px] text-slate-700 leading-5 mt-2">{f.detail}</p>
              {f.dismissed && (
                <p className="text-[10px] text-slate-400 mt-1.5">
                  بررسی‌شده توسط {f.dismissed.by || '—'}
                  {f.dismissed.at ? ` · ${formatJalaliIso(f.dismissed.at)}` : ''}
                </p>
              )}
              <div className="flex gap-2 mt-2.5">
                {f.invoiceId && (
                  <button onClick={() => onOpenInvoice(f.invoiceId!)} className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl bg-white border border-slate-200 text-[11px] font-bold text-slate-700">
                    <Eye className="w-3.5 h-3.5" />
                    باز کردن فاکتور
                  </button>
                )}
                <button
                  onClick={() => act(f, !!f.dismissed)}
                  disabled={busy === f.id}
                  className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl bg-white border border-slate-200 text-[11px] font-bold text-slate-700 disabled:opacity-50"
                >
                  {f.dismissed ? <RotateCcw className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                  {f.dismissed ? 'برگرداندن' : 'درست است، بررسی شد'}
                </button>
              </div>
            </div>
          );
        })
      )}

      {list.length > limit && (
        <button onClick={() => setLimit((l) => l + PAGE)} className="w-full py-3 rounded-2xl bg-white border border-slate-200 text-xs font-bold text-slate-600">
          نمایش {num(Math.min(PAGE, list.length - limit))} مورد دیگر از {num(list.length - limit)}
        </button>
      )}
    </div>
  );
};
