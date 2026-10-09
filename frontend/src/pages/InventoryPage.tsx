import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { IonPage, IonContent, IonRefresher, IonRefresherContent } from '@ionic/react';
import type { RefresherEventDetail } from '@ionic/react';
import { AlertTriangle, Boxes, ChevronDown, RefreshCw, Search, TrendingUp, Truck, Weight } from 'lucide-react';
import { accountingService } from '../services/accounting.service';
import { apiErrorMessage, invoicesService } from '../services/invoices.service';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { KV, Mini, ReportHeader, StatCard } from '../components/reports/ReportUI';
import { PRICE_TIER_LABELS } from '../services/accounting.service';
import type { InventoryItem, InventoryReport, PriceTierKey } from '../services/accounting.service';
import { PeriodPicker, periodPresets, periodQuery } from '../components/ui/PeriodPicker';
import type { Period } from '../components/ui/PeriodPicker';
import { formatJalali, dateToYmd } from '../lib/jalali';
import { formatToman, num, percent, profitColor, tons, weight } from '../lib/format';

type SortKey = 'stock' | 'sold' | 'profit' | 'value';

const SORTS: [SortKey, string][] = [
  ['stock', 'بیشترین موجودی'],
  ['value', 'ارزش موجودی'],
  ['sold', 'بیشترین فروش'],
  ['profit', 'بیشترین سود'],
];

export const InventoryPage: React.FC = () => {
  const { user } = useAuth();
  const { showNotification } = useNotification();
  const isAdmin = user?.role === 'admin';
  const [period, setPeriod] = useState<Period>(() => periodPresets()[0]);
  const [data, setData] = useState<InventoryReport | null>(null);
  const [error, setError] = useState('');
  const [rebuilding, setRebuilding] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('stock');
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError('');
      setData(await accountingService.inventory(periodQuery(period)));
    } catch {
      setError('دریافت گزارش انبار ناموفق بود');
    }
  }, [period]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRefresh = async (e: CustomEvent<RefresherEventDetail>) => {
    await load();
    e.detail.complete();
  };

  const rebuild = () => {
    if (!window.confirm('موجودی هر کالا از جمع فاکتورهای خرید تحویل‌شده، منهای جمع فاکتورهای فروش از آریو، دوباره نوشته شود؟')) return;
    setRebuilding(true);
    invoicesService
      .rebuildStock()
      .then(async (res) => {
        showNotification({
          title: 'انبار به‌روز شد',
                            message: `${res.changed.toLocaleString('fa-IR')} کالا اصلاح شد. ${res.purchases.toLocaleString('fa-IR')} فاکتور خرید و ${res.sales.toLocaleString('fa-IR')} فاکتور فروش حساب شد.`,
          type: 'success',
        });
        await load();
      })
      .catch((err) => {
        showNotification({ title: 'انبار به‌روز نشد', message: apiErrorMessage(err, 'محاسبه انبار انجام نشد'), type: 'error' });
      })
      .finally(() => setRebuilding(false));
  };

  const items = useMemo(() => {
    const q = search.trim();
    const list = (data?.items ?? []).filter((i) => !q || i.name.includes(q));
    const key: Record<SortKey, (i: InventoryItem) => number> = {
      stock: (i) => i.stockKg,
      value: (i) => i.stockValue,
      sold: (i) => i.soldKg,
      profit: (i) => i.profit,
    };
    return [...list].sort((a, b) => key[sort](b) - key[sort](a));
  }, [data, search, sort]);

  const t = data?.totals;
  const inStock = (data?.items ?? []).filter((i) => i.stockKg > 0).length;
  const allTime = !period.from && !period.to;

  return (
    <IonPage>
      <ReportHeader
        title="انبار و تناژ"
        subtitle="موجودی، خرید، فروش و ارزش به روش FIFO"
        right={<PeriodPicker value={period} onChange={setPeriod} />}
      />

      <IonContent fullscreen className="bg-slate-50">
        <IonRefresher slot="fixed" onIonRefresh={handleRefresh}>
          <IonRefresherContent />
        </IonRefresher>

        <div className="p-3 space-y-3 max-w-2xl mx-auto pb-8">
          {error && <div className="text-xs text-rose-700 bg-rose-50 rounded-2xl p-3">{error}</div>}

          {/* Stock on hand */}
          <div className="rounded-2xl p-4 text-white bg-gradient-to-br from-sky-600 to-indigo-700 shadow-xl shadow-sky-700/20">
            <div className="flex items-center gap-2 text-sky-100 text-xs">
              <Weight className="w-4 h-4" />
              تناژ موجود انبار (همین الان)
            </div>
            <div className="mt-2 flex items-end gap-2">
              <span className="text-4xl font-bold font-mono">{tons(t?.stockKg)}</span>
              <span className="text-sm mb-1.5 text-sky-100">تن</span>
            </div>
            <div className="mt-1 text-[11px] text-sky-100">
              <span className="font-mono">{num(t?.stockKg, 1)}</span> کیلو در <span className="font-mono">{num(inStock)}</span> کالا · خرید منهای فروش از آریو
            </div>
            {isAdmin && (
              <button
                disabled={rebuilding}
                onClick={rebuild}
                className="mt-3 w-full py-2 rounded-xl bg-white/15 text-white text-[11px] font-bold disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${rebuilding ? 'animate-spin' : ''}`} />
                {rebuilding ? 'در حال محاسبه…' : 'محاسبه موجودی از خرید و فروش'}
              </button>
            )}
            <div className="mt-3 pt-3 border-t border-white/15 flex items-center justify-between">
              <span className="text-[11px] text-sky-100">ارزش موجودی به قیمت خرید</span>
              <span className="text-base font-bold font-mono">{formatToman(t?.stockValue)}</span>
            </div>
          </div>

          {t?.currentValue && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3.5">
              <div className="text-[11px] font-bold text-slate-600 mb-2">ارزش فعلی موجودی</div>
              <div className="grid grid-cols-3 gap-2 text-center">
                {(['wholesale', 'supermarket', 'retail'] as PriceTierKey[]).map((k) => (
                  <div key={k} className="rounded-xl bg-slate-50 p-2">
                    <div className="text-[10px] text-slate-400">{PRICE_TIER_LABELS[k]}</div>
                    <div className="text-xs font-bold font-mono text-slate-800 mt-0.5">
                      {formatToman(t.currentValue[k])}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <StatCard
              icon={<Truck className="w-4 h-4" />}
              tone="amber"
              title="کل خرید از اول"
              main={`${tons(t?.purchasedKg)} تن`}
              sub={formatToman(t?.purchasedAmount)}
            />
            <StatCard
              icon={<Boxes className="w-4 h-4" />}
              tone="sky"
              title={`فروش · ${period.label}`}
              main={`${tons(t?.soldKg)} تن`}
              sub={formatToman(t?.soldRevenue)}
            />
            <StatCard
              icon={<TrendingUp className="w-4 h-4" />}
              tone="emerald"
              title="سود ناخالص فروش"
              main={`${formatToman(t?.profit)}`}
              sub={`${percent(t?.marginPercent, 2)} · کیلویی ${formatToman(t?.profitPerKg)}`}
            />
            <StatCard
              icon={<Boxes className="w-4 h-4" />}
              tone="slate"
              title="بهای خرید کالای فروخته"
              main={`${formatToman(t?.soldCost)}`}
              sub={t?.soldKg ? `کیلویی ${formatToman((t.soldCost || 0) / t.soldKg)}` : '—'}
            />
          </div>

          {allTime && t && t.differenceKg !== null && Math.abs(t.differenceKg) >= 0.05 && (
            <div className="flex gap-2.5 bg-amber-50 border border-amber-200 rounded-2xl p-3 text-[11px] text-amber-800 leading-6">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-1" />
              <div className="min-w-0 flex-1">
                <b>موجودی ثبت‌شده با جمع خرید و فروش یکی نیست</b>
                <br />
                اختلاف روی {num(Math.abs(t.differenceKg), 2)} واحد است. موجودی باید برابر جمع فاکتورهای خرید تحویل‌شده منهای جمع فاکتورهای فروش از آریو باشد.
                {isAdmin && (
                  <button
                    disabled={rebuilding}
                    onClick={rebuild}
                    className="mt-2 w-full py-2 rounded-xl bg-amber-700 text-white text-[11px] font-bold disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${rebuilding ? 'animate-spin' : ''}`} />
                    {rebuilding ? 'در حال محاسبه…' : 'محاسبه موجودی از خرید و فروش'}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Product list */}
          <div className="space-y-2.5">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="جستجوی کالا"
                className="w-full pr-10 pl-3 py-2.5 rounded-2xl border border-slate-200 bg-white text-xs focus:outline-none focus:border-sky-500"
              />
            </div>
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
              {SORTS.map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setSort(k)}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap transition ${
                    sort === k ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 border border-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2.5">
            {items.map((i) => (
              <ProductRow
                key={i.productId}
                item={i}
                open={openId === i.productId}
                onToggle={() => setOpenId(openId === i.productId ? null : i.productId)}
              />
            ))}
            {data && items.length === 0 && (
              <div className="bg-white rounded-2xl p-6 text-center border border-dashed border-slate-200 text-xs text-slate-400">
                کالایی پیدا نشد.
              </div>
            )}
          </div>
        </div>
      </IonContent>
    </IonPage>
  );
};

const ProductRow: React.FC<{ item: InventoryItem; open: boolean; onToggle: () => void }> = ({ item: i, open, onToggle }) => {
  const soldShare = i.purchasedKg ? Math.min(100, (i.soldKg / i.purchasedKg) * 100) : 0;
  const expected = i.expectedUnits ?? 0;
  const mismatch = i.exists && (i.purchasedKg > 0 || i.soldKg > 0) && Math.abs(i.stockUnits - expected) >= 0.05;
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <button onClick={onToggle} className="w-full p-3 text-right">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-xs font-bold text-slate-800 truncate">
              {i.name}
              {!i.exists && <span className="mr-1.5 text-[9px] font-bold text-rose-500 bg-rose-50 px-1.5 py-0.5 rounded">حذف‌شده</span>}
            </h3>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {i.weightPerUnitKg ? `هر ${i.unit || 'واحد'} ${num(i.weightPerUnitKg, 2)} کیلو` : i.unit}
            </p>
          </div>
          <div className="text-left shrink-0">
            <div className={`text-sm font-bold font-mono ${i.stockKg < 0 ? 'text-rose-600' : 'text-slate-800'}`}>{weight(i.stockKg)}</div>
            <div className="text-[10px] text-slate-400 font-mono">
              {num(i.stockUnits, 2)} {i.unit} · {formatToman(i.stockValue)}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-3 text-center">
          <Mini label="کل خرید" value={weight(i.purchasedKg)} sub={i.avgBuyPerKg ? `کیلویی ${formatToman(i.avgBuyPerKg)}` : '—'} />
          <Mini label="فروش" value={weight(i.soldKg)} sub={i.avgSellPerKg ? `کیلویی ${formatToman(i.avgSellPerKg)}` : '—'} />
          <Mini
            label="سود"
            value={formatToman(i.profit)}
            sub={i.soldKg ? `${percent(i.marginPercent)} · کیلویی ${formatToman(i.profitPerKg)}` : '—'}
            valueClass={profitColor(i.profit)}
          />
        </div>

        {i.purchasedKg > 0 && (
          <div className="mt-3 h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full bg-sky-500 rounded-full" style={{ width: `${soldShare}%` }} />
          </div>
        )}
        <div className="flex items-center justify-center mt-2">
          <ChevronDown className={`w-4 h-4 text-slate-300 transition ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {open && (
        <div className="px-3.5 pb-3.5 space-y-2 border-t border-slate-100 pt-3">
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <KV k="مبلغ کل خرید" v={formatToman(i.purchasedAmount)} />
            <KV k="تعداد بار خرید" v={num(i.purchaseCount)} />
            <KV k="مبلغ فروش" v={formatToman(i.soldRevenue)} />
            <KV k="بهای خرید فروخته‌ها" v={formatToman(i.soldCost)} />
            <KV k="ارزش موجودی به قیمت خرید" v={formatToman(i.stockValue)} />
            {i.currentValue && <KV k="ارزش فعلی (عمده)" v={formatToman(i.currentValue.wholesale)} />}
            {i.currentValue && <KV k="ارزش فعلی (سوپرمارکت)" v={formatToman(i.currentValue.supermarket)} />}
            {i.currentValue && <KV k="ارزش فعلی (خرده)" v={formatToman(i.currentValue.retail)} />}
          </div>
          {mismatch && (
            <div className="text-[10px] text-amber-700 bg-amber-50 rounded-xl p-2.5 leading-5">
              طبق جمع خرید منهای فروش از آریو باید <b className="font-mono">{num(expected, 2)} {i.unit || 'واحد'}</b> مانده باشد ولی موجودی ثبت‌شده{' '}
              <b className="font-mono">{num(i.stockUnits, 2)} {i.unit || 'واحد'}</b> است.
            </div>
          )}
          <div className="text-[11px] font-bold text-slate-600 pt-1">بارهای باقی‌مانده در انبار (قدیمی‌ترین اول فروخته می‌شود)</div>
          {i.openLots.length === 0 ? (
            <div className="text-[11px] text-slate-400">از بارهای خریداری‌شده چیزی نمانده است.</div>
          ) : (
            <div className="rounded-2xl border border-slate-100 divide-y divide-slate-100">
              {i.openLots.map((l, idx) => (
                <div key={`${l.invoiceNumber}-${idx}`} className="flex items-center justify-between px-3 py-2 text-[11px]">
                  <div>
                    <div className="font-bold text-slate-700">{formatJalali(dateToYmd(new Date(l.date)))}</div>
                    <div className="text-[10px] text-slate-400 font-mono">{l.invoiceNumber}</div>
                  </div>
                  <div className="text-left">
                    <div className="font-mono font-bold text-slate-800">{weight(l.kgLeft)}</div>
                    <div className="text-[10px] text-slate-400 font-mono">خرید کیلویی {formatToman(l.costPerKg)}</div>
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
