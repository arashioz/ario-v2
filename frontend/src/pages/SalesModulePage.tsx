import React, { useEffect, useMemo, useState } from 'react';
import { IonContent, IonPage, IonRefresher, IonRefresherContent } from '@ionic/react';
import { useNavigate } from 'react-router-dom';
import { Building2, ChevronLeft, Package, TrendingUp, Wallet } from 'lucide-react';
import { accountingService } from '../services/accounting.service';
import type { SalesBoard, SalesBoardCompany, SalesBoardProduct } from '../services/accounting.service';
import { PeriodPicker, periodPresets, periodQuery } from '../components/ui/PeriodPicker';
import type { Period } from '../components/ui/PeriodPicker';
import { ReportHeader, Segments } from '../components/reports/ReportUI';
import { ListSkeleton } from '../components/ui/Skeleton';
import { formatToman, percent, searchKey, weight } from '../lib/format';

type View = 'summary' | 'companies' | 'products';

const Row: React.FC<{ label: string; value: string; sub?: string; tone?: string }> = ({ label, value, sub, tone }) => (
  <div className="flex items-center justify-between gap-3 px-4 py-3">
    <span className="text-[13px] text-slate-500">{label}</span>
    <span className="text-left">
      <span className={`block text-[15px] font-bold font-mono ${tone || 'text-slate-900'}`}>{value}</span>
      {sub && <span className="block text-[11px] text-slate-400 font-mono mt-0.5">{sub}</span>}
    </span>
  </div>
);

const CompanyCard: React.FC<{ row: SalesBoardCompany }> = ({ row }) => {
  const [open, setOpen] = useState(false);
  return (
    <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full px-3.5 py-3 text-right">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 min-w-0">
            <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
            <span className="text-[13px] font-bold text-slate-800 truncate">{row.name}</span>
          </span>
          <span className={`text-[13px] font-bold font-mono shrink-0 ${row.profit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{formatToman(row.profit)}</span>
        </div>
        <div className="mt-1.5 text-[11px] text-slate-400 font-mono">
          خرید {weight(row.purchasedKg)} · فروش {weight(row.soldKg)} · {percent(row.marginPercent)}
        </div>
      </button>
      {open && (
        <div className="border-t border-slate-100 divide-y divide-slate-100">
          <Row label="خرید از این شرکت" value={formatToman(row.purchasedAmount)} sub={weight(row.purchasedKg)} />
          <Row label="فروش کالاهای این شرکت" value={formatToman(row.soldAmount)} sub={weight(row.soldKg)} />
          <Row label="سود فروش" value={formatToman(row.profit)} tone={row.profit >= 0 ? 'text-emerald-700' : 'text-rose-700'} sub={percent(row.marginPercent)} />
          <Row label="الان در انبار" value={formatToman(row.stockValue)} sub={weight(row.stockKg)} />
        </div>
      )}
    </section>
  );
};

const ProductRow: React.FC<{ item: SalesBoardProduct; onOpen: () => void }> = ({ item, onOpen }) => (
  <button type="button" onClick={onOpen} className="w-full bg-white rounded-2xl border border-slate-100 shadow-sm px-3.5 py-3 flex items-center justify-between gap-3 text-right active:bg-slate-50">
    <span className="min-w-0">
      <span className="block text-[14px] font-bold text-slate-800 truncate">{item.name}</span>
      <span className="block text-[11px] text-slate-400 mt-0.5 truncate">
        {item.company} · انبار {weight(item.stockKg)}
        {item.soldKg > 0 ? ` · فروش ${weight(item.soldKg)}` : ''}
      </span>
    </span>
    <span className="flex items-center gap-1 shrink-0">
      <span className={`text-[12px] font-bold font-mono ${item.profit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
        {item.soldAmount > 0 ? formatToman(item.profit) : '—'}
      </span>
      <ChevronLeft className="w-4 h-4 text-slate-300" />
    </span>
  </button>
);

export const SalesModulePage: React.FC = () => {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<Period>(() => periodPresets()[0]);
  const [view, setView] = useState<View>('summary');
  const [board, setBoard] = useState<SalesBoard | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  const load = async (next = period) => {
    try {
      setError('');
      setBoard(await accountingService.salesBoard(periodQuery(next)));
    } catch {
      setError('گزارش فروش بارگذاری نشد.');
    }
  };

  useEffect(() => {
    load(period);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const products = useMemo(() => {
    const q = searchKey(query);
    return (board?.products || []).filter((item) => !q || searchKey(`${item.name} ${item.company}`).includes(q));
  }, [board, query]);

  const t = board?.totals;

  return (
    <IonPage>
      <ReportHeader title="ماژول فروش" subtitle="خرید، فروش، انبار و سود" right={<PeriodPicker value={period} onChange={setPeriod} />} />
      <IonContent fullscreen className="bg-slate-50">
        <IonRefresher slot="fixed" onIonRefresh={(e) => load().finally(() => e.detail.complete())}>
          <IonRefresherContent />
        </IonRefresher>
        <div className="p-3 space-y-3 max-w-lg mx-auto pb-10">
          <Segments<View>
            value={view}
            onChange={setView}
            items={[
              ['summary', 'جمع'],
              ['companies', 'شرکت‌ها'],
              ['products', 'محصولات'],
            ]}
          />
          {error && <div className="text-xs text-rose-700 bg-rose-50 rounded-2xl p-3">{error}</div>}
          {!board && !error && <ListSkeleton />}

          {board && view === 'summary' && t && (
            <>
              <section className="bg-white rounded-3xl border border-slate-100 shadow-sm divide-y divide-slate-100">
                <Row label="خرید کلی" value={formatToman(t.purchasedAmount)} sub={weight(t.purchasedKg)} />
                <Row label="فروش کلی" value={formatToman(t.soldAmount)} sub={weight(t.soldKg)} />
                <Row label="موجودی انبار، همین حالا" value={formatToman(t.stockValue)} sub={weight(t.stockKg)} />
                <Row label="سود کلی" value={formatToman(t.profit)} tone={t.profit >= 0 ? 'text-emerald-700' : 'text-rose-700'} sub={`${percent(t.marginPercent)} · هر کیلو ${formatToman(t.profitPerKg)}`} />
              </section>
              <p className="text-[11px] text-slate-400 leading-5 px-1">
                موجودی، بارِ داخل انبار در این لحظه است و با عوض کردن بازه تغییر نمی‌کند. خرید، فروش و سود مال همان بازه‌ای است که بالا انتخاب کرده‌اید.
              </p>
              <div className="grid grid-cols-3 gap-2">
                {([
                  [Wallet, 'خرید', weight(t.purchasedKg), 'text-amber-700 bg-amber-50'],
                  [TrendingUp, 'فروش', weight(t.soldKg), 'text-sky-700 bg-sky-50'],
                  [Package, 'انبار', weight(t.stockKg), 'text-slate-700 bg-slate-100'],
                ] as const).map(([Icon, label, value, tone]) => (
                  <div key={label} className="bg-white rounded-2xl border border-slate-100 p-3">
                    <span className={`w-7 h-7 rounded-xl flex items-center justify-center ${tone}`}><Icon className="w-3.5 h-3.5" /></span>
                    <div className="text-[11px] text-slate-400 mt-2">{label}</div>
                    <div className="text-[13px] font-bold font-mono text-slate-800 mt-0.5">{value}</div>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => setView('products')} className="w-full bg-white rounded-2xl border border-slate-100 px-3.5 py-3 flex items-center justify-between text-right">
                <span>
                  <span className="block text-[13px] font-bold text-slate-800">لیست محصولات</span>
                  <span className="block text-[11px] text-slate-400 mt-0.5">هر کالا صفحه جدا با نمودار خودش</span>
                </span>
                <ChevronLeft className="w-4 h-4 text-slate-300" />
              </button>
              <button type="button" onClick={() => navigate('/profit')} className="w-full bg-white rounded-2xl border border-slate-100 px-3.5 py-3 flex items-center justify-between text-right">
                <span>
                  <span className="block text-[13px] font-bold text-slate-800">ریز سود هر بار خرید</span>
                  <span className="block text-[11px] text-slate-400 mt-0.5">جزئیات فاکتور و FIFO</span>
                </span>
                <ChevronLeft className="w-4 h-4 text-slate-300" />
              </button>
            </>
          )}

          {board && view === 'companies' && (
            <div className="space-y-2">
              <p className="text-[11px] text-slate-400 leading-5 px-1">سود، از فروش کالاهای همان شرکت است. خرید، فاکتورهای خرید از همان شرکت است.</p>
              {board.companies.length === 0 ? (
                <div className="bg-white rounded-2xl p-6 text-center text-xs text-slate-400">در این بازه خریدی ثبت نشده.</div>
              ) : board.companies.map((row) => <CompanyCard key={row.name} row={row} />)}
            </div>
          )}

          {board && view === 'products' && (
            <div className="space-y-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="جستجوی نام کالا یا شرکت"
                className="w-full px-3 py-2.5 rounded-2xl border border-slate-200 bg-white text-xs"
              />
              <p className="text-[11px] text-slate-400 leading-5 px-1">هر کالا را بزنید. اعداد، میانگین قیمت، نمودار، لیست خریدها و فروش‌ها در صفحه خودش باز می‌شود.</p>
              {products.length === 0 ? (
                <div className="bg-white rounded-2xl p-6 text-center text-xs text-slate-400">کالایی پیدا نشد.</div>
              ) : products.map((item) => (
                <ProductRow key={item.productId} item={item} onOpen={() => navigate(`/sales/product/${encodeURIComponent(item.productId)}`)} />
              ))}
            </div>
          )}
        </div>
      </IonContent>
    </IonPage>
  );
};
