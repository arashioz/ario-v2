import React, { useState, useEffect, useCallback } from 'react';
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
import { customersService } from '../../services/customers.service';
import type {
  Customer,
  CustomerStats,
  CustomerTransaction,
} from '../../services/customers.service';
import { apiErrorMessage, invoicesService } from '../../services/invoices.service';
import { useSettings } from '../../services/settings.service';
import { debtSms, openSms } from '../../lib/sms';
import { Sheet } from '../../components/ui/Sheet';
import { searchKey } from '../../lib/format';
import { NewCustomerModal } from '../../components/customers/NewCustomerModal';
import { RecordTransactionModal } from '../../components/customers/RecordTransactionModal';
import { CustomerDetailModal } from '../../components/customers/CustomerDetailModal';
import { CustomerPaymentsList } from '../../components/customers/CustomerPaymentsList';
import {
  Search,
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
import { formatToman } from '../../lib/format';
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
        <button
          onClick={save}
          disabled={saving || !name.trim()}
          className="w-full py-3 rounded-2xl bg-sky-600 text-white text-sm font-bold disabled:opacity-40"
        >
          {saving ? 'در حال ثبت…' : 'ثبت مشتری حضوری'}
        </button>
      }
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="نام مشتری"
        className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-sm focus:outline-none focus:border-sky-500"
      />
      <input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="شماره موبایل"
        inputMode="tel"
        dir="ltr"
        className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-sm font-mono text-left focus:outline-none focus:border-sky-500"
      />
    </Sheet>
  );
};

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
  const [view, setView] = useState<'book' | 'debtors' | 'payments'>(initialFilter === 'debtors' ? 'debtors' : 'book');
  const [walkInOpen, setWalkInOpen] = useState(false);

  useEffect(() => {
    const f = searchParams.get('filter');
    if (f === 'debtors') setView('debtors');
  }, [searchParams]);

  // Modals state
  const [isNewCustomerOpen, setIsNewCustomerOpen] = useState(false);
  const [selectedCustomerForTx, setSelectedCustomerForTx] = useState<Customer | null>(null);
  const [isRecordTxOpen, setIsRecordTxOpen] = useState(false);
  const [selectedCustomerIdForDetail, setSelectedCustomerIdForDetail] = useState<string | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [detailRefreshTrigger, setDetailRefreshTrigger] = useState(0);
  const [paymentsRefresh, setPaymentsRefresh] = useState(0);

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
      showNotification({
        title: 'خطا در بارگذاری داده‌ها',
        message: 'عدم امکان برقراری ارتباط با سرور',
        type: 'error',
      });
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [search, view, showNotification]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useIonViewWillEnter(() => {
    loadData();
  });

  const handleRefresh = async (event: CustomEvent<RefresherEventDetail>) => {
    await loadData();
    event.detail.complete();
  };

  const handleCustomerCreated = (newCust: Customer) => {
    setCustomers((prev) => [newCust, ...prev.filter((c) => c._id !== newCust._id)]);
    loadData();
  };

  const openNew = () => setIsNewCustomerOpen(true);

  const handleTransactionRecorded = (
    updatedCustomer: Customer,
    _transaction: CustomerTransaction
  ) => {
    setCustomers((prev) =>
      prev.map((c) => (c._id === updatedCustomer._id ? updatedCustomer : c))
    );
    loadData();
    setDetailRefreshTrigger((t) => t + 1);
    setPaymentsRefresh((t) => t + 1);
  };

  const handleCustomerDeleted = (deletedId: string) => {
    setCustomers((prev) => prev.filter((c) => c._id !== deletedId));
    loadData();
  };

  const handleSendQuickSms = async (customer: Customer, e: React.MouseEvent) => {
    e.stopPropagation();
    if (customer.balance <= 0) {
      showNotification({
        title: 'عدم نیاز به پیامک',
        message: `${customer.name} هیچ بدهی فعالی ندارد.`,
        type: 'info',
      });
      return;
    }

    try {
      const invoices = await invoicesService.getAll({ customerId: customer._id });
      showNotification({
        title: 'گزارش حساب آماده شد',
        message: `گزارش بدهی ${formatToman(customer.balance)} با فاکتورهای باز کپی شد؛ پیامک گوشی باز می‌شود.`,
        type: 'success',
      });
      await openSms(customer.phoneNumber, debtSms(customer, invoices, settings));
    } catch {
      showNotification({
        title: 'خطا',
        message: 'دریافت فاکتورهای مشتری انجام نشد',
        type: 'error',
      });
    }
  };

  const openRecordModal = (customer: Customer, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedCustomerForTx(customer);
    setIsRecordTxOpen(true);
  };

  const openDetailModal = (customerId: string) => {
    setSelectedCustomerIdForDetail(customerId);
    setIsDetailOpen(true);
  };

  const directory = [...customers].sort((a, b) => a.name.localeCompare(b.name, 'fa'));
  const groups = directory.reduce<{ letter: string; rows: Customer[] }[]>((acc, customer) => {
    const letter = customer.name.trim().charAt(0) || '#';
    const last = acc[acc.length - 1];
    if (!last || last.letter !== letter) acc.push({ letter, rows: [customer] });
    else last.rows.push(customer);
    return acc;
  }, []);
  const shown = view === 'book' ? groups.flatMap((g) => g.rows) : directory;

  return (
    <IonPage>
      <IonHeader className="ion-no-border">
        <IonToolbar className="bg-white/80 backdrop-blur-md px-4 py-2 border-b border-sky-100">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-sm font-bold text-slate-800">دفترچه مشتریان</h1>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate('/customers-map')}
                className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-purple-600 text-white text-xs font-bold shadow-md shadow-purple-400/30 active:scale-95"
                title="مشاهده نقشه مشتریان"
              >
                <MapPin className="w-4 h-4" />
                نقشه
              </button>

              <button
                onClick={() => loadData()}
                className="p-2 rounded-2xl bg-sky-50 text-sky-600 hover:bg-sky-100 transition active:scale-95"
                title="به‌روزرسانی داده‌ها"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>

              <button
                onClick={openNew}
                className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-sky-500 hover:bg-sky-600 text-white text-xs font-bold shadow-md shadow-sky-400/20 active:scale-95 transition"
              >
                <UserPlus className="w-4 h-4" />
                <span>مشتری جدید</span>
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
          <div className="grid grid-cols-3 p-1 bg-slate-200/70 rounded-2xl">
            {([
              ['book', 'دفترچه'],
              ['debtors', 'بدهکاران'],
              ['payments', 'دریافت‌ها'],
            ] as const).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setView(k)}
                className={`py-2 rounded-xl text-xs font-bold transition ${
                  view === k ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {view === 'debtors' && (
            <div className="rounded-3xl bg-rose-600 text-white p-4 shadow-lg shadow-rose-500/20">
              <div className="text-xs text-rose-100">مطالبات باز</div>
              <div className="text-2xl font-black mt-1">{stats ? formatToman(stats.totalDebt) : '...'}</div>
              <div className="text-[11px] text-rose-100 mt-1">{stats ? stats.debtorsCount.toLocaleString('fa-IR') : '...'} نفر بدهکار</div>
            </div>
          )}

          {view === 'payments' ? (
            <CustomerPaymentsList refreshKey={paymentsRefresh} onOpenCustomer={openDetailModal} />
          ) : (
          <>
          {/* Search Input */}
          <div className="relative flex items-center">
            <div className="absolute right-3.5 text-slate-400 pointer-events-none">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="جستجوی نام، تلفن یا آدرس مشتری..."
              className="w-full pl-4 pr-10 py-2.5 text-xs rounded-2xl bg-white border border-sky-100 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition text-slate-800 shadow-sm"
            />
          </div>

          {loading && customers.length === 0 ? (
            <ListSkeleton />
          ) : customers.length === 0 ? (
            <div className="bg-white rounded-3xl p-8 text-center border border-dashed border-sky-200 space-y-3">
              <Users className="w-10 h-10 text-sky-300 mx-auto" />
              <h3 className="text-sm font-bold text-slate-700">مشتری‌ای با این مشخصات یافت نشد</h3>
              <p className="text-xs text-slate-400">
                می‌توانید با دکمه زیر مشتری جدیدی به دفترچه حساب اضافه کنید.
              </p>
              <button
                onClick={openNew}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-sky-500 text-white text-xs font-bold shadow-md shadow-sky-400/20"
              >
                <UserPlus className="w-4 h-4" />
                <span>تعریف مشتری جدید</span>
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {shown.map((customer, index) => {
                const letter = customer.name.trim().charAt(0) || '#';
                const showLetter = view === 'book' && (index === 0 || shown[index - 1].name.trim().charAt(0) !== letter);
                return (
                <React.Fragment key={customer._id}>
                {showLetter && <div className="sticky top-0 z-10 px-2 py-1 text-[11px] font-black text-sky-700 bg-slate-50">{letter}</div>}
                <div
                  onClick={() => openDetailModal(customer._id)}
                  className={`rounded-3xl p-3.5 shadow-sm hover:shadow-md transition cursor-pointer flex flex-col gap-2.5 active:scale-[0.99] ${view === 'debtors' ? 'bg-rose-50 border border-rose-200' : 'bg-white border border-sky-100'}`}
                >
                  {/* Card Header */}
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-800">
                        {customer.name}
                        {customer.kind === 'walkin' && (
                          <span className="mr-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">حضوری</span>
                        )}
                      </h3>
                      {(customer.overdueCount || 0) > 0 && (
                        <span className="mt-1 inline-flex text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-600 text-white">
                          تاخیر در پرداخت · {formatToman(customer.overdueAmount || 0)}
                        </span>
                      )}
                      <span className="text-xs text-slate-400 font-mono mt-0.5 block" dir="ltr">
                        {customer.phoneNumber}
                      </span>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full ${
                        customer.balance > 0
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : customer.balance === 0
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-sky-50 text-sky-700 border border-sky-200'
                      }`}
                    >
                      {customer.balance > 0 ? (
                        <>
                          <AlertCircle className="w-3.5 h-3.5" />
                          <span>بدهکار: {formatToman(customer.balance)}</span>
                        </>
                      ) : customer.balance === 0 ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>تسویه کامل</span>
                        </>
                      ) : (
                        <>
                          <span>بستانکار: {formatToman(Math.abs(customer.balance))}</span>
                        </>
                      )}
                    </span>
                  </div>

                  {/* Card Address preview if any */}
                  {customer.address && (
                    <p className="text-[11px] text-slate-400 line-clamp-1">{customer.address}</p>
                  )}

                  {/* Card Actions Footer */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openDetailModal(customer._id);
                      }}
                      className="flex items-center gap-1 text-slate-400 hover:text-sky-600 transition text-[11px] font-medium"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>مشاهده پرونده و گردش</span>
                      <ChevronLeft className="w-3 h-3" />
                    </button>

                    <div className="flex items-center gap-1.5">
                      {/* Record payment / debt button */}
                      <button
                        onClick={(e) => openRecordModal(customer, e)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-[11px] font-bold transition shadow-sm shadow-sky-400/20 active:scale-95"
                        title="ثبت دریافت وجه یا بدهی"
                      >
                        <PlusCircle className="w-3.5 h-3.5" />
                        <span>دریافت / بدهی</span>
                      </button>

                      {/* SMS Button */}
                      <button
                        onClick={(e) => handleSendQuickSms(customer, e)}
                        className={`p-1.5 rounded-xl transition ${
                          customer.balance > 0
                            ? 'bg-sky-50 text-sky-600 hover:bg-sky-100'
                            : 'bg-slate-100 text-slate-400'
                        }`}
                        title="ارسال پیامک مانده حساب"
                      >
                        <MessageSquare className="w-4 h-4" />
                      </button>

                      {/* Phone call button */}
                      <a
                        href={`tel:${customer.phoneNumber}`}
                        onClick={(e) => e.stopPropagation()}
                        className="p-1.5 rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition"
                        title="تماس تلفنی"
                      >
                        <Phone className="w-4 h-4" />
                      </a>
                    </div>
                  </div>
                </div>
                </React.Fragment>
                );
              })}
              <p className="text-center text-[11px] text-slate-400 pt-2">
                {customers.length.toLocaleString('fa-IR')} نفر در این لیست
              </p>
            </div>
          )}
          </>
          )}
        </div>

        {/* Modals */}
        <NewCustomerModal
          isOpen={isNewCustomerOpen}
          onClose={() => setIsNewCustomerOpen(false)}
          onCustomerCreated={handleCustomerCreated}
        />

        <WalkInSheet
          open={walkInOpen}
          onClose={() => setWalkInOpen(false)}
          onCreated={(c) => {
            setWalkInOpen(false);
            handleCustomerCreated(c);
          }}
        />

        <RecordTransactionModal
          isOpen={isRecordTxOpen}
          customer={selectedCustomerForTx}
          onClose={() => {
            setIsRecordTxOpen(false);
            setSelectedCustomerForTx(null);
          }}
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
          onChanged={() => {
            loadData();
            setPaymentsRefresh((t) => t + 1);
          }}
          onCustomerDeleted={handleCustomerDeleted}
          refreshTrigger={detailRefreshTrigger}
        />
      </IonContent>
    </IonPage>
  );
};
