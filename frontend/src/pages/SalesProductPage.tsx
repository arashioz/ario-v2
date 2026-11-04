import React, { useEffect, useMemo, useState } from 'react';
import { IonContent, IonPage, IonRefresher, IonRefresherContent } from '@ionic/react';
import { useParams } from 'react-router-dom';
import { accountingService } from '../services/accounting.service';
import type { LotRow, PriceSuggestion, SalesBoardProduct } from '../services/accounting.service';
import { pricingQuery, usePricingOptions } from '../components/pricing/PriceSuggestion';
import { usePriceApplier } from '../components/pricing/usePriceApplier';
import { watchService } from '../services/watch.service';
import type { PriceChartProduct } from '../services/watch.service';
import { PeriodPicker, periodPresets, periodQuery } from '../components/ui/PeriodPicker';
import type { Period } from '../components/ui/PeriodPicker';
import { Empty, ReportHeader, Segments } from '../components/reports/ReportUI';
import { PriceChart } from '../components/reports/PriceChart';
import { buildPriceSeries } from '../components/reports/priceSeries';
import type { ChartUnit, ChartView } from '../components/reports/priceSeries';
import { ListSkeleton } from '../components/ui/Skeleton';
import { formatJalaliIso, jalaliToYmd } from '../lib/jalali';
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
  const [range, setRange] = useState<Range>('all');
  const [unit, setUnit] = useState<ChartUnit>('kg');
  const [view, setView] = useState<ChartView>('months');
  const [pricing] = usePricingOptions();
  const [hint, setHint] = useState<PriceSuggestion | null>(null);
  const { apply, applying, applied } = usePriceApplier();

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

  useEffect(() => {
    accountingService
      .priceSuggestions(pricingQuery(pricing))
      .then((list) => setHint(list.find((item) => item.productId === productId) || null))
      .catch(() => setHint(null));
  }, [productId, pricing]);

  const stockLeft = useMemo(
    () =>
      lots.reduce(
        (sum, lot) => ({
          kg: sum.kg + lot.kgLeft,
          profit: sum.profit + (lot.stockProfit || 0),
          inflation: sum.inflation + (lot.stockInflation || 0),
          real: sum.real + (lot.stockReal || 0),
        }),
        { kg: 0, profit: 0, inflation: 0, real: 0 },
      ),
    [lots],
  );

  const to = useMemo(() => Date.now() + DAY / 2, [chart]);
  const from = useMemo(() => {
    if (view === 'months' && chart?.months?.length && range === 'all') {
      const [jy, jm] = chart.months[0].month.split('-').map(Number);
      return new Date(`${jalaliToYmd(jy, jm, 1)}T12:00:00+03:30`).getTime();
    }
    if (range !== 'all') return to - Number(range) * DAY;
    if (!chart) return to - 365 * DAY;
    const all = [...chart.purchases.map((b) => new Date(b.date).getTime()), ...chart.sales.map((s) => new Date(`${s.date}T12:00:00+03:30`).getTime())];
    return all.length ? Math.min(...all) - DAY : to - 365 * DAY;
  }, [range, chart, to, view]);

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
          {hint?.needsUpdate && (
            <div className="rounded-2xl bg-amber-50 border border-amber-100 p-3 space-y-2">
              <p className="text-[12px] text-amber-950 leading-6">
                از وقتی این قیمت را گذاشتید، خرید {percent(hint.costChangeSincePricePercent)} تغییر کرده.
                الان هر کیلو را {formatToman(hint.current.perKg)} می‌فروشید. نسبت به همین تورم، فروش هر کیلو بهتر است {formatToman(hint.suggested.perKg)} باشد.
              </p>
              <button
                type="button"
                onClick={() => apply([hint])}
                disabled={applying.has(hint.productId) || applied.has(hint.productId)}
                className="w-full rounded-xl bg-emerald-600 py-2 text-[12px] font-bold text-white disabled:opacity-60"
              >
                {applied.has(hint.productId) ? 'قیمت اعمال شد' : applying.has(hint.productId) ? 'در حال اعمال' : 'اگر لازم است این قیمت را بزن'}
              </button>
            </div>
          )}
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
              {stockLeft.kg > 0 && (
                <section className="bg-white rounded-2xl border border-emerald-100 p-3 text-[12px] text-slate-700 leading-6">
                  از این کالا {weight(stockLeft.kg)} هنوز در انبار است. اگر امروز بفروشید {formatToman(stockLeft.profit)} سود دارد:
                  {' '}{formatToman(stockLeft.inflation)} به‌خاطر بالا رفتن قیمت پایه از روزی که بار آمده، و {formatToman(stockLeft.real)} درصد روی قیمت پایهٔ الان.
                  جزئیات هر بار در تب «سود بارها» است.
                </section>
              )}
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
              {!!chart?.months?.length && (
                <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className="px-3.5 py-2.5 text-[12px] font-bold text-slate-700">میانگین هر ماه</div>
                  <div className="divide-y divide-slate-100">
                    {[...chart.months].reverse().slice(0, 12).map((m) => (
                      <div key={m.month} className="px-3.5 py-2 flex items-center justify-between gap-2 text-[11px] font-mono">
                        <span className="text-slate-500">{m.month}</span>
                        <span className="text-amber-800">خرید {m.buyPerKg ? formatToman(m.buyPerKg) : '—'}</span>
                        <span className="text-sky-800">فروش {m.sellPerKg ? formatToman(m.sellPerKg) : '—'}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
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
                      <span>مانده {weight(l.kgLeft)}</span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-5 mt-2">
                      این بار کیلویی {formatToman(l.costPerKg)} به انبار آمده.
                      {l.basePerKg ? ` قیمت پایهٔ الان ${formatToman(l.basePerKg)} است` : ''}
                      {l.sellPerKg ? ` و فروش هر کیلو ${formatToman(l.sellPerKg)}.` : '.'}
                      {l.kgSold > 0 && !l.unknownCost ? ` سودی که تا حالا از همین بار گرفته‌اید ${formatToman(l.profit)} است، یعنی هر کیلو ${formatToman(l.profitPerKg)} نسبت به قیمت همان روز.` : ''}
                    </p>
                    {l.kgLeft > 0 && typeof l.stockProfit === 'number' && (
                      <p className="text-[11px] text-slate-700 leading-5 mt-1">
                        اگر مانده را امروز بفروشید {formatToman(l.stockProfit)} سود دارد:
                        {' '}{formatToman(l.stockInflation || 0)} به‌خاطر گران شدن قیمت پایه از روز ورود این بار،
                        و {formatToman(l.stockReal || 0)} درصد و کارمزد روی قیمت پایهٔ الان.
                      </p>
                    )}
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
                      ['months', 'ماه به ماه'],
                      ['compare', 'روز به روز'],
                      ['purchase', 'فقط خرید'],
                      ['sale', 'فقط فروش'],
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
                  <p className="text-[11px] text-slate-400 leading-5 px-1">
                    {view === 'months'
                      ? 'هر نقطه میانگین همان ماه شمسی است. نارنجی بهای تمام‌شده خرید، آبی قیمت فروش.'
                      : 'این نمودار فقط همین کالا است. خط نارنجی خرید، خط آبی فروش.'}
                  </p>
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
