import React, { useEffect, useMemo, useState } from 'react';
import { IonContent, IonPage, IonRefresher, IonRefresherContent } from '@ionic/react';
import { useNavigate } from 'react-router-dom';
import { Building2, Check, ChevronLeft, Settings2, TrendingUp, Wallet } from 'lucide-react';
import { accountingService } from '../services/accounting.service';
import type { SalesBoard, SalesBoardCompany, SalesBoardInvoice, SalesBoardProduct } from '../services/accounting.service';
import { settingsService, useSettings } from '../services/settings.service';
import { PeriodPicker, periodPresets, periodQuery } from '../components/ui/PeriodPicker';
import type { Period } from '../components/ui/PeriodPicker';
import { ReportHeader, Segments } from '../components/reports/ReportUI';
import { useInvoiceOpener } from '../components/reports/useInvoiceOpener';
import { ListSkeleton } from '../components/ui/Skeleton';
import { useNotification } from '../context/NotificationContext';
import { formatJalaliIso } from '../lib/jalali';
import { formatToman, percent, profitCaption, profitColor, searchKey, weight } from '../lib/format';

type View = 'summary' | 'companies' | 'invoices' | 'products' | 'settings';

const Row: React.FC<{ label: string; value: string; sub?: string; tone?: string }> = ({ label, value, sub, tone }) => (
  <div className="flex items-center justify-between gap-3 px-4 py-3">
    <span className="text-[13px] text-slate-500">{label}</span>
    <span className="text-left">
      <span className={`block text-[15px] font-bold font-mono ${tone || 'text-slate-900'}`}>{value}</span>
      {sub && <span className="block text-[11px] text-slate-400 font-mono mt-0.5">{sub}</span>}
    </span>
  </div>
);

const CompanyCard: React.FC<{ row: SalesBoardCompany; featured?: boolean }> = ({ row, featured }) => {
  const [open, setOpen] = useState(featured);
  return (
    <section className={`rounded-2xl border shadow-sm overflow-hidden ${featured ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-100'}`}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full px-3.5 py-3 text-right">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 min-w-0">
            <Building2 className={`w-4 h-4 shrink-0 ${featured ? 'text-emerald-700' : 'text-slate-400'}`} />
            <span className="min-w-0">
              <span className="block text-[13px] font-bold text-slate-800 truncate">{row.name}</span>
              {featured && <span className="block text-[10px] text-emerald-700 mt-0.5">شرکت پیش‌فرض</span>}
            </span>
          </span>
          <span className={`text-[13px] font-bold font-mono shrink-0 ${profitColor(row.profit)}`}>
            {profitCaption(row.profit, { sold: row.soldAmount, unknown: row.unknownSold })}
          </span>
        </div>
        <div className="mt-1.5 text-[11px] text-slate-500 font-mono">
          خرید {weight(row.purchasedKg)} · فروش {weight(row.soldKg)} · {percent(row.marginPercent)}
        </div>
      </button>
      {open && (
        <div className="border-t border-emerald-100/80 divide-y divide-slate-100 bg-white">
          <Row label="خرید از این شرکت" value={formatToman(row.purchasedAmount)} sub={weight(row.purchasedKg)} />
          <Row label="فروش کالاهای این شرکت" value={formatToman(row.soldAmount)} sub={weight(row.soldKg)} />
          <Row
            label="سود فروش"
            value={profitCaption(row.profit, { sold: row.soldAmount, unknown: row.unknownSold })}
            tone={profitColor(row.profit)}
            sub={(row.unknownSold || 0) > 0 ? 'بهای کارخانه بعضی فروش‌ها ثبت نشده' : percent(row.marginPercent)}
          />
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
      <span className={`text-[12px] font-bold font-mono ${item.soldAmount > 0 ? profitColor(item.profit) : 'text-slate-400'}`}>
        {item.soldAmount > 0 ? profitCaption(item.profit, { sold: item.soldAmount, unknown: item.unknownSold }) : '—'}
      </span>
      <ChevronLeft className="w-4 h-4 text-slate-300" />
    </span>
  </button>
);

const InvoiceRow: React.FC<{ row: SalesBoardInvoice; onOpen: (id: string) => void }> = ({ row, onOpen }) => (
  <button type="button" onClick={() => onOpen(row.invoiceId)} className="w-full bg-white rounded-2xl border border-slate-100 px-3.5 py-3 text-right active:bg-slate-50">
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <div className="text-[13px] font-bold text-slate-800 truncate">{row.customerName}</div>
        <div className="text-[11px] text-slate-400 mt-0.5 font-mono">
          {row.invoiceNumber} · {formatJalaliIso(row.date)}
          {row.fulfillment === 'factory' ? ' · کارخانه' : ''}
        </div>
      </div>
      <div className={`text-[13px] font-bold font-mono shrink-0 ${profitColor(row.profit)}`}>
        {profitCaption(row.profit, { sold: row.revenue, unknown: row.unknownSold })}
      </div>
    </div>
    <div className="mt-1 text-[11px] text-slate-400 font-mono">
      فروش {formatToman(row.revenue)} · {weight(row.kg)}
    </div>
  </button>
);

export const SalesModulePage: React.FC = () => {
  const navigate = useNavigate();
  const settings = useSettings();
  const { showNotification } = useNotification();
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

  const { open: openInvoice, modal } = useInvoiceOpener(() => load(period));

  const products = useMemo(() => {
    const q = searchKey(query);
    return (board?.products || []).filter((item) => !q || searchKey(`${item.name} ${item.company}`).includes(q));
  }, [board, query]);

  const t = board?.totals;
  const focusName = settings.salesFocusCompany || '';
  const focus = board?.companies.find((row) => row.name === focusName) || null;
  const rest = (board?.companies || []).filter((row) => row.name !== focusName);
  const invoices = board?.invoices || [];

  const pickCompany = async (name: string) => {
    try {
      await settingsService.update({ salesFocusCompany: name === focusName ? '' : name });
    } catch {
      showNotification({ title: 'ذخیره نشد', message: 'شرکت پیش‌فرض ماژول فروش ذخیره نشد.', type: 'error' });
    }
  };

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
              ['invoices', 'فاکتورها'],
              ['products', 'محصولات'],
              ['settings', 'تنظیمات'],
            ]}
          />
          {error && <div className="text-xs text-rose-700 bg-rose-50 rounded-2xl p-3">{error}</div>}
          {!board && !error && view !== 'settings' && <ListSkeleton />}

          {board && view === 'summary' && t && (
            <>
              <section className="bg-white rounded-3xl border border-slate-100 shadow-sm divide-y divide-slate-100">
                <Row label="خرید کلی" value={formatToman(t.purchasedAmount)} sub={weight(t.purchasedKg)} />
                <Row label="فروش کلی" value={formatToman(t.soldAmount)} sub={weight(t.soldKg)} />
                <Row label="موجودی انبار، همین حالا" value={formatToman(t.stockValue)} sub={weight(t.stockKg)} />
                <Row
                  label="سود کلی"
                  value={profitCaption(t.profit, { sold: t.soldAmount, unknown: t.unknownSold })}
                  tone={profitColor(t.profit)}
                  sub={(t.unknownSold || 0) > 0 ? `فروش ${formatToman(t.soldAmount)} · بهای ${formatToman(t.unknownSold)} ثبت نشده` : `${percent(t.marginPercent)} · هر کیلو ${formatToman(t.profitPerKg)}`}
                />
              </section>
              {focus ? (
                <CompanyCard row={focus} featured />
              ) : (
                <button type="button" onClick={() => setView('settings')} className="w-full bg-white rounded-2xl border border-dashed border-slate-200 px-3.5 py-3 text-right">
                  <span className="flex items-center gap-2 text-[13px] font-bold text-slate-800">
                    <Settings2 className="w-4 h-4 text-slate-400" />
                    شرکت پیش‌فرض را انتخاب کنید
                  </span>
                  <span className="block text-[11px] text-slate-400 mt-0.5">سود همان شرکت جدا از جمع کل نشان داده می‌شود</span>
                </button>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white rounded-2xl border border-slate-100 p-3">
                  <span className="w-7 h-7 rounded-xl flex items-center justify-center text-sky-700 bg-sky-50"><TrendingUp className="w-3.5 h-3.5" /></span>
                  <div className="text-[11px] text-slate-400 mt-2">فروش، بدون سود</div>
                  <div className="text-[13px] font-bold font-mono text-slate-800 mt-0.5">{formatToman(t.soldAmount)}</div>
                  <div className="text-[10px] text-slate-400 font-mono mt-0.5">{weight(t.soldKg)}</div>
                </div>
                <div className="bg-white rounded-2xl border border-slate-100 p-3">
                  <span className="w-7 h-7 rounded-xl flex items-center justify-center text-emerald-700 bg-emerald-50"><Wallet className="w-3.5 h-3.5" /></span>
                  <div className="text-[11px] text-slate-400 mt-2">سود همین فروش</div>
                  <div className={`text-[13px] font-bold font-mono mt-0.5 ${profitColor(t.profit)}`}>{profitCaption(t.profit, { sold: t.soldAmount, unknown: t.unknownSold })}</div>
                  <div className="text-[10px] text-slate-400 font-mono mt-0.5">{percent(t.marginPercent)}</div>
                </div>
              </div>
              <section className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <h2 className="text-[12px] font-bold text-slate-600">سود همه شرکت‌ها</h2>
                  <button type="button" onClick={() => setView('companies')} className="text-[11px] font-bold text-sky-700">همه</button>
                </div>
                {rest.length === 0 && !focus ? (
                  <div className="bg-white rounded-2xl p-5 text-center text-xs text-slate-400">شرکتی در این بازه نیست.</div>
                ) : rest.slice(0, 8).map((row) => (
                  <button key={row.name} type="button" onClick={() => setView('companies')} className="w-full bg-white rounded-2xl border border-slate-100 px-3.5 py-2.5 flex items-center justify-between gap-2 text-right">
                    <span className="text-[12px] font-bold text-slate-800 truncate">{row.name}</span>
                    <span className={`text-[12px] font-bold font-mono shrink-0 ${profitColor(row.profit)}`}>
                      {profitCaption(row.profit, { sold: row.soldAmount, unknown: row.unknownSold })}
                    </span>
                  </button>
                ))}
              </section>
              <section className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <h2 className="text-[12px] font-bold text-slate-600">سود فاکتورها</h2>
                  <button type="button" onClick={() => setView('invoices')} className="text-[11px] font-bold text-sky-700">همه</button>
                </div>
                {invoices.length === 0 ? (
                  <div className="bg-white rounded-2xl p-5 text-center text-xs text-slate-400">فروشی در این بازه نیست.</div>
                ) : invoices.slice(0, 6).map((row) => <InvoiceRow key={row.invoiceId} row={row} onOpen={openInvoice} />)}
              </section>
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
              <p className="text-[11px] text-slate-400 leading-5 px-1">سود، از فروش کالاهای همان شرکت است. خرید، فاکتورهای خرید از همان شرکت است. شرکت پیش‌فرض را از تنظیمات همین ماژول عوض کنید.</p>
              {focus && <CompanyCard row={focus} featured />}
              {rest.length === 0 && !focus ? (
                <div className="bg-white rounded-2xl p-6 text-center text-xs text-slate-400">در این بازه خریدی ثبت نشده.</div>
              ) : rest.map((row) => <CompanyCard key={row.name} row={row} />)}
            </div>
          )}

          {board && view === 'invoices' && (
            <div className="space-y-2">
              <p className="text-[11px] text-slate-400 leading-5 px-1">سود هر فاکتور فروش در همین بازه، از بهای همان بارها.</p>
              {invoices.length === 0 ? (
                <div className="bg-white rounded-2xl p-6 text-center text-xs text-slate-400">فروشی در این بازه نیست.</div>
              ) : invoices.map((row) => <InvoiceRow key={row.invoiceId} row={row} onOpen={openInvoice} />)}
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

          {view === 'settings' && (
            <section className="bg-white rounded-3xl border border-slate-100 shadow-sm p-4 space-y-3">
              <div>
                <h2 className="text-[14px] font-bold text-slate-800">شرکت پیش‌فرض ماژول فروش</h2>
                <p className="text-[11px] text-slate-500 mt-1 leading-5">
                  سود کلی همیشه برای همه شرکت‌ها هست. شرکتی که اینجا انتخاب شود، جدا و پررنگ نشان داده می‌شود؛ بقیه هم در لیست می‌مانند.
                </p>
              </div>
              {(board?.companies || []).length === 0 ? (
                <p className="text-[12px] text-slate-400">هنوز شرکتی در گزارش نیست.</p>
              ) : (board?.companies || []).map((row) => {
                const on = row.name === focusName;
                return (
                  <button
                    key={row.name}
                    type="button"
                    onClick={() => void pickCompany(row.name)}
                    className={`w-full flex items-center justify-between gap-2 rounded-2xl px-3.5 py-3 text-right border ${on ? 'border-emerald-300 bg-emerald-50' : 'border-slate-100 bg-slate-50'}`}
                  >
                    <span className="min-w-0">
                      <span className="block text-[13px] font-bold text-slate-800 truncate">{row.name}</span>
                      <span className={`block text-[11px] font-mono mt-0.5 ${profitColor(row.profit)}`}>
                        {profitCaption(row.profit, { sold: row.soldAmount, unknown: row.unknownSold })}
                      </span>
                    </span>
                    {on && <Check className="w-4 h-4 text-emerald-700 shrink-0" />}
                  </button>
                );
              })}
            </section>
          )}
        </div>
        {modal}
      </IonContent>
    </IonPage>
  );
};
