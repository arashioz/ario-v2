import React, { useState, useEffect, useMemo } from 'react';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonContent,
  IonRefresher,
  IonRefresherContent,
} from '@ionic/react';
import {
  FileText,
  Search,
  RefreshCw,
  Plus,
  PackagePlus,
  LayoutGrid,
  List,
  Table2,
  ChartColumn,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { InvoiceList } from '../../components/invoices/InvoiceList';
import { PendingProformasBanner } from '../../components/proformas/PendingProformasBanner';
import { useSettings, type SalesLayout } from '../../services/settings.service';
import { useNavigate } from 'react-router-dom';
import { invoicesService } from '../../services/invoices.service';
import type { Invoice } from '../../services/invoices.service';
import { useNotification } from '../../context/NotificationContext';
import { InvoiceDetailModal } from '../../components/invoices/InvoiceDetailModal';
import { NewPurchaseInvoiceModal } from '../../components/invoices/NewPurchaseInvoiceModal';
import { PurchasePriceSheet } from '../../components/pricing/PurchasePriceSheet';
import {
  InvoiceFilterSheet,
  DEFAULT_INVOICE_FILTERS,
  activeInvoiceFilters,
  applyInvoiceFilters,
  type InvoiceFilters,
} from '../../components/invoices/InvoiceFilterSheet';
import { PeriodPicker, periodPresets } from '../../components/ui/PeriodPicker';
import type { Period } from '../../components/ui/PeriodPicker';
import { formatToman, num, weight } from '../../lib/format';
import { dateToYmd } from '../../lib/jalali';

const QUICK: { id: string; label: string; patch: Partial<InvoiceFilters>; match: (f: InvoiceFilters) => boolean }[] = [
  { id: 'all', label: 'همه', patch: { type: 'all', status: 'all', source: 'all' }, match: (f) => f.type === 'all' && f.status === 'all' && f.source === 'all' },
  { id: 'sale', label: 'فروش', patch: { type: 'sale', status: 'all', source: 'shop' }, match: (f) => f.type === 'sale' && f.status === 'all' && f.source === 'shop' },
  { id: 'purchase', label: 'خرید', patch: { type: 'purchase', saleType: 'all', status: 'all', source: 'shop' }, match: (f) => f.type === 'purchase' && f.status === 'all' && f.source === 'shop' },
  { id: 'credit', label: 'نسیه', patch: { type: 'all', status: 'credit', source: 'all' }, match: (f) => f.type === 'all' && f.status === 'credit' && f.source === 'all' },
  { id: 'factory', label: 'از کارخانه', patch: { type: 'sale', status: 'all', source: 'factory' }, match: (f) => f.source === 'factory' },
];

export const InvoicesTab: React.FC = () => {
  const navigate = useNavigate();
  const { showNotification } = useNotification();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<InvoiceFilters>(DEFAULT_INVOICE_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [showTurnover, setShowTurnover] = useState(() => localStorage.getItem('ario.invoiceTurnover') === '1');
  const [period, setPeriod] = useState<Period>(() => periodPresets()[0]);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [priceSheetInvoiceId, setPriceSheetInvoiceId] = useState<string | null>(null);
  const settings = useSettings();
  const [layoutOverride, setLayout] = useState<SalesLayout | null>(
    () => (localStorage.getItem('ario.salesLayout') as SalesLayout | null) || null,
  );
  const baseView = { ...settings.salesView, layout: layoutOverride ?? settings.salesView.layout };
  // Day headings only make sense while the list is in date order.
  const view = filters.sort === 'amount' ? { ...baseView, groupByDay: false } : baseView;

  useEffect(() => {
    if (layoutOverride) localStorage.setItem('ario.salesLayout', layoutOverride);
  }, [layoutOverride]);

  useEffect(() => {
    localStorage.setItem('ario.invoiceTurnover', showTurnover ? '1' : '0');
  }, [showTurnover]);

  const loadInvoices = async () => {
    try {
      setLoading(true);
      const data = await invoicesService.getAll();
      setInvoices(data);
    } catch (err: any) {
      showNotification({
        title: 'خطا در بارگذاری فاکتورها',
        message: 'امکان اتصال به سرور وجود ندارد.',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvoices();
  }, []);

  const handleRefresh = async (event: CustomEvent) => {
    await loadInvoices();
    event.detail.complete();
  };

  const filteredInvoices = useMemo(() => {
    const inPeriod =
      period.from || period.to
        ? invoices.filter((inv) => {
            const day = dateToYmd(new Date(inv.invoiceDate || inv.createdAt));
            if (period.from && day < period.from) return false;
            if (period.to && day > period.to) return false;
            return true;
          })
        : invoices;
    const s = search.trim().toLowerCase();
    const searched = s
      ? inPeriod.filter(
          (inv) =>
            inv.invoiceNumber.toLowerCase().includes(s) ||
            inv.customerName.toLowerCase().includes(s) ||
            !!inv.customerPhone?.includes(s) ||
            inv.items.some((it) => it.productName.toLowerCase().includes(s)),
        )
      : inPeriod;
    return applyInvoiceFilters(searched, filters);
  }, [invoices, period, search, filters]);

  const turnover = useMemo(() => {
    let sales = 0;
    let purchases = 0;
    let credit = 0;
    let kg = 0;
    for (const inv of filteredInvoices) {
      if (inv.type === 'purchase') purchases += inv.finalAmount || 0;
      else {
        sales += inv.finalAmount || 0;
        credit += inv.remainingDebt || 0;
      }
      kg += inv.totalWeightKg || 0;
    }
    return { sales, purchases, credit, kg };
  }, [filteredInvoices]);

  const chips = activeInvoiceFilters(filters);
  const extraFilters = chips.filter((c) => c.key !== 'type' && !(c.key === 'status' && filters.status === 'credit' && filters.type === 'all'));

  return (
    <IonPage>
      <IonHeader className="ion-no-border">
        <IonToolbar className="bg-white/95 backdrop-blur-md px-4 py-2 border-b border-sky-100">
          <div className="flex items-center justify-between">
            <h1 className="text-sm font-semibold text-slate-800">فاکتورها</h1>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setShowTurnover((v) => !v)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-2xl text-[11px] font-bold transition active:scale-95 ${
                  showTurnover ? 'bg-sky-600 text-white' : 'bg-sky-50 text-sky-700'
                }`}
                aria-pressed={showTurnover}
              >
                <ChartColumn className="w-4 h-4" />
                گردش
              </button>
              <button
                onClick={loadInvoices}
                className="p-2 rounded-2xl bg-sky-50 text-sky-600 hover:bg-sky-100 transition active:scale-95"
                title="تازه‌سازی"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </IonToolbar>
      </IonHeader>

      <IonContent fullscreen className="bg-slate-50">
        <IonRefresher slot="fixed" onIonRefresh={handleRefresh}>
          <IonRefresherContent />
        </IonRefresher>

        <div className="p-3.5 space-y-4 max-w-md mx-auto pb-8">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="جستجوی فاکتور فروش و خرید…"
              className="w-full h-11 pl-10 pr-10 text-sm rounded-2xl bg-white border border-sky-100 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition text-slate-800 shadow-sm"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                aria-label="پاک کردن جستجو"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <PendingProformasBanner refreshKey={invoices} />

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => navigate('/tabs/pos')}
              className="flex items-center justify-center gap-1.5 py-3 rounded-2xl bg-sky-600 text-white text-sm font-bold shadow-md shadow-sky-500/20 active:scale-[0.98] transition"
            >
              <Plus className="w-4 h-4" />
              فاکتور فروش
            </button>
            <button
              onClick={() => setIsPurchaseModalOpen(true)}
              className="flex items-center justify-center gap-1.5 py-3 rounded-2xl bg-emerald-600 text-white text-sm font-bold shadow-md shadow-emerald-500/20 active:scale-[0.98] transition"
            >
              <PackagePlus className="w-4 h-4" />
              ثبت خرید
            </button>
          </div>

          {showTurnover && (
            <div className="bg-white rounded-2xl border border-sky-100 p-2.5 grid grid-cols-2 gap-x-3 gap-y-2 animate-slide-up">
              <div>
                <div className="text-[10px] text-slate-400">فروش</div>
                <div className="text-xs font-bold text-sky-700">{formatToman(turnover.sales)}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400">خرید</div>
                <div className="text-xs font-bold text-emerald-700">{formatToman(turnover.purchases)}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400">مانده نسیه</div>
                <div className="text-xs font-bold text-rose-600">{formatToman(turnover.credit)}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400">
                  {num(filteredInvoices.length)} فاکتور
                </div>
                <div className="text-xs font-bold text-slate-700">{weight(turnover.kg)}</div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setFilterOpen(true)}
              className={`relative shrink-0 px-3 py-1.5 rounded-xl border flex items-center gap-1 text-xs font-bold transition active:scale-95 ${
                extraFilters.length ? 'bg-sky-600 border-sky-600 text-white' : 'bg-white border-slate-200 text-slate-600'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              فیلتر
              {extraFilters.length > 0 && (
                <span className="absolute -top-1.5 -left-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] flex items-center justify-center">
                  {num(extraFilters.length)}
                </span>
              )}
            </button>
            {QUICK.map((q) => {
              const active = q.match(filters);
              return (
                <button
                  key={q.id}
                  onClick={() => setFilters((f) => ({ ...f, ...q.patch }))}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition whitespace-nowrap ${
                    active
                      ? q.id === 'credit'
                        ? 'bg-rose-600 text-white'
                        : q.id === 'purchase'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-sky-600 text-white'
                      : 'bg-white text-slate-600 border border-slate-200'
                  }`}
                >
                  {q.label}
                </button>
              );
            })}
            {extraFilters.map((c) => (
              <button
                key={c.key}
                onClick={() => setFilters((f) => ({ ...f, ...c.reset }))}
                className="px-2.5 py-1.5 rounded-xl text-xs bg-sky-50 text-sky-700 border border-sky-200 flex items-center gap-1 whitespace-nowrap"
              >
                {c.label}
                <X className="w-3 h-3" />
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <PeriodPicker value={period} onChange={setPeriod} />
            <div className="flex gap-0.5 p-0.5 bg-slate-200/70 rounded-xl">
              {([
                ['cards', LayoutGrid, 'کارتی'],
                ['compact', List, 'فشرده'],
                ['table', Table2, 'جدولی'],
              ] as const).map(([k, Icon, label]) => (
                <button
                  key={k}
                  onClick={() => setLayout(k)}
                  title={label}
                  aria-label={label}
                  className={`p-1.5 rounded-lg transition ${view.layout === k ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
                >
                  <Icon className="w-4 h-4" />
                </button>
              ))}
            </div>
          </div>

          {filteredInvoices.length === 0 ? (
            <div className="bg-white rounded-3xl p-8 text-center text-slate-400 border border-sky-100 space-y-2">
              <FileText className="w-8 h-8 mx-auto stroke-1 text-slate-300" />
              <p className="text-xs font-normal">فاکتوری یافت نشد</p>
            </div>
          ) : (
            <InvoiceList invoices={filteredInvoices} view={view} onOpen={setSelectedInvoice} />
          )}
        </div>

        <InvoiceFilterSheet open={filterOpen} value={filters} onClose={() => setFilterOpen(false)} onApply={setFilters} />

        <InvoiceDetailModal
          isOpen={!!selectedInvoice}
          invoice={selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
          onChanged={(updated) => {
            if (updated) setInvoices((prev) => prev.map((i) => (i._id === updated._id ? updated : i)));
            else loadInvoices();
          }}
        />

        <NewPurchaseInvoiceModal
          isOpen={isPurchaseModalOpen}
          onClose={() => setIsPurchaseModalOpen(false)}
          onInvoiceCreated={(inv) => {
            loadInvoices();
            setPriceSheetInvoiceId(inv._id);
          }}
        />
        <PurchasePriceSheet invoiceId={priceSheetInvoiceId} onClose={() => setPriceSheetInvoiceId(null)} />
      </IonContent>
    </IonPage>
  );
};
