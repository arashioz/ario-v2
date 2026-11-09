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
  ChevronLeft,
  ChevronRight,
  FileText,
  Search,
  RefreshCw,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { InvoiceList } from '../../components/invoices/InvoiceList';
import { PendingProformasBanner } from '../../components/proformas/PendingProformasBanner';
import { useSettings } from '../../services/settings.service';
import { useNavigate } from 'react-router-dom';
import { invoicesService } from '../../services/invoices.service';
import { readMellatReturn } from '../../services/payments.service';
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
import { ListSkeleton } from '../../components/ui/Skeleton';
import { dateToYmd } from '../../lib/jalali';

const companyOf = (inv: Invoice) => (inv.supplierCompany || inv.customerName || '').trim() || 'بدون شرکت';

export const InvoicesTab: React.FC = () => {
  const navigate = useNavigate();
  const { showNotification } = useNotification();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<InvoiceFilters>({ ...DEFAULT_INVOICE_FILTERS, type: 'sale' });
  const [filterOpen, setFilterOpen] = useState(false);
  const [book, setBook] = useState<'sale' | 'purchase'>('sale');
  const [company, setCompany] = useState<string | null>(null);
  const [purchasesReady, setPurchasesReady] = useState(false);
  const [lateShipOnly, setLateShipOnly] = useState(false);
  const [period, setPeriod] = useState<Period>(() => periodPresets()[0]);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [priceSheetInvoiceId, setPriceSheetInvoiceId] = useState<string | null>(null);
  const settings = useSettings();
  const view = filters.sort === 'amount' ? { ...settings.salesView, groupByDay: false } : settings.salesView;

  const loadInvoices = async () => {
    try {
      setLoading(true);
      setPurchasesReady(false);
      const sales = await invoicesService.getAll({ type: 'sale' });
      setInvoices(sales);
      setLoading(false);
      const purchases = await invoicesService.getAll({ type: 'purchase' });
      setInvoices([...sales, ...purchases]);
      setPurchasesReady(true);
    } catch (err: any) {
      showNotification({
        title: 'خطا در بارگذاری فاکتورها',
        message: 'امکان اتصال به سرور وجود ندارد.',
        type: 'error',
      });
      setLoading(false);
    }
  };

  const openBook = (next: 'sale' | 'purchase') => {
    setBook(next);
    setCompany(null);
    setFilters((current) => ({ ...current, type: next }));
  };

  useEffect(() => {
    loadInvoices();
  }, []);

  /** The bank drops the customer back here with ?mellat=ok|fail after the callback. */
  useEffect(() => {
    const result = readMellatReturn();
    if (!result) return;
    showNotification({
      title: result.ok ? 'پرداخت اینترنتی تأیید شد' : 'پرداخت اینترنتی انجام نشد',
      message: result.orderId ? `${result.message} (کد درخواست ${result.orderId})` : result.message,
      type: result.ok ? 'success' : 'error',
    });
    void loadInvoices();
  }, []);

  const handleRefresh = async (event: CustomEvent) => {
    await loadInvoices();
    event.detail.complete();
  };

  const filteredInvoices = useMemo(() => {
    const inPeriod =
      period.from || period.to
        ? invoices.filter((inv) => {
            const day = dateToYmd(new Date(inv.proformaDate || inv.invoiceDate || inv.createdAt));
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

  const companies = useMemo(() => {
    const rows = new Map<string, { count: number; amount: number; kg: number }>();
    for (const inv of filteredInvoices) {
      const name = companyOf(inv);
      const row = rows.get(name) || { count: 0, amount: 0, kg: 0 };
      row.count += 1;
      row.amount += inv.finalAmount || 0;
      row.kg += inv.totalWeightKg || 0;
      rows.set(name, row);
    }
    return [...rows.entries()]
      .map(([name, row]) => ({ name, ...row }))
      .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, 'fa'));
  }, [filteredInvoices]);

  const sameDay = (a?: string, b?: string) => {
    if (!a || !b) return true;
    return dateToYmd(new Date(a)) === dateToYmd(new Date(b));
  };
  const visibleInvoices = (company ? filteredInvoices.filter((inv) => companyOf(inv) === company) : filteredInvoices)
    .filter((inv) => !lateShipOnly || (inv.shippedAt && !sameDay(inv.shippedAt, inv.proformaDate || inv.invoiceDate)));

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

            <div className="flex items-center gap-3">
              <button type="button" onClick={() => navigate('/tabs/pos')} className="h-8 px-3 rounded-full bg-slate-900 text-white text-[11px] font-bold">فروش جدید</button>
              <button type="button" onClick={() => setIsPurchaseModalOpen(true)} className="h-8 px-3 rounded-full bg-white border border-slate-200 text-slate-800 text-[11px] font-bold">خرید جدید</button>
              <button
                onClick={loadInvoices}
                className="p-2 rounded-2xl bg-slate-50 text-slate-500 active:bg-slate-100"
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

          <div className="grid grid-cols-2 p-1 rounded-2xl bg-slate-200/80">
            {(['sale', 'purchase'] as const).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => openBook(id)}
                className={`py-2 rounded-xl text-[13px] font-bold transition ${book === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
              >
                {id === 'sale' ? 'فروش' : 'خرید'}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-slate-400">
              {book === 'sale'
                ? `${num(filteredInvoices.length)} فاکتور · ${formatToman(turnover.sales)}`
                : company
                  ? company
                  : purchasesReady
                    ? `${num(companies.length)} شرکت`
                    : 'در حال آوردن خریدها'}
            </p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setLateShipOnly((v) => !v)}
                className={`h-8 px-2.5 rounded-xl text-[10px] font-bold border ${lateShipOnly ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200'}`}
              >
                ارسال دیرتر
              </button>
              <PeriodPicker value={period} onChange={setPeriod} />
              <button
                onClick={() => setFilterOpen(true)}
                className={`relative p-2 rounded-xl border ${extraFilters.length ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-500'}`}
                aria-label="فیلتر"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {(loading && invoices.length === 0) || (book === 'purchase' && !purchasesReady) ? (
            <ListSkeleton rows={5} />
          ) : book === 'purchase' && !company ? (
            companies.length === 0 ? (
              <div className="bg-white rounded-3xl p-8 text-center text-slate-400 border border-slate-100 space-y-2">
                <FileText className="w-8 h-8 mx-auto stroke-1 text-slate-300" />
                <p className="text-xs">فاکتور خریدی نیست</p>
              </div>
            ) : (
              <section className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden divide-y divide-slate-100">
                {companies.map((row) => (
                  <button key={row.name} type="button" onClick={() => setCompany(row.name)} className="w-full px-3.5 py-3 flex items-center justify-between gap-3 text-right active:bg-slate-50">
                    <span className="min-w-0">
                      <span className="block text-[13px] font-bold text-slate-800 truncate">{row.name}</span>
                      <span className="block text-[11px] text-slate-400 mt-0.5">{num(row.count)} فاکتور · {weight(row.kg)}</span>
                    </span>
                    <span className="text-left shrink-0">
                      <span className="block text-[12px] font-bold font-mono text-slate-800">{formatToman(row.amount)}</span>
                      <span className="mt-0.5 flex items-center justify-end text-[11px] font-bold text-sky-700">جزئیات<ChevronLeft className="w-3.5 h-3.5" /></span>
                    </span>
                  </button>
                ))}
              </section>
            )
          ) : visibleInvoices.length === 0 ? (
            <div className="bg-white rounded-3xl p-8 text-center text-slate-400 border border-slate-100 space-y-2">
              <FileText className="w-8 h-8 mx-auto stroke-1 text-slate-300" />
              <p className="text-xs">فاکتوری یافت نشد</p>
            </div>
          ) : (
            <div className="space-y-2">
              {company && (
                <button type="button" onClick={() => setCompany(null)} className="flex items-center gap-1 text-[12px] font-bold text-sky-700">
                  <ChevronRight className="w-4 h-4" />
                  شرکت‌ها
                </button>
              )}
              <InvoiceList invoices={visibleInvoices} view={view} onOpen={setSelectedInvoice} />
            </div>
          )}
        </div>

        <InvoiceFilterSheet open={filterOpen} value={filters} onClose={() => setFilterOpen(false)} onApply={(next) => setFilters({ ...next, type: book })} />

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
            const ids = (inv.purchasedProductIds?.length ? inv.purchasedProductIds : inv.items.map((it) => it.productId)).filter(Boolean);
            if (ids.length) navigate(`/products?ids=${ids.map(encodeURIComponent).join(',')}&setup=1`);
            else setPriceSheetInvoiceId(inv._id);
          }}
        />
        <PurchasePriceSheet invoiceId={priceSheetInvoiceId} onClose={() => setPriceSheetInvoiceId(null)} />
      </IonContent>
    </IonPage>
  );
};
