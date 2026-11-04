import React, { useCallback, useMemo, useState } from 'react';
import { IonContent, IonPage, IonRefresher, IonRefresherContent } from '@ionic/react';
import { RefreshCw } from 'lucide-react';
import { accountingService } from '../services/accounting.service';
import type { PerformanceReport, PerformanceSnapshot } from '../services/accounting.service';
import { settingsService, useSettings } from '../services/settings.service';
import { ReportHeader, Segments } from '../components/reports/ReportUI';
import { PriceChart } from '../components/reports/PriceChart';
import type { ChartSeries } from '../components/reports/PriceChart';
import { useNotification } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';
import { HistoricalRebuildPanel } from '../components/reports/HistoricalRebuildPanel';
import { formatJalali, jalaliToYmd } from '../lib/jalali';
import { formatToman, percent, profitCaption, profitColor, weight } from '../lib/format';

type Grain = 'day' | 'month' | 'year';
type ChartKind = 'money' | 'pay' | 'price' | 'growth';

const grainLabel: Record<Grain, string> = { day: 'روزانه', month: 'ماهانه', year: 'سالانه' };

const pointTime = (row: PerformanceSnapshot) => {
  if (row.grain === 'year') return new Date(`${jalaliToYmd(Number(row.key), 6, 15)}T12:00:00+03:30`).getTime();
  if (row.grain === 'month') {
    const [jy, jm] = row.key.split('-').map(Number);
    return new Date(`${jalaliToYmd(jy, jm, 15)}T12:00:00+03:30`).getTime();
  }
  return new Date(`${row.key}T12:00:00+03:30`).getTime();
};

const labelOf = (row: PerformanceSnapshot) => {
  if (row.grain === 'day') return formatJalali(row.key);
  if (row.grain === 'month') {
    const [jy, jm] = row.key.split('-');
    return `${jy}/${jm}`;
  }
  return row.key;
};

const Mini: React.FC<{ label: string; value: string; tone?: string }> = ({ label, value, tone }) => (
  <div className="bg-white rounded-2xl border border-slate-100 px-3 py-2.5">
    <div className="text-[11px] text-slate-400">{label}</div>
    <div className={`text-[14px] font-bold font-mono mt-1 ${tone || 'text-slate-900'}`}>{value}</div>
  </div>
);

export const PerformancePage: React.FC = () => {
  const { showNotification } = useNotification();
  const { user } = useAuth();
  const settings = useSettings();
  const [data, setData] = useState<PerformanceReport | null>(null);
  const [error, setError] = useState('');
  const [grain, setGrain] = useState<Grain>('month');
  const [kind, setKind] = useState<ChartKind>('money');
  const [rebuilding, setRebuilding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError('');
      setData(await accountingService.performance());
    } catch {
      setError('گزارش عملکرد خوانده نشد.');
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  const rebuild = async () => {
    setRebuilding(true);
    try {
      setData(await accountingService.rebuildPerformance());
      showNotification({ title: 'عملکرد حساب شد', message: 'تاریخچه ذخیره شد. از این به بعد فقط همان روز، سر ساعت تنظیم‌شده به‌روز می‌شود.', type: 'success' });
    } catch {
      showNotification({ title: 'حساب نشد', message: 'محاسبه از روی فاکتورها انجام نشد.', type: 'error' });
    } finally {
      setRebuilding(false);
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      setData(await accountingService.refreshPerformance());
    } catch {
      showNotification({ title: 'به‌روز نشد', message: 'محاسبه امروز انجام نشد.', type: 'error' });
    } finally {
      setRefreshing(false);
    }
  };

  const saveHour = async (value: string) => {
    try {
      await settingsService.update({ performanceRunAt: value });
    } catch {
      showNotification({ title: 'ذخیره نشد', message: 'ساعت اجرای شبانه ذخیره نشد.', type: 'error' });
    }
  };

  const rows = data?.[grain === 'day' ? 'days' : grain === 'month' ? 'months' : 'years'] || [];
  const series: ChartSeries[] = useMemo(() => {
    const pts = (pick: (r: PerformanceSnapshot) => number, note: string) =>
      rows.filter((r) => pick(r) !== 0 || r.saleCount + r.purchaseCount > 0).map((r) => ({ t: pointTime(r), y: pick(r), note: `${labelOf(r)} · ${note}` }));
    if (kind === 'pay') {
      return [
        { key: 'in', label: 'دریافت از فروش', color: '#0284c7', mode: 'line' as const, points: pts((r) => r.paidIn, 'دریافت') },
        { key: 'out', label: 'پرداخت خرید', color: '#d97706', mode: 'line' as const, points: pts((r) => r.paidOut, 'پرداخت') },
      ];
    }
    if (kind === 'price') {
      return [
        { key: 'sale', label: 'میانگین فروش هر کیلو', color: '#0284c7', mode: 'line' as const, points: pts((r) => r.avgSellPerKg, 'فروش') },
        { key: 'buy', label: 'میانگین خرید هر کیلو', color: '#d97706', mode: 'line' as const, points: pts((r) => r.avgBuyPerKg, 'خرید') },
      ];
    }
    if (kind === 'growth') {
      return [
        { key: 'sale', label: 'رشد فروش ٪', color: '#059669', mode: 'line' as const, points: pts((r) => r.saleGrowth, 'رشد فروش') },
        { key: 'profit', label: 'رشد سود ٪', color: '#7c3aed', mode: 'line' as const, points: pts((r) => r.profitGrowth, 'رشد سود') },
        { key: 'buy', label: 'رشد خرید ٪', color: '#d97706', mode: 'line' as const, points: pts((r) => r.purchaseGrowth, 'رشد خرید') },
      ];
    }
    return [
      { key: 'sale', label: 'فروش', color: '#0284c7', mode: 'line' as const, points: pts((r) => r.saleAmount, 'فروش') },
      { key: 'buy', label: 'خرید', color: '#d97706', mode: 'line' as const, points: pts((r) => r.purchaseAmount, 'خرید') },
      { key: 'profit', label: 'سود', color: '#059669', mode: 'line' as const, points: pts((r) => r.profitAmount, 'سود') },
    ];
  }, [rows, kind]);

  const from = series.flatMap((s) => s.points.map((p) => p.t)).sort((a, b) => a - b)[0] || Date.now();
  const to = Date.now() + 12 * 3600000;
  const unitLabel = kind === 'price' ? 'هر کیلو' : kind === 'growth' ? 'درصد' : 'تومان';
  const now = data?.thisMonth;

  return (
    <IonPage>
      <ReportHeader
        title="عملکرد"
        subtitle="خرید، فروش، پرداخت، رشد و ضرر از روی فاکتورها"
        right={
          data?.rebuilt ? (
            <button type="button" onClick={() => void refresh()} disabled={refreshing || rebuilding} className="p-2 rounded-xl bg-sky-50 text-sky-700" title="محاسبه امروز">
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          ) : null
        }
      />
      <IonContent fullscreen className="bg-slate-50">
        <IonRefresher slot="fixed" onIonRefresh={(e) => load().finally(() => e.detail.complete())}>
          <IonRefresherContent />
        </IonRefresher>
        <div className="p-3 space-y-3 max-w-lg mx-auto pb-10">
          {user?.role === 'admin' && <HistoricalRebuildPanel />}
          {error && <div className="text-xs text-rose-700 bg-rose-50 rounded-2xl p-3">{error}</div>}

          {data && !data.rebuilt && (
            <section className="rounded-3xl bg-emerald-50 border border-emerald-200 p-4 space-y-3">
              <h2 className="text-sm font-bold text-emerald-950">راه‌اندازی اولیه</h2>
              <p className="text-[12px] text-emerald-900 leading-6">
                یک بار همه فاکتورها حساب و ذخیره می‌شود. بعد از آن هر روز فقط همان روز، سر ساعتی که پایین می‌گذارید (پیش‌فرض ۱۱ شب) به‌روز می‌شود.
              </p>
              <button type="button" disabled={rebuilding} onClick={() => void rebuild()} className="w-full rounded-2xl bg-emerald-600 py-3 text-sm font-bold text-white disabled:opacity-40">
                {rebuilding ? 'در حال محاسبه از اول…' : 'محاسبه عملکرد از اول'}
              </button>
            </section>
          )}

          {data?.rebuilt && (
            <>
              <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 bg-white rounded-2xl border border-slate-100 px-3 py-2">
                <span>آخرین ذخیره: {data.lastComputedDay ? formatJalali(data.lastComputedDay) : '—'}</span>
                <label className="flex items-center gap-1.5 font-bold text-slate-700">
                  اجرای شبانه
                  <input
                    type="time"
                    value={settings.performanceRunAt || data.runAt || '23:00'}
                    onChange={(e) => void saveHour(e.target.value)}
                    className="rounded-lg border border-slate-200 px-1.5 py-1 text-[11px]"
                  />
                </label>
              </div>

              {now && (
                <div className="grid grid-cols-2 gap-2">
                  <Mini label="فروش این ماه" value={formatToman(now.saleAmount)} tone="text-sky-800" />
                  <Mini label="خرید این ماه" value={formatToman(now.purchaseAmount)} tone="text-amber-800" />
                  <Mini label="سود این ماه" value={profitCaption(now.profitAmount, { sold: now.saleAmount })} tone={profitColor(now.profitAmount)} />
                  <Mini label="دریافت این ماه" value={formatToman(now.paidIn)} />
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <Mini label="میانگین فروش هر کیلو" value={now?.avgSellPerKg ? formatToman(now.avgSellPerKg) : '—'} tone="text-sky-800" />
                <Mini label="میانگین خرید هر کیلو" value={now?.avgBuyPerKg ? formatToman(now.avgBuyPerKg) : '—'} tone="text-amber-800" />
                <Mini label="میانگین دریافت هر فاکتور فروش" value={now && now.saleCount ? formatToman(Math.round(now.paidIn / now.saleCount)) : '—'} />
                <Mini label="میانگین پرداخت هر فاکتور خرید" value={now && now.purchaseCount ? formatToman(Math.round(now.paidOut / now.purchaseCount)) : '—'} />
              </div>

              <Segments<Grain> value={grain} onChange={setGrain} items={[['day', 'روزانه'], ['month', 'ماهانه'], ['year', 'سالانه']]} />
              <Segments<ChartKind>
                value={kind}
                onChange={setKind}
                items={[['money', 'خرید و فروش'], ['pay', 'پرداخت‌ها'], ['price', 'میانگین قیمت'], ['growth', 'رشد و ضرر']]}
              />

              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3">
                <PriceChart series={series} from={from} to={to} unitLabel={unitLabel} allowNegative={kind === 'growth'} />
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-500 mt-2">
                  {series.map((s) => (
                    <span key={s.key} className="flex items-center gap-1">
                      <span className="inline-block w-3 h-0.5" style={{ background: s.color }} />
                      {s.label}
                    </span>
                  ))}
                </div>
              </div>

              <section className="space-y-2">
                <h2 className="text-[13px] font-bold text-slate-800 px-1">عملکرد {grainLabel[grain]}</h2>
                {[...rows].reverse().filter((r) => r.saleCount + r.purchaseCount + r.paidIn + r.paidOut > 0).slice(0, grain === 'day' ? 45 : 36).map((r) => (
                  <article key={r.key} className="bg-white rounded-2xl border border-slate-100 px-3.5 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-[13px] font-bold text-slate-800">{labelOf(r)}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5 font-mono">
                          {r.purchaseCount.toLocaleString('fa-IR')} خرید · {r.saleCount.toLocaleString('fa-IR')} فروش
                        </div>
                      </div>
                      <div className={`text-[13px] font-bold font-mono ${profitColor(r.profitAmount)}`}>
                        {profitCaption(r.profitAmount, { sold: r.saleAmount })}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2 text-[11px] font-mono text-slate-600">
                      <span>خرید {formatToman(r.purchaseAmount)}</span>
                      <span>فروش {formatToman(r.saleAmount)}</span>
                      <span>تناژ خرید {weight(r.purchaseKg)}</span>
                      <span>تناژ فروش {weight(r.saleKg)}</span>
                      <span>پرداخت خرید {formatToman(r.paidOut)}</span>
                      <span>دریافت فروش {formatToman(r.paidIn)}</span>
                      {!!r.saleGrowth && <span className={r.saleGrowth >= 0 ? 'text-emerald-700' : 'text-rose-700'}>رشد فروش {percent(r.saleGrowth)}</span>}
                      {!!r.profitGrowth && <span className={r.profitGrowth >= 0 ? 'text-emerald-700' : 'text-rose-700'}>رشد سود {percent(r.profitGrowth)}</span>}
                    </div>
                  </article>
                ))}
              </section>
            </>
          )}
        </div>
      </IonContent>
    </IonPage>
  );
};
