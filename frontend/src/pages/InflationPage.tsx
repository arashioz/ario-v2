import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { IonPage, IonContent, IonRefresher, IonRefresherContent } from '@ionic/react';
import type { RefresherEventDetail } from '@ionic/react';
import { Flame, Info, Package, Percent, Tag, TrendingUp, Warehouse } from 'lucide-react';
import { accountingService } from '../services/accounting.service';
import type { InflationReport, PriceSuggestion } from '../services/accounting.service';
import { PeriodPicker, periodPresets, periodQuery } from '../components/ui/PeriodPicker';
import type { Period } from '../components/ui/PeriodPicker';
import { Empty, Mini, ReportHeader, Segments, StatCard } from '../components/reports/ReportUI';
import { useInvoiceOpener } from '../components/reports/useInvoiceOpener';
import { PriceSuggestionCard, PricingOptionsPanel, pricingQuery, usePricingOptions } from '../components/pricing/PriceSuggestion';
import { usePriceApplier } from '../components/pricing/usePriceApplier';
import Toman from '../components/ui/Toman';
import { dateToYmd, formatJalali, ymdToJalali, JALALI_MONTHS, faNum } from '../lib/jalali';
import { formatToman, num, percent, profitColor, weight } from '../lib/format';

type View = 'prices' | 'product' | 'changes' | 'month';

const jDate = (iso: string) => formatJalali(dateToYmd(new Date(iso)));
const signedPct = (n: number) => `${n > 0 ? '+' : ''}${percent(n)}`;

/** Buy vs sell price-change ratios, overall and per product. */
const PriceRatioChart: React.FC<{
  cost: number;
  sell: number;
  products: InflationReport['products'];
}> = ({ cost, sell, products }) => {
  const rows = [...products]
    .filter((p) => p.costInflationPercent !== 0 || p.sellChangePercent !== 0)
    .sort((a, b) => Math.abs(b.costInflationPercent) + Math.abs(b.sellChangePercent) - (Math.abs(a.costInflationPercent) + Math.abs(a.sellChangePercent)))
    .slice(0, 8);
  const max = Math.max(1, Math.abs(cost), Math.abs(sell), ...rows.flatMap((p) => [Math.abs(p.costInflationPercent), Math.abs(p.sellChangePercent)]));
  const Bar = ({ value, tone }: { value: number; tone: string }) => (
    <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.max(6, (Math.abs(value) / max) * 100)}%` }} />
    </div>
  );
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-bold text-slate-800">نسبت تغییر قیمت</h3>
        <div className="flex items-center gap-2 text-[10px] text-slate-500">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" /> خرید</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-sky-500" /> فروش</span>
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="w-10 text-[10px] text-slate-500">خرید</span>
          <Bar value={cost} tone="bg-rose-500" />
          <span className={`w-14 text-left font-mono text-[11px] font-bold ${cost > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{signedPct(cost)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-10 text-[10px] text-slate-500">فروش</span>
          <Bar value={sell} tone="bg-sky-500" />
          <span className={`w-14 text-left font-mono text-[11px] font-bold ${sell >= cost ? 'text-emerald-700' : 'text-amber-700'}`}>{signedPct(sell)}</span>
        </div>
      </div>
      {rows.length > 0 && (
        <div className="space-y-2.5 pt-2 border-t border-slate-100">
          {rows.map((p) => (
            <div key={p.productId}>
              <div className="text-[11px] font-bold text-slate-700 truncate mb-1">{p.name}</div>
              <div className="flex items-center gap-2">
                <Bar value={p.costInflationPercent} tone="bg-rose-400" />
                <span className="w-12 text-left font-mono text-[10px] text-rose-600">{signedPct(p.costInflationPercent)}</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <Bar value={p.sellChangePercent} tone="bg-sky-400" />
                <span className="w-12 text-left font-mono text-[10px] text-sky-700">{signedPct(p.sellChangePercent)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/** Buy and sell price per kilo, indexed to the first day of the period (= 100). */
const PriceTrend: React.FC<{ days: InflationReport['byDay'] }> = ({ days }) => {
  const rows = [...days].reverse().filter((d) => (d.costPerKg || 0) > 0 || (d.sellPerKg || 0) > 0);
  if (rows.length < 2) return null;
  const cost0 = rows.find((d) => d.costPerKg > 0)?.costPerKg || 1;
  const sell0 = rows.find((d) => d.sellPerKg > 0)?.sellPerKg || 1;
  const cost = rows.map((d) => (d.costPerKg > 0 ? (d.costPerKg / cost0) * 100 : null));
  const sell = rows.map((d) => (d.sellPerKg > 0 ? (d.sellPerKg / sell0) * 100 : null));
  const vals = [...cost, ...sell].filter((n): n is number => n != null);
  const min = Math.min(100, ...vals);
  const max = Math.max(100, ...vals);
  const W = 320;
  const H = 112;
  const pad = 6;
  const x = (i: number) => pad + (rows.length === 1 ? 0 : i / (rows.length - 1)) * (W - pad * 2);
  const y = (v: number) => pad + (1 - (v - min) / (max - min || 1)) * (H - pad * 2);
  const line = (series: (number | null)[]) => {
    let d = '';
    series.forEach((v, i) => {
      if (v == null) return;
      d += `${d ? ' L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    });
    return d;
  };
  const endOf = (series: (number | null)[]) => [...series].reverse().find((v) => v != null) ?? 100;
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-xs font-bold text-slate-800">روند قیمت خرید و فروش</h3>
          <p className="text-[10px] text-slate-400 mt-0.5">روز اول بازه برابر ۱۰۰ است</p>
        </div>
        <div className="text-left text-[10px] font-bold leading-4">
          <div className="text-rose-600">خرید {signedPct(endOf(cost) - 100)}</div>
          <div className="text-sky-700">فروش {signedPct(endOf(sell) - 100)}</div>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-28 mt-2">
        <path d={line(cost)} fill="none" stroke="#e11d48" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
        <path d={line(sell)} fill="none" stroke="#0284c7" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div className="flex justify-between text-[10px] text-slate-400">
        <span>{formatJalali(rows[0].date)}</span>
        <span className="flex items-center gap-3">
          <span className="text-rose-600">خرید هر کیلو</span>
          <span className="text-sky-700">فروش هر کیلو</span>
        </span>
        <span>{formatJalali(rows[rows.length - 1].date)}</span>
      </div>
    </div>
  );
};

export const InflationPage: React.FC = () => {
  const [period, setPeriod] = useState<Period>(() => periodPresets()[0]);
  const [general, setGeneral] = useState('');
  const [data, setData] = useState<InflationReport | null>(null);
  const [error, setError] = useState('');
  const [view, setView] = useState<View>('prices');

  const [pricing, setPricing] = usePricingOptions();
  const [suggestions, setSuggestions] = useState<PriceSuggestion[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [onlyChanged, setOnlyChanged] = useState(true);

  const generalNum = Number(general) || 0;

  const load = useCallback(async () => {
    try {
      setError('');
      setData(await accountingService.inflation({ ...periodQuery(period), general: generalNum || undefined }));
    } catch {
      setError('دریافت گزارش سود تورمی ناموفق بود');
    }
  }, [period, generalNum]);

  const query = useMemo(() => pricingQuery(pricing), [pricing]);
  const loadSuggestions = useCallback(async () => {
    try {
      const list = await accountingService.priceSuggestions(query);
      setSuggestions(list);
      setSelected(new Set(list.filter((s) => s.needsUpdate && !s.belowCost).map((s) => s.productId)));
    } catch {
      setError('دریافت قیمت‌های پیشنهادی ناموفق بود');
    }
  }, [query]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    const t = setTimeout(loadSuggestions, 300);
    return () => clearTimeout(t);
  }, [loadSuggestions]);

  const { open: openInvoice, modal } = useInvoiceOpener(load);
  const { apply, applying, applied, reset } = usePriceApplier(() => {
    reset();
    loadSuggestions();
  });

  const handleRefresh = async (e: CustomEvent<RefresherEventDetail>) => {
    await Promise.all([load(), loadSuggestions()]);
    e.detail.complete();
  };

  const s = data?.summary;
  const tradingW = s && s.profit > 0 ? Math.max(0, Math.min(100, (s.tradingProfit / s.profit) * 100)) : 0;

  const months = useMemo(() => {
    const m = new Map<string, { key: string; label: string; kg: number; profit: number; trading: number; inflation: number }>();
    for (const d of data?.byDay ?? []) {
      const j = ymdToJalali(d.date);
      const key = `${j.jy}-${String(j.jm).padStart(2, '0')}`;
      if (!m.has(key)) m.set(key, { key, label: `${JALALI_MONTHS[j.jm - 1]} ${faNum(j.jy)}`, kg: 0, profit: 0, trading: 0, inflation: 0 });
      const r = m.get(key)!;
      r.kg += d.kg;
      r.profit += d.profit;
      r.trading += d.tradingProfit;
      r.inflation += d.inflationProfit;
    }
    return [...m.values()].sort((a, b) => (a.key < b.key ? 1 : -1));
  }, [data]);

  const shown = (suggestions ?? []).filter((x) => !onlyChanged || x.needsUpdate);
  const toApply = shown.filter((x) => selected.has(x.productId) && !applied.has(x.productId));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <IonPage>
      <ReportHeader
        title="سود تورمی"
        subtitle="چقدر از سود از خرید و فروش آمد و چقدر از گران شدن بار"
        right={<PeriodPicker value={period} onChange={setPeriod} />}
      />

      <IonContent fullscreen className="bg-slate-50">
        <IonRefresher slot="fixed" onIonRefresh={handleRefresh}>
          <IonRefresherContent />
        </IonRefresher>

        <div className="p-3 space-y-3 max-w-2xl mx-auto pb-8">
          {error && <div className="text-xs text-rose-700 bg-rose-50 rounded-2xl p-3">{error}</div>}

          <div className="rounded-2xl p-4 text-white bg-gradient-to-br from-orange-500 to-rose-600 shadow-xl shadow-orange-600/20">
            <div className="flex items-center gap-2 text-orange-100 text-xs">
              <Flame className="w-4 h-4" />
              سود ناخالص · {period.label}
            </div>
            <div className="mt-2 text-3xl font-bold">
              <Toman value={s?.profit} unitClassName="text-sm font-normal text-orange-100" />
            </div>
            <div className="mt-3 h-2.5 rounded-full bg-white/20 overflow-hidden flex">
              <div className="h-full bg-white" style={{ width: `${tradingW}%` }} />
              <div className="h-full bg-amber-300" style={{ width: `${100 - tradingW}%` }} />
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3 text-[11px]">
              <div>
                <div className="flex items-center gap-1.5 text-orange-100">
                  <span className="w-2 h-2 rounded-full bg-white" /> سود تجاری ({percent(s?.tradingShare)})
                </div>
                <div className="font-bold text-sm mt-0.5">
                  <Toman value={s?.tradingProfit} unitClassName="text-[10px] font-normal text-orange-100" />
                </div>
                <div className="text-[10px] text-orange-100 font-mono">کیلویی {formatToman(s?.tradingPerKg)}</div>
              </div>
              <div className="text-left">
                <div className="flex items-center gap-1.5 justify-end text-orange-100">
                  <span className="w-2 h-2 rounded-full bg-amber-300" /> سود تورمی ({percent(s?.inflationShare)})
                </div>
                <div className="font-bold text-sm mt-0.5">
                  <Toman value={s?.inflationProfit} unitClassName="text-[10px] font-normal text-orange-100" />
                </div>
                <div className="text-[10px] text-orange-100 font-mono">کیلویی {formatToman(s?.inflationPerKg)}</div>
              </div>
            </div>
          </div>

          <div className="flex gap-2.5 bg-sky-50 border border-sky-100 rounded-2xl p-3 text-[11px] text-sky-900 leading-6">
            <Info className="w-4 h-4 shrink-0 mt-1 text-sky-600" />
            <div>
              <b>سود تجاری</b> = قیمت فروش − آخرین بهای تمام‌شده خرید در روز فروش (بهای جایگزینی). <b>سود تورمی</b> = بهای جایگزینی − بهایی که واقعاً برای همان بار
              داده‌اید. بهای تمام‌شده = قیمت فاکتور پس از تخفیف + سهم کرایه حمل و تخلیه هر کیلو.
              <br />
              مثال: ۵ تن ۱۳۳ خریدید، ۳ تن ۱۵۵ فروختید (سود تجاری ۶۶ میلیون)، بعد ۲ تن ۱۴۲ خریدید و ۲ تن باقی‌مانده را ۱۵۵ فروختید؛ این ۲ تن در واقع ۱۳۳ خریده شده
              بود، پس ۲۶ میلیون سود تجاری و ۱۸ میلیون سود تورمی است.
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <StatCard
              icon={<TrendingUp className="w-4 h-4" />}
              tone="rose"
              title="تورم قیمت خرید در این بازه"
              main={signedPct(s?.costInflationPercent ?? 0)}
              mainClass={(s?.costInflationPercent ?? 0) > 0 ? 'text-rose-600' : 'text-emerald-600'}
              sub={`${num(s?.priceChanges)} بار تغییر قیمت خرید`}
            />
            <StatCard
              icon={<Tag className="w-4 h-4" />}
              tone="sky"
              title="تغییر قیمت فروش شما"
              main={signedPct(s?.sellChangePercent ?? 0)}
              sub={
                s
                  ? s.sellChangePercent >= s.costInflationPercent
                    ? 'هم‌پای تورم یا جلوتر'
                    : `${percent(s.costInflationPercent - s.sellChangePercent)} عقب‌تر از تورم خرید`
                  : ''
              }
            />
            <StatCard
              icon={<Warehouse className="w-4 h-4" />}
              tone="amber"
              title="سود گران شدن موجودی (در بازه)"
              main={formatToman(s?.holdingGain)}
              mainClass={profitColor(s?.holdingGain ?? 0)}
              sub="بار انبار × افزایش قیمت خرید"
            />
            <StatCard
              icon={<Package className="w-4 h-4" />}
              tone="emerald"
              title="سود تورمی موجودی فعلی (فروش‌نرفته)"
              main={formatToman(data?.stock.unrealizedGain)}
              mainClass={profitColor(data?.stock.unrealizedGain ?? 0)}
              sub={`${weight(data?.stock.kg)} به قیمت آخرین خرید`}
            />
          </div>

          {data?.summary && (
            <PriceRatioChart cost={data.summary.costInflationPercent} sell={data.summary.sellChangePercent} products={data.products} />
          )}
          {data && <PriceTrend days={data.byDay} />}

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                <Percent className="w-4 h-4 text-violet-500" /> سود واقعی پس از تورم عمومی
              </div>
              <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
                تورم سالانه
                <input
                  value={general}
                  onChange={(e) => setGeneral(e.target.value.replace(/[^0-9.]/g, ''))}
                  inputMode="decimal"
                  placeholder="مثلاً ۳۵"
                  className="w-16 text-center font-mono font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg py-1 focus:outline-none focus:border-violet-400"
                />
                ٪
              </label>
            </div>
            {generalNum > 0 && s ? (
              <div className="grid grid-cols-2 gap-2">
                <Mini label="کاهش ارزش پول در مدت نگهداری بار" value={formatToman(s.generalInflationErosion)} valueClass="text-rose-600" />
                <Mini label="سود واقعی" value={formatToman(s.realProfit)} valueClass={profitColor(s.realProfit)} />
              </div>
            ) : (
              <p className="text-[10px] text-slate-400 leading-5">
                با وارد کردن تورم سالانه، برای هر بار به اندازه روزهایی که در انبار مانده کاهش ارزش پول حساب می‌شود و سود واقعی را می‌بینید.
              </p>
            )}
          </div>

          <Segments<View>
            value={view}
            onChange={setView}
            items={[
              ['prices', 'قیمت پیشنهادی'],
              ['product', 'کالا'],
              ['changes', `تغییر قیمت خرید (${num(data?.priceChanges.length ?? 0)})`],
              ['month', 'ماهانه'],
            ]}
          />

          {view === 'prices' ? (
            <div className="space-y-3">
              <PricingOptionsPanel value={pricing} onChange={setPricing} />
              <div className="flex items-center justify-between px-1">
                <label className="flex items-center gap-2 text-[11px] text-slate-600">
                  <input type="checkbox" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} className="accent-emerald-600" />
                  فقط کالاهایی که قیمتشان باید تغییر کند
                </label>
                <span className="text-[10px] text-slate-400">{num(shown.length)} کالا</span>
              </div>
              {!suggestions ? null : shown.length === 0 ? (
                <Empty>قیمت همه کالاها با بهای جایگزینی هماهنگ است.</Empty>
              ) : (
                shown.map((x) => (
                  <PriceSuggestionCard
                    key={x.productId}
                    s={x}
                    selected={selected.has(x.productId)}
                    onToggle={() => toggle(x.productId)}
                    onApply={() => apply([x])}
                    applying={applying.has(x.productId)}
                    applied={applied.has(x.productId)}
                  />
                ))
              )}
              {toApply.length > 0 && (
                <div className="sticky bottom-24 z-10">
                  <button
                    onClick={() => apply(toApply)}
                    disabled={applying.size > 0}
                    className="w-full py-3 rounded-2xl bg-emerald-600 text-white text-sm font-bold shadow-lg shadow-emerald-600/30 active:scale-[0.98] disabled:opacity-60"
                  >
                    اعمال قیمت {num(toApply.length)} کالای انتخاب‌شده
                  </button>
                </div>
              )}
            </div>
          ) : !data ? null : view === 'product' ? (
            <div className="space-y-2.5">
              {data.products.length === 0 ? (
                <Empty>فروشی در این بازه نیست.</Empty>
              ) : (
                data.products.map((p) => (
                  <div key={p.productId} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-xs font-bold text-slate-800 truncate">{p.name}</h3>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          فروش {weight(p.kg)} · سود کل <span className={`font-mono ${profitColor(p.profit)}`}>{formatToman(p.profit)}</span>
                        </p>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0 font-mono ${
                          p.costInflationPercent > 0 ? 'bg-rose-50 text-rose-600' : p.costInflationPercent < 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        تورم خرید {signedPct(p.costInflationPercent)}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 mt-3">
                      <Mini label="سود تجاری" value={formatToman(p.tradingProfit)} sub={`کیلویی ${formatToman(p.tradingPerKg)}`} valueClass={profitColor(p.tradingProfit)} />
                      <Mini label="سود تورمی" value={formatToman(p.inflationProfit)} sub={`کیلویی ${formatToman(p.inflationPerKg)}`} valueClass={profitColor(p.inflationProfit)} />
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 mt-1.5">
                      <Mini
                        label="خرید هر کیلو"
                        value={p.costStart === p.costEnd ? num(p.costEnd) : `${num(p.costStart)} ← ${num(p.costEnd)}`}
                        sub={`${num(p.priceChanges)} تغییر`}
                      />
                      <Mini
                        label="فروش هر کیلو"
                        value={p.sellStart === null ? '—' : p.sellStart === p.sellEnd ? num(p.sellEnd) : `${num(p.sellStart)} ← ${num(p.sellEnd)}`}
                        sub={signedPct(p.sellChangePercent)}
                      />
                      <Mini
                        label="موجودی فعلی"
                        value={weight(p.stockKg)}
                        sub={p.unrealizedGain ? `تورمی ${formatToman(p.unrealizedGain)}` : undefined}
                        valueClass="text-slate-700"
                      />
                    </div>
                    {p.holdingGain !== 0 && (
                      <p className="text-[10px] text-slate-500 mt-2">
                        با گران/ارزان شدن خرید در این بازه، ارزش بار انبارِ این کالا <b className={`font-mono ${profitColor(p.holdingGain)}`}>{formatToman(p.holdingGain)}</b>{' '}
                        تغییر کرد.
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          ) : view === 'changes' ? (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm divide-y divide-slate-100">
              {data.priceChanges.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">در این بازه قیمت خرید تغییری نکرده.</div>
              ) : (
                data.priceChanges.map((c, i) => (
                  <button key={`${c.invoiceId}-${c.productId}-${i}`} onClick={() => openInvoice(c.invoiceId)} className="w-full text-right px-3.5 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-700 truncate">{c.productName}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {jDate(c.date)} · <span className="font-mono">{c.invoiceNumber}</span>
                        </div>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md font-mono ${c.changePercent > 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
                        {signedPct(c.changePercent)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-1.5 text-[11px]">
                      <span className="font-mono text-slate-600">
                        {num(c.oldCost)} ← <b>{num(c.newCost)}</b> هر کیلو
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {c.stockKg > 0 ? (
                          <>
                            انبار {weight(c.stockKg)} · <b className={`font-mono ${profitColor(c.gain)}`}>{formatToman(c.gain)}</b>
                          </>
                        ) : (
                          'انبار خالی بود'
                        )}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          ) : (
            <div className="space-y-2.5">
              {months.length === 0 ? (
                <Empty>فروشی در این بازه نیست.</Empty>
              ) : (
                months.map((m) => {
                  const w = m.profit > 0 ? Math.max(0, Math.min(100, (m.trading / m.profit) * 100)) : 0;
                  return (
                    <div key={m.key} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-bold text-slate-700">{m.label}</div>
                        <div className={`text-xs font-bold ${profitColor(m.profit)}`}>
                          <Toman value={m.profit} />
                        </div>
                      </div>
                      <div className="mt-2 h-2 rounded-full bg-amber-200 overflow-hidden">
                        <div className="h-full bg-emerald-500" style={{ width: `${w}%` }} />
                      </div>
                      <div className="flex justify-between mt-1.5 text-[10px]">
                        <span className="text-emerald-700">
                          تجاری <b className="font-mono">{formatToman(m.trading)}</b>
                        </span>
                        <span className="text-amber-700">
                          تورمی <b className="font-mono">{formatToman(m.inflation)}</b>
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1">فروش {weight(m.kg)}</div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
        {modal}
      </IonContent>
    </IonPage>
  );
};
