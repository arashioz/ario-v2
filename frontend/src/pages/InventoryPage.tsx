import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { IonPage, IonContent, IonRefresher, IonRefresherContent } from '@ionic/react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
import { formatStock, formatToman, num, percent, profitColor, tons, weight } from '../lib/format';
import { PARENT_COMPANY } from '../services/suppliers.service';
import { ListSkeleton } from '../components/ui/Skeleton';

type SortKey = 'stock' | 'sold' | 'profit' | 'value';
const FILTER_KEY = 'ario.inventoryFilter.v2';

const loadInvFilter = (): { companies: string[]; category: string } => {
  try {
    const raw = localStorage.getItem(FILTER_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { companies?: string[]; category?: string };
      if (Array.isArray(parsed.companies)) return { companies: parsed.companies, category: parsed.category || 'all' };
    }
  } catch {
    /* keep default */
  }
  return { companies: [], category: 'all' };
};

const SORTS: [SortKey, string][] = [
  ['stock', 'بیشترین موجودی'],
  ['value', 'ارزش موجودی'],
  ['sold', 'بیشترین فروش'],
  ['profit', 'بیشترین سود'],
];

export const InventoryPage: React.FC = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
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
  const [companyFilter, setCompanyFilter] = useState<string[]>(() => {
    const fromUrl = params.get('company');
    return fromUrl ? [fromUrl] : loadInvFilter().companies;
  });
  const [categoryFilter, setCategoryFilter] = useState<string>(() => loadInvFilter().category);

  useEffect(() => {
    const fromUrl = params.get('company');
    if (fromUrl) setCompanyFilter([fromUrl]);
  }, [params]);

  useEffect(() => {
    localStorage.setItem(FILTER_KEY, JSON.stringify({ companies: companyFilter, category: categoryFilter }));
  }, [companyFilter, categoryFilter]);

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

  const houses = useMemo(() => {
    const rows = new Map<string, { kg: number; cost: number; current: number; count: number; empty: number }>();
    for (const item of data?.items ?? []) {
      const name = (item.supplier || PARENT_COMPANY).trim() || PARENT_COMPANY;
      const row = rows.get(name) || { kg: 0, cost: 0, current: 0, count: 0, empty: 0 };
      row.kg += item.stockKg || 0;
      row.cost += item.stockValue || 0;
      row.current += item.currentValue?.wholesale || item.stockValue || 0;
      row.count += 1;
      if ((item.stockKg || 0) <= 0) row.empty += 1;
      rows.set(name, row);
    }
    return [...rows.entries()]
      .map(([name, row]) => ({ name, ...row }))
      .sort((a, b) => (a.name === PARENT_COMPANY ? -1 : b.name === PARENT_COMPANY ? 1 : b.kg - a.kg));
  }, [data]);

  const categories = useMemo(() => {
    const names = new Set<string>();
    for (const i of data?.items ?? []) if (i.category) names.add(i.category);
    return [...names].sort((a, b) => a.localeCompare(b, 'fa'));
  }, [data]);

  const items = useMemo(() => {
    const q = search.trim();
    const list = (data?.items ?? []).filter((i) => {
      if (q && !i.name.includes(q)) return false;
      if (categoryFilter !== 'all' && (i.category || '') !== categoryFilter) return false;
      if (companyFilter.length) {
        const supplier = i.supplier || PARENT_COMPANY;
        if (!companyFilter.includes(supplier)) return false;
      }
      return true;
    });
    const key: Record<SortKey, (i: InventoryItem) => number> = {
      stock: (i) => i.stockKg,
      value: (i) => i.stockValue,
      sold: (i) => i.soldKg,
      profit: (i) => i.profit,
    };
    return [...list].sort((a, b) => key[sort](b) - key[sort](a));
  }, [data, search, sort, companyFilter, categoryFilter]);

  const t = useMemo(() => {
    if (!data) return undefined;
    const sum = (k: keyof InventoryItem) => items.reduce((s, i) => s + (Number(i[k]) || 0), 0);
    const stockKg = sum('stockKg');
    const stockValue = sum('stockValue');
    const soldRevenue = sum('soldRevenue');
    const soldCost = sum('soldCost');
    const profit = soldRevenue - soldCost;
    const soldKg = sum('soldKg');
    const currentValue = {
      wholesale: items.reduce((s, i) => s + (i.currentValue?.wholesale || 0), 0),
      supermarket: items.reduce((s, i) => s + (i.currentValue?.supermarket || 0), 0),
      retail: items.reduce((s, i) => s + (i.currentValue?.retail || 0), 0),
    };
    return {
      ...data.totals,
      stockKg,
      stockValue,
      purchasedKg: sum('purchasedKg'),
      purchasedAmount: sum('purchasedAmount'),
      soldKg,
      soldRevenue,
      soldCost,
      profit,
      marginPercent: soldRevenue ? (profit / soldRevenue) * 100 : 0,
      profitPerKg: soldKg ? profit / soldKg : 0,
      currentValue,
    };
  }, [data, items]);
  const inStock = items.filter((i) => i.stockKg > 0).length;
  const tonGaps = useMemo(() => {
    return (data?.items ?? [])
      .map((i) => {
        const invoice = (i.purchasedInvoiceKg || 0) + (i.soldInvoiceKg || 0);
        const catalog = (i.purchasedCatalogKg || 0) + (i.soldCatalogKg || 0);
        return { id: i.productId, name: i.name, invoice, catalog };
      })
      .filter((g) => g.invoice > 0 && g.catalog > 0 && Math.abs(g.invoice - g.catalog) > Math.max(50, Math.max(g.invoice, g.catalog) * 0.08))
      .sort((a, b) => Math.abs(b.invoice - b.catalog) - Math.abs(a.invoice - a.catalog))
      .slice(0, 8);
  }, [data]);
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
          {!data && !error && <ListSkeleton rows={5} />}

          {data && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-bold text-slate-500 px-0.5">انبارها</p>
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                <button
                  type="button"
                  onClick={() => setCompanyFilter([])}
                  className={`shrink-0 min-w-[132px] rounded-2xl px-3 py-2.5 text-right ${
                    companyFilter.length === 0 ? 'bg-sky-600 text-white shadow-md shadow-sky-600/20' : 'bg-white text-slate-800 border border-slate-200'
                  }`}
                >
                  <span className="block text-[12px] font-bold">همه انبارها</span>
                  <span className={`block text-[10px] mt-0.5 ${companyFilter.length === 0 ? 'text-sky-100' : 'text-slate-400'}`}>
                    {weight(houses.reduce((s, h) => s + h.kg, 0))} · {num(houses.length)} شرکت
                  </span>
                </button>
                {houses.map((house) => {
                  const on = companyFilter.length === 1 && companyFilter[0] === house.name;
                  return (
                    <button
                      key={house.name}
                      type="button"
                      onClick={() => setCompanyFilter([house.name])}
                      className={`shrink-0 min-w-[148px] rounded-2xl px-3 py-2.5 text-right ${
                        on ? 'bg-sky-600 text-white shadow-md shadow-sky-600/20' : 'bg-white text-slate-800 border border-slate-200'
                      }`}
                    >
                      <span className="block text-[12px] font-bold truncate max-w-[160px]">{house.name}</span>
                      <span className={`block text-[10px] mt-0.5 ${on ? 'text-sky-100' : 'text-slate-400'}`}>
                        {weight(house.kg)} · {num(house.count)} کالا
                      </span>
                      <span className={`block text-[10px] font-mono mt-0.5 ${on ? 'text-white' : 'text-slate-600'}`}>
                        {formatToman(house.current || house.cost)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Stock on hand */}
          <div className="rounded-2xl p-4 text-white bg-gradient-to-br from-sky-600 to-indigo-700 shadow-xl shadow-sky-700/20">
            <div className="flex items-center gap-2 text-sky-100 text-xs">
              <Weight className="w-4 h-4" />
              تناژ موجود {companyFilter.length === 1 ? companyFilter[0] : 'انبار'} (همین الان)
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
            {isAdmin && (
              <button
                type="button"
                onClick={() => navigate('/stocktake')}
                className="mt-2 w-full py-2 rounded-xl bg-white text-sky-800 text-[11px] font-bold"
              >
                انبارگردانی قدم‌به‌قدم
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

          {tonGaps.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-[11px] text-amber-900 leading-6">
              <b>تناژ فاکتور با وزن کاتالوگ یکی نیست</b>
              <p className="mt-1 text-amber-800">
                جمع خرید و فروش از وزن خود فاکتور حساب می‌شود وقتی از تعداد × وزن بسته بزرگ‌تر باشد. نگهبان سود همین اختلاف را فاکتور به فاکتور نشان می‌دهد.
              </p>
              <div className="mt-2 space-y-1">
                {tonGaps.map((g) => (
                  <div key={g.id} className="flex items-center justify-between gap-2 font-mono">
                    <span className="font-sans font-bold truncate">{g.name}</span>
                    <span className="shrink-0">فاکتور {tons(g.invoice)} تن · کاتالوگ {tons(g.catalog)} تن</span>
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

          {allTime && companyFilter.length === 0 && t && t.differenceKg !== null && Math.abs(t.differenceKg) >= 0.05 && (
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
              <button
                type="button"
                onClick={() => setCategoryFilter('all')}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap ${
                  categoryFilter === 'all' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 border border-slate-200'
                }`}
              >
                همه دسته‌ها
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap ${
                    categoryFilter === cat ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 border border-slate-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
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
              {[i.supplier || PARENT_COMPANY, i.category, i.weightPerUnitKg ? `هر ${i.unit || 'واحد'} ${num(i.weightPerUnitKg, 2)} کیلو` : i.unit]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <div className="text-left shrink-0">
            <div className={`text-sm font-bold font-mono ${i.stockKg < 0 ? 'text-rose-600' : 'text-slate-800'}`}>
              {formatStock(i.stockUnits, { unit: i.unit, weightPerUnitKg: i.weightPerUnitKg })}
            </div>
            <div className="text-[10px] text-slate-400 font-mono">{formatToman(i.stockValue)}</div>
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
                    <div className="text-[10px] text-slate-400 font-mono">{l.invoiceNumber}{l.supplier ? ` · ${l.supplier}` : ''}</div>
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
