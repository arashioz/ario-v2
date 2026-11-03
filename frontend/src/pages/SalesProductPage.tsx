import React, { useEffect, useMemo, useState } from 'react';
import { IonContent, IonPage, IonRefresher, IonRefresherContent } from '@ionic/react';
import { useParams } from 'react-router-dom';
import { accountingService } from '../services/accounting.service';
import type { LotRow, SalesBoardProduct } from '../services/accounting.service';
import { watchService } from '../services/watch.service';
import type { PriceChartProduct } from '../services/watch.service';
import { PeriodPicker, periodPresets, periodQuery } from '../components/ui/PeriodPicker';
import type { Period } from '../components/ui/PeriodPicker';
import { Empty, ReportHeader, Segments } from '../components/reports/ReportUI';
import { PriceChart } from '../components/reports/PriceChart';
import { buildPriceSeries } from '../components/reports/priceSeries';
import type { ChartUnit, ChartView } from '../components/reports/priceSeries';
import { ListSkeleton } from '../components/ui/Skeleton';
import { formatJalaliIso } from '../lib/jalali';
import { formatToman, percent, profitCaption, profitColor, weight } from '../lib/format';

type Range = '30' | '90' | '180' | 'all';
type Block = 'numbers' | 'lots' | 'chart' | 'buys' | 'sells';

const DAY = 86400000;

const Stat: React.FC<{ label: string; value: string; sub?: string; tone?: string }> = ({ label, value, sub, tone }) => (
  <div className="bg-white rounded-2xl border border-slate-100 px-3 py-2.5">
    <div className="text-[11px] text-slate-400">{label}</div>
    <div className={`text-[15px] font-bold font-mono mt-1 ${tone || 'text-slate-900'}`}>{value}</div>
    {sub && <div className="text-[11px] text-slate-400 font-mono mt-0.5">{sub}</div>}
  </div>
);

export const SalesProductPage: React.FC = () => {
  const { productId = '' } = useParams<{ productId: string }>();
  const [period, setPeriod] = useState<Period>(() => periodPresets()[0]);
  const [row, setRow] = useState<SalesBoardProduct | null>(null);
  const [lots, setLots] = useState<LotRow[]>([]);
  const [chart, setChart] = useState<PriceChartProduct | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [block, setBlock] = useState<Block>('numbers');
  const [range, setRange] = useState<Range>('90');
  const [unit, setUnit] = useState<ChartUnit>('kg');
  const [view, setView] = useState<ChartView>('compare');

  const load = async () => {
    try {
      setError('');
      setLoading(true);
      const [board, charts] = await Promise.all([
        accountingService.salesBoard(periodQuery(period)),
        watchService.priceChart(),
      ]);
      setRow(board.products.find((item) => item.productId === productId) || null);
      setLots((board.lots || []).filter((lot) => lot.productId === productId));
      setChart(charts.find((item) => item.productId === productId) || null);
    } catch {
      setError('گزارش این کالا بارگذاری نشد.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, period]);

  const to = useMemo(() => Date.now() + DAY / 2, [chart]);
  const from = useMemo(() => {
    if (range !== 'all') return to - Number(range) * DAY;
    if (!chart) return to - 365 * DAY;
    const all = [...chart.purchases.map((b) => new Date(b.date).getTime()), ...chart.sales.map((s) => new Date(`${s.date}T12:00:00+03:30`).getTime())];
    return all.length ? Math.min(...all) - DAY : to - 365 * DAY;
  }, [range, chart, to]);

  const series = useMemo(() => (chart ? buildPriceSeries(chart, unit, view) : []), [chart, unit, view]);
  const unitLabel = unit === 'unit' && chart ? `هر ${chart.unit}` : 'هر کیلو';
  const buys = useMemo(
    () => [...(chart?.purchases || [])].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [chart],
  );
  const sells = useMemo(
    () => [...(chart?.sales || [])].sort((a, b) => (a.date < b.date ? 1 : -1)),
    [chart],
  );

  return (
    <IonPage>
      <ReportHeader
        title={row?.name || chart?.name || 'کالا'}
        subtitle={row?.company || chart?.category || 'گزارش یک کالا'}
        right={<PeriodPicker value={period} onChange={setPeriod} />}
      />
      <IonContent fullscreen className="bg-slate-50">
        <IonRefresher slot="fixed" onIonRefresh={(e) => load().finally(() => e.detail.complete())}>
          <IonRefresherContent />
        </IonRefresher>
        <div className="p-3 space-y-3 max-w-lg mx-auto pb-10">
          <Segments<Block>
            value={block}
            onChange={setBlock}
            items={[
              ['numbers', 'اعداد'],
              ['lots', 'سود بارها'],
              ['chart', 'نمودار'],
              ['buys', 'خریدها'],
              ['sells', 'فروش‌ها'],
            ]}
          />
          {error && <div className="text-xs text-rose-700 bg-rose-50 rounded-2xl p-3">{error}</div>}
          {loading && !row && !chart && <ListSkeleton />}
          {!loading && !row && !chart && !error && <Empty>این کالا پیدا نشد.</Empty>}

          {block === 'numbers' && row && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Stat label="خرید در بازه" value={formatToman(row.purchasedAmount)} sub={weight(row.purchasedKg)} />
                <Stat label="فروش در بازه" value={formatToman(row.soldAmount)} sub={weight(row.soldKg)} />
                <Stat label="موجودی الان" value={formatToman(row.stockValue)} sub={weight(row.stockKg)} />
                <Stat
                  label="سود فروش"
                  value={profitCaption(row.profit, { sold: row.soldAmount, unknown: row.unknownSold })}
                  sub={(row.unknownSold || 0) > 0 ? 'بهای بعضی فروش‌ها ثبت نشده' : percent(row.marginPercent)}
                  tone={profitColor(row.profit)}
                />
              </div>
              <section className="bg-white rounded-2xl border border-slate-100 shadow-sm divide-y divide-slate-100">
                <div className="px-3.5 py-3 flex items-center justify-between">
                  <span className="text-[13px] text-slate-500">میانگین خرید هر کیلو</span>
                  <span className="text-[14px] font-bold font-mono text-amber-800">{row.avgBuyPerKg ? formatToman(row.avgBuyPerKg) : '—'}</span>
                </div>
                <div className="px-3.5 py-3 flex items-center justify-between">
                  <span className="text-[13px] text-slate-500">میانگین فروش هر کیلو</span>
                  <span className="text-[14px] font-bold font-mono text-sky-800">{row.avgSellPerKg ? formatToman(row.avgSellPerKg) : '—'}</span>
                </div>
                <div className="px-3.5 py-3 flex items-center justify-between">
                  <span className="text-[13px] text-slate-500">آخرین بهای خرید</span>
                  <span className="text-[14px] font-bold font-mono text-slate-800">{row.lastCostPerKg ? formatToman(row.lastCostPerKg) : '—'}</span>
                </div>
                {row.avgSellPerKg > 0 && row.avgBuyPerKg > 0 && (
                  <div className="px-3.5 py-3 flex items-center justify-between">
                    <span className="text-[13px] text-slate-500">اختلاف هر کیلو</span>
                    <span className={`text-[14px] font-bold font-mono ${row.avgSellPerKg - row.avgBuyPerKg >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {formatToman(row.avgSellPerKg - row.avgBuyPerKg)}
                    </span>
                  </div>
                )}
              </section>
              <p className="text-[11px] text-slate-400 leading-5 px-1">
                موجودی، بارِ همین لحظه است. خرید، فروش و سود مال بازه‌ای است که بالا انتخاب کرده‌اید. سود هر بار خرید را در تب «سود بارها» ببینید.
              </p>
            </div>
          )}

          {block === 'lots' && (
            <div className="space-y-2">
              <p className="text-[11px] text-slate-500 leading-5 px-1">
                هر بار جدا: تاریخ خرید تا آخرین فروش از همان فاکتور، و سود واقعی همان بار.
              </p>
              {lots.length === 0 ? (
                <Empty>باری برای این کالا در این بازه نیست.</Empty>
              ) : (
                lots.map((l, i) => (
                  <div key={`${l.invoiceId}-${i}`} className="bg-white rounded-2xl border border-slate-100 px-3.5 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[13px] font-bold text-slate-800">
                          باری که {formatJalaliIso(l.date)} خریدی
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 leading-5">
                          {l.kgSold > 0
                            ? `تا ${formatJalaliIso(l.lastSoldAt || l.firstSoldAt || l.date)} فروختی`
                            : 'هنوز از این بار فروش نرفته'}
                          {l.fulfillment === 'factory' ? ' · ارسال از کارخانه' : ''}
                          {l.supplier ? ` · ${l.supplier}` : ''}
                        </div>
                      </div>
                      <div className={`text-[13px] font-bold font-mono shrink-0 ${l.unknownCost ? 'text-amber-700' : profitColor(l.profit)}`}>
                        {l.unknownCost ? 'سود نامشخص' : l.kgSold ? profitCaption(l.profit, { sold: l.revenue }) : '—'}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-2 text-[11px] text-slate-500 font-mono">
                      <span>خرید {weight(l.kgIn)}</span>
                      <span>فروش {weight(l.kgSold)}</span>
                      <span>{l.unknownCost ? 'بها ثبت نشده' : formatToman(l.profit)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {block === 'chart' && (
            <div className="space-y-3">
              {!chart ? (
                <Empty>نموداری برای این کالا نیست.</Empty>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <Segments<Range> value={range} onChange={setRange} items={[['30', '۱ ماه'], ['90', '۳ ماه'], ['180', '۶ ماه'], ['all', 'همه']]} />
                    <Segments<ChartUnit> value={unit} onChange={setUnit} items={[['kg', 'هر کیلو'], ['unit', 'هر واحد']]} />
                  </div>
                  <Segments<ChartView>
                    value={view}
                    onChange={setView}
                    items={[
                      ['compare', 'خرید و فروش'],
                      ['purchase', 'فقط خرید'],
                      ['sale', 'فقط فروش'],
                      ['all', 'همه'],
                      ['changes', 'تغییر قیمت'],
                    ]}
                  />
                  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3">
                    <PriceChart series={series} from={from} to={to} unitLabel={unitLabel} />
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-500 mt-2">
                      {series.map((s) => (
                        <span key={s.key} className="flex items-center gap-1">
                          <span className="inline-block w-3 h-0.5" style={{ background: s.color }} />
                          {s.label}
                        </span>
                      ))}
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-5 px-1">این نمودار فقط همین کالا است. خط نارنجی خرید، خط آبی فروش، بنفش قیمت لیست.</p>
                </>
              )}
            </div>
          )}

          {block === 'buys' && (
            <div className="space-y-2">
              {buys.length === 0 ? (
                <Empty>خریدی برای این کالا ثبت نشده.</Empty>
              ) : buys.map((b, i) => (
                <div key={`${b.invoiceId}-${i}`} className="bg-white rounded-2xl border border-slate-100 px-3.5 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-bold text-slate-800">{formatJalaliIso(b.date)}</span>
                    <span className="text-[13px] font-bold font-mono text-amber-800">{formatToman(b.costPerKg)} /کیلو</span>
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono mt-1">
                    {weight(b.kg)} · {b.supplier || '—'} · {b.invoiceNumber}
                  </div>
                </div>
              ))}
            </div>
          )}

          {block === 'sells' && (
            <div className="space-y-2">
              {sells.length === 0 ? (
                <Empty>فروشی برای این کالا ثبت نشده.</Empty>
              ) : sells.map((s) => (
                <div key={s.date} className="bg-white rounded-2xl border border-slate-100 px-3.5 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-bold text-slate-800">{formatJalaliIso(s.date)}</span>
                    <span className="text-[13px] font-bold font-mono text-sky-800">{formatToman(s.avgPerKg)} /کیلو</span>
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono mt-1">
                    {weight(s.kg)} · از {formatToman(s.minPerKg)} تا {formatToman(s.maxPerKg)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </IonContent>
    </IonPage>
  );
};
