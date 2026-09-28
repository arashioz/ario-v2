import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IonPage, IonContent, IonRefresher, IonRefresherContent } from '@ionic/react';
import type { RefresherEventDetail } from '@ionic/react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Copy,
  FileText,
  Package,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';
import { watchService } from '../services/watch.service';
import type { PriceChartProduct } from '../services/watch.service';
import { apiErrorMessage } from '../services/invoices.service';
import { Empty, Mini, ReportHeader, Segments } from '../components/reports/ReportUI';
import { PriceChart } from '../components/reports/PriceChart';
import type { ChartSeries } from '../components/reports/PriceChart';
import { useInvoiceOpener } from '../components/reports/useInvoiceOpener';
import { formatJalaliIso } from '../lib/jalali';
import { num, percent, weight } from '../lib/format';

type Range = '30' | '90' | '180' | 'all';
type Unit = 'kg' | 'unit';
type ViewSeries = 'all' | 'compare' | 'purchase' | 'sale';

const COLORS = { purchase: '#d97706', sale: '#0284c7', list: '#7c3aed' };
const DAY = 86400000;
const tehranDay = (ymd: string) => new Date(`${ymd}T12:00:00+03:30`).getTime();
const ts = (iso: string) => new Date(iso).getTime();

function buildSeries(p: PriceChartProduct, unit: Unit, view: ViewSeries): ChartSeries[] {
  const k = unit === 'unit' ? p.weightPerUnitKg || 1 : 1;

  // 1. Purchase series (continuous line with purchase nodes & carry-forward)
  const sortedPurchases = [...p.purchases].sort((a, b) => ts(a.date) - ts(b.date));
  const buyPoints = sortedPurchases.map((b) => ({
    t: ts(b.date),
    y: b.costPerKg * k,
    note: `${b.invoiceNumber} · ${b.supplier ? b.supplier + ' · ' : ''}${weight(b.kg)}`,
  }));

  // Carry forward last purchase price to current time so the purchase line extends across the window
  if (buyPoints.length > 0) {
    const last = buyPoints[buyPoints.length - 1];
    if (Date.now() - last.t > 3600000) {
      buyPoints.push({
        t: Date.now(),
        y: last.y,
        note: `امتداد آخرین نرخ خرید (${num(last.y)})`,
      });
    }
  }

  const purchaseSeries: ChartSeries = {
    key: 'purchase',
    label: 'خرید (بهای تمام‌شده)',
    color: COLORS.purchase,
    mode: 'line',
    points: buyPoints,
  };

  // 2. Sale series
  const saleSeries: ChartSeries = {
    key: 'sale',
    label: 'فروش (میانگین روز)',
    color: COLORS.sale,
    mode: 'line',
    points: p.sales.map((s) => ({ t: tehranDay(s.date), y: s.avgPerKg * k, note: `${weight(s.kg)} در ${num(s.count)} ردیف` })),
    band: p.sales.map((s) => ({ t: tehranDay(s.date), lo: s.minPerKg * k, hi: s.maxPerKg * k })),
  };

  // 3. List price series
  const listSeries: ChartSeries = {
    key: 'list',
    label: 'قیمت لیست (تکی)',
    color: COLORS.list,
    mode: 'step',
    points: [
      ...p.list.filter((l) => l.perKg).map((l) => ({ t: ts(l.date), y: (l.perKg as number) * k, note: l.by ? `تغییر توسط ${l.by}` : undefined })),
      ...(p.current.retailPerKg ? [{ t: Date.now(), y: p.current.retailPerKg * k }] : []),
    ],
  };

  if (view === 'purchase') return [purchaseSeries];
  if (view === 'sale') return [saleSeries, listSeries];
  if (view === 'compare') return [saleSeries, purchaseSeries];
  return [saleSeries, purchaseSeries, listSeries];
}

const Spark: React.FC<{ p: PriceChartProduct; from: number }> = ({ p, from }) => {
  const sales = p.sales.map((s) => ({ t: tehranDay(s.date), y: s.avgPerKg })).filter((s) => s.t >= from);
  const buys = p.purchases.map((b) => ({ t: ts(b.date), y: b.costPerKg })).filter((b) => b.t >= from);
  const all = [...sales, ...buys];
  if (all.length < 2) return <div className="h-10 flex items-center justify-center text-[10px] text-slate-300">داده کم</div>;
  const W = 140;
  const H = 40;
  const t0 = Math.min(...all.map((a) => a.t));
  const t1 = Math.max(...all.map((a) => a.t));
  const y0 = Math.min(...all.map((a) => a.y));
  const y1 = Math.max(...all.map((a) => a.y));
  const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * (W - 4) + 2;
  const y = (v: number) => H - 3 - ((v - y0) / Math.max(1, y1 - y0)) * (H - 6);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-10" preserveAspectRatio="none">
      <path d={sales.map((s, i) => `${i ? 'L' : 'M'}${x(s.t)},${y(s.y)}`).join('')} fill="none" stroke={COLORS.sale} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      {buys.map((b) => (
        <circle key={`${b.t}-${b.y}`} cx={x(b.t)} cy={y(b.y)} r={2} fill={COLORS.purchase} />
      ))}
    </svg>
  );
};

export const PriceChartPage: React.FC = () => {
  const [items, setItems] = useState<PriceChartProduct[] | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string>('');
  const [range, setRange] = useState<Range>('90');
  const [unit, setUnit] = useState<Unit>('kg');
  const contentRef = useRef<HTMLIonContentElement>(null);

  const load = useCallback(async () => {
    try {
      setError('');
      const data = await watchService.priceChart();
      setItems(data);
      setSelected((cur) => cur || data[0]?.productId || '');
    } catch (err) {
      setError(apiErrorMessage(err, 'دریافت چارت قیمت ناموفق بود'));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const { open: openInvoice, modal } = useInvoiceOpener(load);

  const handleRefresh = async (e: CustomEvent<RefresherEventDetail>) => {
    await load();
    e.detail.complete();
  };

  // Fixed per data load so the chart window doesn't shift on every render.
  const to = useMemo(() => Date.now() + DAY / 2, [items]);
  const from = useMemo(() => {
    if (range !== 'all') return to - Number(range) * DAY;
    const all = (items ?? []).flatMap((p) => [...p.purchases.map((b) => ts(b.date)), ...p.sales.map((s) => tehranDay(s.date))]);
    return all.length ? Math.min(...all) - DAY : to - 365 * DAY;
  }, [range, items, to]);

  const product = items?.find((p) => p.productId === selected) ?? null;
  const [viewSeries, setViewSeries] = useState<ViewSeries>('all');
  const [copied, setCopied] = useState(false);
  const series = useMemo(() => (product ? buildSeries(product, unit, viewSeries) : []), [product, unit, viewSeries]);
  const k = unit === 'unit' && product?.weightPerUnitKg ? product.weightPerUnitKg : 1;
  const unitLabel = unit === 'unit' && product ? `هر ${product.unit}` : 'هر کیلو';

  const report = useMemo(() => {
    if (!product) return null;
    const sortedBuys = [...product.purchases].sort((a, b) => ts(a.date) - ts(b.date));
    const lastBuy = sortedBuys[sortedBuys.length - 1];
    const firstBuy = sortedBuys[0];
    const allBuyCosts = sortedBuys.map((b) => b.costPerKg * k);
    const minBuy = allBuyCosts.length ? Math.min(...allBuyCosts) : null;
    const maxBuy = allBuyCosts.length ? Math.max(...allBuyCosts) : null;
    const lastCost = product.lastCostPerKg ? product.lastCostPerKg * k : (lastBuy ? lastBuy.costPerKg * k : null);
    const avgSell = product.avgSell30PerKg ? product.avgSell30PerKg * k : null;
    const listPrice = product.current.retailPerKg ? product.current.retailPerKg * k : null;
    const profitPerUnit = avgSell !== null && lastCost !== null ? avgSell - lastCost : null;
    const marginPct = avgSell && lastCost ? Math.round(((avgSell - lastCost) / avgSell) * 1000) / 10 : null;

    let verdictType: 'danger' | 'warning' | 'good' | 'neutral' = 'neutral';
    let verdictTitle = 'اطلاعات در حال تکمیل';
    let verdictDesc = 'داده‌های کافی از خرید و فروش برای ارزیابی قطعی ثبت نشده است.';

    if (marginPct !== null) {
      if (marginPct < 0) {
        verdictType = 'danger';
        verdictTitle = 'هشدار جدی زیان‌دهی (فروش زیر بهای خرید)';
        verdictDesc = `میانگین نرخ فروش واقعی (${num(avgSell)} تومان) کمتر از آخرین بهای تمام‌شده خرید (${num(lastCost)} تومان) است. هر ${unitLabel} با ${num(Math.abs(profitPerUnit!))} تومان زیان به فروش می‌رسد! پیشنهاد می‌شود قیمت فروش سریعاً بازنگری و افزایش یابد.`;
      } else if (marginPct < 8) {
        verdictType = 'warning';
        verdictTitle = 'حاشیه سود ضعیف و آسیب‌پذیر';
        verdictDesc = `حاشیه سود ناخالص فعلی ${percent(marginPct)} (${num(profitPerUnit)} تومان سود به ازای ${unitLabel}) است. با در نظر گرفتن هزینه‌های انبار، کارگری و افت بار، کالا در آستانه سر‌به‌سر قرار دارد.`;
      } else {
        verdictType = 'good';
        verdictTitle = 'حاشیه سود مطلوب و سودآوری پایدار';
        verdictDesc = `حاشیه سود ناخالص ${percent(marginPct)} (${num(profitPerUnit)} تومان سود در ${unitLabel}) نشان‌دهنده تعادل خوب قیمت خرید و کشش بازار برای این کالاست.`;
      }
    }

    const copyLines: string[] = [
      `📊 گزارش تحلیلی چارت قیمت: ${product.name}`,
      `دسته‌بندی: ${product.category} | مبنا: ${unitLabel}`,
      `---------------------------------`,
    ];
    if (lastCost) {
      copyLines.push(`🔹 آخرین بهای خرید: ${num(lastCost)} تومان` + (lastBuy ? ` (فاکتور ${lastBuy.invoiceNumber} مورخ ${formatJalaliIso(lastBuy.date)})` : ''));
    }
    if (minBuy !== null && maxBuy !== null && minBuy !== maxBuy) {
      copyLines.push(`🔹 نوسان بهای خرید: از ${num(minBuy)} تا ${num(maxBuy)} تومان`);
    }
    if (avgSell) {
      copyLines.push(`🔹 میانگین فروش ۳۰ روزه: ${num(avgSell)} تومان`);
    }
    if (listPrice) {
      copyLines.push(`🔹 قیمت لیست مصوب: ${num(listPrice)} تومان`);
    }
    if (profitPerUnit !== null && marginPct !== null) {
      copyLines.push(`🔹 سود ناخالص: ${num(profitPerUnit)} تومان (${percent(marginPct)})`);
    }
    copyLines.push(`---------------------------------`);
    copyLines.push(`📌 ارزیابی و تحلیل: ${verdictTitle}`);
    copyLines.push(verdictDesc);

    return {
      lastBuy,
      firstBuy,
      minBuy,
      maxBuy,
      lastCost,
      avgSell,
      listPrice,
      profitPerUnit,
      marginPct,
      verdictType,
      verdictTitle,
      verdictDesc,
      copyText: copyLines.join('\n'),
    };
  }, [product, k, unitLabel]);

  const handleCopyReport = () => {
    if (!report?.copyText) return;
    navigator.clipboard?.writeText(report.copyText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <IonPage>
      <ReportHeader title="چارت قیمت کالاها" subtitle="قیمت خرید هر بار، فروش روزانه و قیمت لیست" />
      <IonContent ref={contentRef} fullscreen className="bg-slate-50">
        <IonRefresher slot="fixed" onIonRefresh={handleRefresh}>
          <IonRefresherContent />
        </IonRefresher>

        <div className="p-3 space-y-3 max-w-2xl mx-auto pb-8">
          {error && <div className="text-xs text-rose-700 bg-rose-50 rounded-2xl p-3">{error}</div>}

          <div className="grid grid-cols-2 gap-2">
            <Segments<Range> value={range} onChange={setRange} items={[['30', '۱ ماه'], ['90', '۳ ماه'], ['180', '۶ ماه'], ['all', 'همه']]} />
            <Segments<Unit> value={unit} onChange={setUnit} items={[['kg', 'هر کیلو'], ['unit', 'هر واحد']]} />
          </div>

          {!items ? (
            <Empty>در حال بارگذاری…</Empty>
          ) : !product ? (
            <Empty>کالایی نیست.</Empty>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-sm font-extrabold text-slate-800">{product.name}</h2>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {product.category} · هر {product.unit} {num(product.weightPerUnitKg, 2)} کیلو · کل فروش {weight(product.soldKg)}
                  </p>
                </div>
                {product.costChange30Percent !== 0 && (
                  <span
                    className={`flex items-center gap-0.5 text-[10px] font-bold px-2 py-1 rounded-lg ${
                      product.costChange30Percent > 0 ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'
                    }`}
                  >
                    {product.costChange30Percent > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                    خرید {percent(Math.abs(product.costChange30Percent))} در ۳۰ روز
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between gap-1 pt-1">
                <span className="text-[10px] font-bold text-slate-500">نمایش روی چارت:</span>
                <Segments<ViewSeries>
                  value={viewSeries}
                  onChange={setViewSeries}
                  items={[
                    ['all', 'همه'],
                    ['compare', 'خرید و فروش'],
                    ['purchase', 'فقط خرید'],
                    ['sale', 'فقط فروش'],
                  ]}
                />
              </div>

              <PriceChart series={series} from={from} to={to} unitLabel={unitLabel} />

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-500">
                {series.map((s) => (
                  <span key={s.key} className="flex items-center gap-1">
                    <span className={`inline-block w-3 ${s.mode === 'dots' ? 'h-3 rounded-full border-2 bg-white' : 'h-0.5'}`} style={s.mode === 'dots' ? { borderColor: s.color } : { background: s.color }} />
                    {s.label}
                  </span>
                ))}
                <span className="text-slate-400">سایه آبی: کمترین تا بیشترین فروش روز</span>
              </div>

              <div className="grid grid-cols-4 gap-1.5">
                <Mini label="آخرین خرید" value={product.lastCostPerKg ? num(product.lastCostPerKg * k) : '—'} />
                <Mini label="فروش ۳۰ روز" value={product.avgSell30PerKg ? num(product.avgSell30PerKg * k) : '—'} />
                <Mini label="قیمت لیست" value={product.current.retailPerKg ? num(product.current.retailPerKg * k) : '—'} />
                <Mini
                  label="سود لیست"
                  value={product.listMarginPercent !== null ? percent(product.listMarginPercent) : '—'}
                  valueClass={product.listMarginPercent !== null && product.listMarginPercent < 0 ? 'text-rose-600' : 'text-emerald-600'}
                />
              </div>

              {/* Textual Analysis Report Card */}
              {report && (
                <div className="rounded-2xl border border-indigo-100/80 bg-gradient-to-br from-white via-indigo-50/20 to-amber-50/20 p-3.5 space-y-3 shadow-sm">
                  <div className="flex items-center justify-between gap-2 border-b border-indigo-50 pb-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h3 className="text-xs font-black text-slate-800">گزارش متنی تحلیلی چارت</h3>
                          <span className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full bg-indigo-100/70 text-indigo-700 font-bold">
                            <Sparkles className="w-2.5 h-2.5" /> هوشمند
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400">تحلیل پیوسته بهای تمام‌شده خرید، کشش فروش و سودآوری</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleCopyReport}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[10px] font-bold transition ${
                        copied ? 'bg-emerald-600 text-white shadow-xs' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 active:scale-95'
                      }`}
                    >
                      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied ? 'کپی شد' : 'کپی متن گزارش'}</span>
                    </button>
                  </div>

                  {/* Verdict Banner */}
                  <div
                    className={`flex items-start gap-2.5 p-2.5 rounded-xl text-xs leading-5 border ${
                      report.verdictType === 'danger'
                        ? 'bg-rose-50/90 border-rose-200 text-rose-900'
                        : report.verdictType === 'warning'
                        ? 'bg-amber-50/90 border-amber-200 text-amber-900'
                        : report.verdictType === 'good'
                        ? 'bg-emerald-50/90 border-emerald-200 text-emerald-900'
                        : 'bg-slate-50 border-slate-200 text-slate-800'
                    }`}
                  >
                    <div className="mt-0.5 shrink-0">
                      {report.verdictType === 'danger' ? (
                        <AlertTriangle className="w-4 h-4 text-rose-600" />
                      ) : report.verdictType === 'warning' ? (
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      )}
                    </div>
                    <div className="space-y-0.5">
                      <div className="font-bold text-[11px]">{report.verdictTitle}</div>
                      <div className="text-[10.5px] opacity-90">{report.verdictDesc}</div>
                    </div>
                  </div>

                  {/* Structured textual narrative points */}
                  <div className="space-y-1.5 text-[11px] text-slate-700 leading-relaxed bg-white/80 rounded-xl p-2.5 border border-slate-100">
                    <p className="flex items-baseline gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0 mt-1" />
                      <span>
                        <strong>وضعیت خرید:</strong>{' '}
                        {report.lastCost ? (
                          <>
                            آخرین نرخ خرید ثبت‌شده <strong>{num(report.lastCost)} تومان</strong> به‌ازای {unitLabel} بوده است
                            {report.lastBuy ? ` (فاکتور ${report.lastBuy.invoiceNumber} مورخ ${formatJalaliIso(report.lastBuy.date)}${report.lastBuy.supplier ? ` از ${report.lastBuy.supplier}` : ''})` : ''}.
                            {report.minBuy !== null && report.maxBuy !== null && report.minBuy !== report.maxBuy && (
                              <span className="text-slate-500 block text-[10px] mt-0.5">
                                دامنه نوسان نرخ خرید: از {num(report.minBuy)} تا {num(report.maxBuy)} تومان (تغییرات ۳۰ روزه: {percent(product.costChange30Percent)}).
                              </span>
                            )}
                          </>
                        ) : (
                          'خریدی برای این کالا ثبت نشده است.'
                        )}
                      </span>
                    </p>

                    <p className="flex items-baseline gap-1.5 pt-1 border-t border-slate-50">
                      <span className="w-1.5 h-1.5 rounded-full bg-sky-500 shrink-0 mt-1" />
                      <span>
                        <strong>وضعیت فروش:</strong>{' '}
                        {report.avgSell ? (
                          <>
                            میانگین فروش واقعی ۳۰ روز اخیر <strong>{num(report.avgSell)} تومان</strong> بوده و قیمت لیست پایه مصوب <strong>{report.listPrice ? `${num(report.listPrice)} تومان` : 'تعیین‌نشده'}</strong> است.
                          </>
                        ) : (
                          'فروشی در دوره اخیر ثبت نشده است.'
                        )}
                      </span>
                    </p>

                    {report.profitPerUnit !== null && report.marginPct !== null && (
                      <p className="flex items-baseline gap-1.5 pt-1 border-t border-slate-50">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1 ${report.profitPerUnit >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                        <span>
                          <strong>حاشیه سود ناخالص:</strong>{' '}
                          به‌ازای {unitLabel}، سود ناخالص{' '}
                          <strong className={report.profitPerUnit >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                            {num(report.profitPerUnit)} تومان ({percent(report.marginPct)})
                          </strong>{' '}
                          محاسبه شده است.
                        </span>
                      </p>
                    )}
                  </div>
                </div>
              )}

              {product.purchases.length > 0 && (
                <div>
                  <h4 className="text-[11px] font-bold text-slate-600 mb-1.5">بارهای خرید اخیر</h4>
                  <div className="divide-y divide-slate-100 rounded-2xl border border-slate-100">
                    {[...product.purchases]
                      .reverse()
                      .slice(0, 6)
                      .map((b) => (
                        <button key={`${b.invoiceId}-${b.date}-${b.kg}`} onClick={() => openInvoice(b.invoiceId)} className="w-full flex items-center justify-between px-3 py-2 text-right">
                          <span className="text-[11px] text-slate-600">
                            {formatJalaliIso(b.date)} · <span className="font-mono">{b.invoiceNumber}</span> · {weight(b.kg)}
                          </span>
                          <span className="text-[11px] font-bold font-mono text-amber-700">{num(b.costPerKg * k)}</span>
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {items && items.length > 0 && (
            <>
              <h3 className="text-xs font-bold text-slate-600 px-1">همه کالاها</h3>
              <div className="grid grid-cols-2 gap-2.5">
                {items.map((p) => {
                  const margin = p.avgSell30PerKg && p.lastCostPerKg ? ((p.avgSell30PerKg - p.lastCostPerKg) / p.avgSell30PerKg) * 100 : null;
                  return (
                    <button
                      key={p.productId}
                      onClick={() => {
                        setSelected(p.productId);
                        contentRef.current?.scrollToTop(300);
                      }}
                      className={`text-right bg-white rounded-2xl border p-3 shadow-sm transition ${p.productId === selected ? 'border-indigo-300 ring-2 ring-indigo-100' : 'border-slate-100'}`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Package className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="text-[11px] font-bold text-slate-800 truncate">{p.name}</span>
                      </div>
                      <Spark p={p} from={from} />
                      <div className="flex justify-between text-[10px] mt-1">
                        <span className="text-amber-700 font-mono">{p.lastCostPerKg ? num(p.lastCostPerKg) : '—'}</span>
                        <span className="text-sky-700 font-mono">{p.avgSell30PerKg ? num(p.avgSell30PerKg) : '—'}</span>
                        <span className={`font-mono font-bold ${margin !== null && margin < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                          {margin !== null ? percent(margin) : ''}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-slate-400 px-1 leading-5">
                در کارت‌ها: نارنجی آخرین قیمت خرید هر کیلو، آبی میانگین فروش هر کیلو در ۳۰ روز اخیر، و درصد سود روی فروش.
              </p>
            </>
          )}
        </div>
        {modal}
      </IonContent>
    </IonPage>
  );
};
