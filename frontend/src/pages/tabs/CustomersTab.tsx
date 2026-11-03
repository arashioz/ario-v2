import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonContent,
  IonRefresher,
  IonRefresherContent,
  useIonViewWillEnter,
} from '@ionic/react';
import type { RefresherEventDetail } from '@ionic/react';
import { useSearchParams } from 'react-router-dom';
import { useNotification } from '../../context/NotificationContext';
import { customersService, daysSinceSale, isQuietMonth, lastSaleTime } from '../../services/customers.service';
import type { Customer, CustomerStats, CustomerTransaction } from '../../services/customers.service';
import { apiErrorMessage, invoicesService } from '../../services/invoices.service';
import { useSettings } from '../../services/settings.service';
import { debtSms, openSms } from '../../lib/sms';
import { Sheet } from '../../components/ui/Sheet';
import { searchKey } from '../../lib/format';
import { NewCustomerModal } from '../../components/customers/NewCustomerModal';
import { RecordTransactionModal } from '../../components/customers/RecordTransactionModal';
import { CustomerDetailModal } from '../../components/customers/CustomerDetailModal';
import { CustomerPaymentsList } from '../../components/customers/CustomerPaymentsList';
import { GradeBadge } from '../../components/watch/GradeBadge';
import {
  UserPlus,
  Phone,
  MessageSquare,
  AlertCircle,
  CheckCircle2,
  PlusCircle,
  RefreshCw,
  Users,
  Eye,
  ChevronLeft,
  MapPin,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatToman, num } from '../../lib/format';
import { ListSkeleton } from '../../components/ui/Skeleton';

const WalkInSheet: React.FC<{ open: boolean; onClose: () => void; onCreated: (c: Customer) => void }> = ({ open, onClose, onCreated }) => {
  const { showNotification } = useNotification();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName('');
      setPhone('');
    }
  }, [open]);

  const save = async () => {
    try {
      setSaving(true);
      const c = await customersService.create({ name: name.trim(), phoneNumber: searchKey(phone).replace(/\D/g, ''), kind: 'walkin' });
      showNotification({ title: 'ثبت شد', message: `${c.name} به مشتریان حضوری اضافه شد.`, type: 'success' });
      onCreated(c);
    } catch (err) {
      showNotification({ title: 'خطا', message: apiErrorMessage(err, 'ثبت مشتری انجام نشد'), type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="مشتری حضوری جدید"
      subtitle="فقط نام و شماره"
      footer={
        <button onClick={save} disabled={saving || !name.trim()} className="w-full py-3 rounded-2xl bg-sky-600 text-white text-sm font-bold disabled:opacity-40">
          {saving ? 'در حال ثبت…' : 'ثبت مشتری حضوری'}
        </button>
      }
    >
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="نام مشتری" className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-sm focus:outline-none focus:border-sky-500" />
      <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="شماره موبایل" inputMode="tel" dir="ltr" className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-sm font-mono text-left focus:outline-none focus:border-sky-500" />
    </Sheet>
  );
};

type View = 'book' | 'debtors' | 'quiet' | 'grades' | 'payments';

export const CustomersTab: React.FC = () => {
  const { showNotification } = useNotification();
  const navigate = useNavigate();
  const settings = useSettings();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialFilter = searchParams.get('filter');

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [stats, setStats] = useState<CustomerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<View>(
    initialFilter === 'debtors' ? 'debtors' : initialFilter === 'quiet' ? 'quiet' : initialFilter === 'grades' ? 'grades' : 'book',
  );
  const [pageSize, setPageSize] = useState<0 | 20 | 50>(0);
  const [page, setPage] = useState(0);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [isNewCustomerOpen, setIsNewCustomerOpen] = useState(false);
  const [selectedCustomerForTx, setSelectedCustomerForTx] = useState<Customer | null>(null);
  const [isRecordTxOpen, setIsRecordTxOpen] = useState(false);
  const [selectedCustomerIdForDetail, setSelectedCustomerIdForDetail] = useState<string | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [detailRefreshTrigger, setDetailRefreshTrigger] = useState(0);
  const [paymentsRefresh, setPaymentsRefresh] = useState(0);

  useEffect(() => {
    const f = searchParams.get('filter');
    if (f === 'debtors' || f === 'quiet' || f === 'grades') setView(f);
  }, [searchParams]);

  useEffect(() => {
    const customerId = searchParams.get('customerId');
    if (customerId) {
      setSelectedCustomerIdForDetail(customerId);
      setIsDetailOpen(true);
    }
  }, [searchParams]);

  const requestId = React.useRef(0);

  const loadData = useCallback(async () => {
    const id = ++requestId.current;
    try {
      setLoading(true);
      const [list, statsData] = await Promise.all([
        customersService.getCustomers({ search, filter: view === 'debtors' ? 'debtors' : 'all' }),
        customersService.getCustomerStats(),
      ]);
      if (id !== requestId.current) return;
      setCustomers(list);
      setStats(statsData);
    } catch {
      if (id !== requestId.current) return;
      showNotification({ title: 'خطا در بارگذاری داده‌ها', message: 'عدم امکان برقراری ارتباط با سرور', type: 'error' });
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [search, view, showNotification]);

  useEffect(() => { loadData(); }, [loadData]);
  useIonViewWillEnter(() => { loadData(); });

  const handleRefresh = async (event: CustomEvent<RefresherEventDetail>) => {
    await loadData();
    event.detail.complete();
  };

  const handleCustomerCreated = (newCust: Customer) => {
    setCustomers((prev) => [newCust, ...prev.filter((c) => c._id !== newCust._id)]);
    loadData();
  };

  const handleTransactionRecorded = (updatedCustomer: Customer, _transaction: CustomerTransaction) => {
    setCustomers((prev) => prev.map((c) => (c._id === updatedCustomer._id ? updatedCustomer : c)));
    loadData();
    setDetailRefreshTrigger((t) => t + 1);
    setPaymentsRefresh((t) => t + 1);
  };

  const handleSendQuickSms = async (customer: Customer, e: React.MouseEvent) => {
    e.stopPropagation();
    if (customer.balance <= 0) {
      showNotification({ title: 'عدم نیاز به پیامک', message: `${customer.name} هیچ بدهی فعالی ندارد.`, type: 'info' });
      return;
    }
    try {
      const invoices = await invoicesService.getAll({ customerId: customer._id });
      showNotification({ title: 'گزارش حساب آماده شد', message: `گزارش بدهی ${formatToman(customer.balance)} کپی شد.`, type: 'success' });
      await openSms(customer.phoneNumber, debtSms(customer, invoices, settings));
    } catch {
      showNotification({ title: 'خطا', message: 'دریافت فاکتورهای مشتری انجام نشد', type: 'error' });
    }
  };

  const openDetailModal = (customerId: string) => {
    setSelectedCustomerIdForDetail(customerId);
    setIsDetailOpen(true);
  };

  const directory = useMemo(() => [...customers].sort((a, b) => a.name.localeCompare(b.name, 'fa')), [customers]);
  const groups = directory.reduce<{ letter: string; rows: Customer[] }[]>((acc, customer) => {
    const letter = customer.name.trim().charAt(0) || '#';
    const last = acc[acc.length - 1];
    if (!last || last.letter !== letter) acc.push({ letter, rows: [customer] });
    else last.rows.push(customer);
    return acc;
  }, []);

  const listed = useMemo(() => {
    if (view === 'quiet') return directory.filter((c) => isQuietMonth(c)).sort((a, b) => lastSaleTime(a) - lastSaleTime(b) || a.name.localeCompare(b.name, 'fa'));
    if (view === 'grades') return directory.filter((c) => c.kind !== 'walkin').sort((a, b) => (a.watchGrade || 'Z').localeCompare(b.watchGrade || 'Z') || a.name.localeCompare(b.name, 'fa'));
    if (view === 'book') return groups.flatMap((g) => g.rows);
    return directory;
  }, [view, directory, groups]);

  const pageCount = pageSize ? Math.max(1, Math.ceil(listed.length / pageSize)) : 1;
  const shown = pageSize ? listed.slice(page * pageSize, page * pageSize + pageSize) : listed;

  useEffect(() => { setPage(0); }, [view, search, pageSize]);

  return (
    <IonPage>
      <IonHeader className="ion-no-border">
        <IonToolbar className="bg-white/80 backdrop-blur-md px-4 py-2 border-b border-sky-100">
          <div className="flex items-center justify-between">
            <h1 className="text-sm font-bold text-slate-800">دفترچه مشتریان</h1>
            <div className="flex items-center gap-2">
              <button onClick={() => navigate('/customers-map')} className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-purple-600 text-white text-xs font-bold shadow-md active:scale-95">
                <MapPin className="w-4 h-4" />
                نقشه
              </button>
              <button onClick={() => loadData()} className="p-2 rounded-2xl bg-sky-50 text-sky-600 active:scale-95">
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button type="button" onClick={() => setWalkInOpen(true)} className="px-2 py-2 rounded-2xl bg-white border border-slate-200 text-[11px] font-bold text-slate-600">حضوری</button>
              <button onClick={() => setIsNewCustomerOpen(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-sky-500 text-white text-xs font-bold shadow-md active:scale-95">
                <UserPlus className="w-4 h-4" />
                مشتری جدید
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
          <div className="grid grid-cols-5 p-1 bg-slate-200/70 rounded-2xl">
            {([
              ['book', 'دفترچه'],
              ['debtors', 'بدهکار'],
              ['quiet', 'ساکت'],
              ['grades', 'گرید'],
              ['payments', 'دریافت'],
            ] as const).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setView(k)}
                className={`py-2 rounded-xl text-[11px] font-bold ${view === k ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {view === 'debtors' && (
            <div className="rounded-3xl bg-rose-600 text-white p-4">
              <div className="text-xs text-rose-100">مطالبات باز</div>
              <div className="text-2xl font-black mt-1">{stats ? formatToman(stats.totalDebt) : '...'}</div>
              <div className="text-[11px] text-rose-100 mt-1">{stats ? num(stats.debtorsCount) : '...'} نفر بدهکار</div>
            </div>
          )}
          {view === 'quiet' && (
            <div className="rounded-3xl bg-amber-600 text-white p-4">
              <div className="text-xs text-amber-100">این ماه سفارش نداده‌اند</div>
              <div className="text-2xl font-black mt-1">{num(listed.length)} نفر</div>
            </div>
          )}
          {view === 'grades' && (
            <button type="button" onClick={() => navigate('/watch')} className="w-full rounded-3xl bg-sky-700 text-white p-4 text-right">
              <div className="text-xs text-sky-100">پایش و گرید خودکار</div>
              <div className="text-sm font-black mt-1">قوانین را بگذارید، پایش کنید، بعد هنگام تماس رزومه و فاکتور پیشنهادی دارید</div>
            </button>
          )}

          {view === 'payments' ? (
            <CustomerPaymentsList refreshKey={paymentsRefresh} onOpenCustomer={openDetailModal} />
          ) : (
            <>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="جستجوی نام، تلفن یا آدرس"
                className="w-full pl-4 pr-4 py-2.5 text-xs rounded-2xl bg-white border border-sky-100 focus:border-sky-400 outline-none"
              />
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  {([
                    [0, 'همه'],
                    [20, '۲۰'],
                    [50, '۵۰'],
                  ] as const).map(([size, label]) => (
                    <button key={size} type="button" onClick={() => setPageSize(size)} className={`px-2.5 py-1 rounded-xl text-[11px] font-bold ${pageSize === size ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 border border-slate-200'}`}>
                      {label}
                    </button>
                  ))}
                </div>
                {pageSize > 0 && (
                  <div className="flex items-center gap-1 text-[11px] font-bold text-slate-500">
                    <button type="button" disabled={page <= 0} onClick={() => setPage((n) => Math.max(0, n - 1))} className="px-2 py-1 rounded-lg bg-white border border-slate-200 disabled:opacity-40">قبلی</button>
                    <span className="font-mono">{num(page + 1)} / {num(pageCount)}</span>
                    <button type="button" disabled={page + 1 >= pageCount} onClick={() => setPage((n) => n + 1)} className="px-2 py-1 rounded-lg bg-white border border-slate-200 disabled:opacity-40">بعدی</button>
                  </div>
                )}
              </div>

              {loading && customers.length === 0 ? (
                <ListSkeleton />
              ) : shown.length === 0 ? (
                <div className="bg-white rounded-3xl p-8 text-center border border-dashed border-sky-200 space-y-3">
                  <Users className="w-10 h-10 text-sky-300 mx-auto" />
                  <h3 className="text-sm font-bold text-slate-700">مشتری‌ای یافت نشد</h3>
                  <button onClick={() => setIsNewCustomerOpen(true)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-sky-500 text-white text-xs font-bold">
                    <UserPlus className="w-4 h-4" />
                    تعریف مشتری جدید
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {shown.map((customer, index) => {
                    const letter = customer.name.trim().charAt(0) || '#';
                    const showLetter = view === 'book' && (index === 0 || shown[index - 1].name.trim().charAt(0) !== letter);
                    const quietDays = daysSinceSale(customer);
                    return (
                      <React.Fragment key={customer._id}>
                        {showLetter && <div className="sticky top-0 z-10 px-2 py-1 text-[11px] font-black text-sky-700 bg-slate-50">{letter}</div>}
                        <div
                          onClick={() => openDetailModal(customer._id)}
                          className={`rounded-3xl p-3.5 shadow-sm cursor-pointer flex flex-col gap-2.5 active:scale-[0.99] ${
                            view === 'debtors' ? 'bg-rose-50 border border-rose-200' : view === 'quiet' ? 'bg-amber-50 border border-amber-200' : 'bg-white border border-sky-100'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <h3 className="text-sm font-bold text-slate-800">
                                {customer.name}
                                {customer.kind === 'walkin' && <span className="mr-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">حضوری</span>}
                              </h3>
                              <div className="flex flex-wrap items-center gap-1 mt-1">
                                <GradeBadge grade={customer.watchGrade} />
                                {view === 'quiet' && (
                                  <span className="inline-flex text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-600 text-white">
                                    {quietDays === null ? 'بدون سفارش' : `${num(quietDays)} روز سکوت`}
                                  </span>
                                )}
                              </div>
                              <span className="text-xs text-slate-400 font-mono mt-0.5 block" dir="ltr">{customer.phoneNumber}</span>
                              {customer.watchTopProductName && view === 'grades' && (
                                <span className="text-[11px] text-slate-400 block mt-0.5">پرمصرف: {customer.watchTopProductName}</span>
                              )}
                            </div>
                            <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full ${
                              customer.balance > 0 ? 'bg-rose-50 text-rose-700 border border-rose-200' : customer.balance === 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-sky-50 text-sky-700 border border-sky-200'
                            }`}>
                              {customer.balance > 0 ? <><AlertCircle className="w-3.5 h-3.5" />بدهکار: {formatToman(customer.balance)}</> : customer.balance === 0 ? <><CheckCircle2 className="w-3.5 h-3.5" />تسویه</> : <>بستانکار: {formatToman(Math.abs(customer.balance))}</>}
                            </span>
                          </div>
                          {customer.address && <p className="text-[11px] text-slate-400 line-clamp-1">{customer.address}</p>}
                          <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                            <button onClick={(e) => { e.stopPropagation(); openDetailModal(customer._id); }} className="flex items-center gap-1 text-slate-400 text-[11px] font-medium">
                              <Eye className="w-3.5 h-3.5" />
                              رزومه و پیشنهاد
                              <ChevronLeft className="w-3 h-3" />
                            </button>
                            <div className="flex items-center gap-1.5">
                              <button onClick={(e) => { e.stopPropagation(); setSelectedCustomerForTx(customer); setIsRecordTxOpen(true); }} className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-sky-500 text-white text-[11px] font-bold">
                                <PlusCircle className="w-3.5 h-3.5" />
                                دریافت
                              </button>
                              <button onClick={(e) => handleSendQuickSms(customer, e)} className={`p-1.5 rounded-xl ${customer.balance > 0 ? 'bg-sky-50 text-sky-600' : 'bg-slate-100 text-slate-400'}`}>
                                <MessageSquare className="w-4 h-4" />
                              </button>
                              <a href={`tel:${customer.phoneNumber}`} onClick={(e) => e.stopPropagation()} className="p-1.5 rounded-xl bg-emerald-50 text-emerald-600">
                                <Phone className="w-4 h-4" />
                              </a>
                            </div>
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })}
                  <p className="text-center text-[11px] text-slate-400 pt-2">{num(listed.length)} نفر در این لیست</p>
                </div>
              )}
            </>
          )}
        </div>

        <NewCustomerModal isOpen={isNewCustomerOpen} onClose={() => setIsNewCustomerOpen(false)} onCustomerCreated={handleCustomerCreated} />
        <WalkInSheet open={walkInOpen} onClose={() => setWalkInOpen(false)} onCreated={(c) => { setWalkInOpen(false); handleCustomerCreated(c); }} />
        <RecordTransactionModal
          isOpen={isRecordTxOpen}
          customer={selectedCustomerForTx}
          onClose={() => { setIsRecordTxOpen(false); setSelectedCustomerForTx(null); }}
          onSuccess={handleTransactionRecorded}
        />
        <CustomerDetailModal
          isOpen={isDetailOpen}
          customerId={selectedCustomerIdForDetail}
          onClose={() => {
            setIsDetailOpen(false);
            setSelectedCustomerIdForDetail(null);
            if (searchParams.has('customerId')) {
              const next = new URLSearchParams(searchParams);
              next.delete('customerId');
              setSearchParams(next, { replace: true });
            }
          }}
          onChanged={() => { loadData(); setPaymentsRefresh((t) => t + 1); }}
          onCustomerDeleted={(deletedId) => { setCustomers((prev) => prev.filter((c) => c._id !== deletedId)); loadData(); }}
          refreshTrigger={detailRefreshTrigger}
        />
      </IonContent>
    </IonPage>
  );
};
