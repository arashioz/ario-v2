import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { IonModal, IonHeader, IonToolbar, IonContent } from '@ionic/react';
import {
  X,
  Phone,
  MapPin,
  Clock,
  ArrowDownLeft,
  ArrowUpRight,
  Send,
  Trash2,
  Calendar,
  User,
  FileText,
  ChevronLeft,
  Scale,
  Wallet,
  PlusCircle,
  PhoneCall,
  Navigation,
  Pencil,
  MessageSquare,
} from 'lucide-react';
import { CustomerLocationMap } from '../map/CustomerLocationMap';
import { CustomerLocationPickerModal } from '../map/CustomerLocationPickerModal';
import { directionsUrl } from '../../lib/map';
import { customersService, PAYMENT_METHOD_LABELS } from '../../services/customers.service';
import type { Customer, CustomerTransaction } from '../../services/customers.service';
import { invoicesService, apiErrorMessage } from '../../services/invoices.service';
import type { Invoice } from '../../services/invoices.service';
import { InvoiceDetailModal } from '../invoices/InvoiceDetailModal';
import { InvoicePaymentSheet } from '../invoices/InvoicePaymentSheet';
import { RecordTransactionModal } from './RecordTransactionModal';
import { useNotification } from '../../context/NotificationContext';
import { LoadingOverlay } from '../LoadingOverlay';
import { followUpsService, RESULT_LABELS } from '../../services/followups.service';
import type { FollowUpLog } from '../../services/followups.service';
import { FollowUpSheet } from '../followups/FollowUpSheet';
import type { FollowUpTarget } from '../followups/FollowUpSheet';
import { useSettings } from '../../services/settings.service';
import { accountTitle } from '../ui/AccountPicker';
import { debtSms, invoiceSms, openSms } from '../../lib/sms';
import { formatToman } from '../../lib/format';
import { dateToYmd, ymdToJalali, JALALI_MONTHS } from '../../lib/jalali';

interface CustomerDetailModalProps {
  isOpen: boolean;
  customerId: string | null;
  onClose: () => void;
  /** Fired after anything that changes the customer's balance. */
  onChanged?: () => void;
  onCustomerDeleted?: (customerId: string) => void;
  refreshTrigger?: number;
  /** `sheet` opens as a draggable half-height sheet that keeps the page behind it interactive. */
  presentation?: 'page' | 'sheet';
}

const SHEET_BREAKPOINTS = [0, 0.5, 1];

export const CustomerDetailModal: React.FC<CustomerDetailModalProps> = ({
  isOpen,
  customerId,
  onClose,
  onChanged,
  onCustomerDeleted,
  refreshTrigger,
  presentation = 'page',
}) => {
  const { showNotification } = useNotification();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [transactions, setTransactions] = useState<CustomerTransaction[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [payInvoice, setPayInvoice] = useState<Invoice | null>(null);
  const [txKind, setTxKind] = useState<'payment' | 'debt' | null>(null);
  const [activeTab, setActiveTab] = useState<'invoices' | 'transactions' | 'followups'>('invoices');
  const [followUps, setFollowUps] = useState<FollowUpLog[]>([]);
  const [followUpTarget, setFollowUpTarget] = useState<FollowUpTarget | null>(null);
  const [loading, setLoading] = useState(false);
  const settings = useSettings();
  const [isLocationPickerOpen, setIsLocationPickerOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const loadData = useCallback(async (silent = false) => {
    if (!customerId) return;
    if (!silent) setLoading(true);
    try {
      const [cust, txs, invs, fus] = await Promise.all([
        customersService.getCustomer(customerId),
        customersService.getCustomerTransactions(customerId),
        invoicesService.getAll({ customerId }),
        followUpsService.history(customerId).catch(() => [] as FollowUpLog[]),
      ]);
      setCustomer(cust);
      setTransactions(txs);
      setInvoices(invs);
      setFollowUps(fus);
    } catch {
      showNotification({
        title: 'خطا در بارگذاری',
        message: 'امکان دریافت اطلاعات پرونده مشتری وجود ندارد',
        type: 'error',
      });
      onCloseRef.current();
    } finally {
      setLoading(false);
    }
  }, [customerId, showNotification]);

  useEffect(() => {
    if (isOpen && customerId) {
      loadData();
    } else {
      setCustomer(null);
      setTransactions([]);
      setInvoices([]);
      setSelectedInvoice(null);
    }
  }, [isOpen, customerId, refreshTrigger, loadData]);

  const afterChange = () => {
    loadData(true);
    onChanged?.();
  };

  const handleDeleteTx = async (tx: CustomerTransaction) => {
    if (!window.confirm(`این ${tx.type === 'payment' ? 'دریافت' : 'بدهی'} به مبلغ ${formatToman(tx.amount)} حذف شود؟`)) return;
    try {
      await customersService.deleteTransaction(tx._id);
      showNotification({ title: 'حذف شد', message: 'تراکنش حذف و مانده حساب اصلاح شد.', type: 'success' });
      afterChange();
    } catch (err) {
      showNotification({ title: 'حذف نشد', message: apiErrorMessage(err, 'خطا در حذف تراکنش'), type: 'error' });
    }
  };

  const startEditProfile = () => {
    if (!customer) return;
    setEditName(customer.name);
    setEditPhone(customer.phoneNumber || '');
    setEditingProfile(true);
  };

  const saveProfile = async () => {
    if (!customer || !editName.trim()) return;
    setSavingProfile(true);
    try {
      const updated = await customersService.updateCustomer(customer._id, {
        name: editName.trim(),
        phoneNumber: editPhone.trim(),
      });
      setCustomer(updated);
      setEditingProfile(false);
      showNotification({ title: 'ذخیره شد', message: 'نام و شماره مشتری روی پرونده و فاکتورها به‌روز شد.', type: 'success' });
      onChanged?.();
    } catch (err) {
      showNotification({ title: 'ذخیره نشد', message: apiErrorMessage(err, 'خطا در ویرایش مشتری'), type: 'error' });
    } finally {
      setSavingProfile(false);
    }
  };

  const changeDue = async (inv: Invoice, dueDays: number) => {
    try {
      const updated = await invoicesService.setDueDays(inv._id, dueDays);
      setInvoices((list) => list.map((i) => (i._id === inv._id ? updated : i)));
    } catch (err) {
      showNotification({ title: 'سررسید عوض نشد', message: apiErrorMessage(err, 'خطا'), type: 'error' });
    }
  };

  const openInvoices = invoices.filter((i) => i.type === 'sale' && i.remainingDebt > 0);
  const invoiceDebt = openInvoices.reduce((s, i) => s + i.remainingDebt, 0);
  const otherDebt = customer ? customer.balance - invoiceDebt : 0;

  const handleSendSms = async () => {
    if (!customer) return;
    if (customer.balance <= 0) {
      showNotification({
        title: 'عدم نیاز به ارسال پیامک',
        message: 'این مشتری بدهی فعالی ندارد.',
        type: 'info',
      });
      return;
    }
    showNotification({ title: 'گزارش حساب کپی شد', message: 'متن همراه با فاکتورهای باز آماده است؛ پیامک گوشی باز می‌شود.', type: 'success' });
    await openSms(customer.phoneNumber, debtSms(customer, invoices, settings));
  };

  const sendInvoiceSms = async (inv: Invoice) => {
    if (!customer) return;
    showNotification({ title: 'گزارش فاکتور کپی شد', message: 'متن همین فاکتور آماده است؛ پیامک گوشی باز می‌شود.', type: 'success' });
    await openSms(customer.phoneNumber || inv.customerPhone, invoiceSms(inv, settings, customer.balance));
  };

  const salesChart = useMemo(() => {
    const now = ymdToJalali(dateToYmd());
    const cur = now.jy * 12 + (now.jm - 1);
    const buckets = Array.from({ length: 6 }, (_, i) => {
      const k = cur - (5 - i);
      const jm = (k % 12) + 1;
      return { key: k, label: JALALI_MONTHS[jm - 1], amount: 0, kg: 0 };
    });
    const index = new Map(buckets.map((b, i) => [b.key, i]));
    for (const inv of invoices) {
      if (inv.type !== 'sale') continue;
      const j = ymdToJalali(dateToYmd(new Date(inv.invoiceDate || inv.createdAt)));
      const slot = index.get(j.jy * 12 + (j.jm - 1));
      if (slot == null) continue;
      buckets[slot].amount += inv.finalAmount || 0;
      buckets[slot].kg += inv.totalWeightKg || 0;
    }
    const max = Math.max(1, ...buckets.map((b) => b.amount));
    return { buckets, max };
  }, [invoices]);

  const handleSaveLocation = async (latitude: number, longitude: number) => {
    if (!customer) return;
    try {
      const updated = await customersService.updateCustomer(customer._id, { latitude, longitude });
      setCustomer((prev) => (prev ? { ...prev, latitude: updated.latitude, longitude: updated.longitude } : prev));
      showNotification({ title: 'لوکیشن ذخیره شد', message: `موقعیت ${customer.name} روی نقشه ثبت شد.`, type: 'success' });
      onChanged?.();
    } catch (err) {
      showNotification({ title: 'ذخیره نشد', message: apiErrorMessage(err, 'خطا در ثبت لوکیشن'), type: 'error' });
    }
  };

  const handleDelete = async () => {
    if (!customer) return;
    if (
      !window.confirm(
        `آیا از حذف مشتری «${customer.name}» مطمئن هستید؟ پرونده غیرفعال خواهد شد.`
      )
    ) {
      return;
    }

    try {
      await customersService.deleteCustomer(customer._id);
      showNotification({
        title: 'حذف موفق',
        message: 'مشتری از لیست فعال حذف گردید.',
        type: 'info',
      });
      onCustomerDeleted?.(customer._id);
      onClose();
    } catch {
      showNotification({
        title: 'خطا در حذف',
        message: 'عملیات حذف انجام نشد.',
        type: 'error',
      });
    }
  };

  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return new Intl.DateTimeFormat('fa-IR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
    } catch {
      return isoString;
    }
  };

  return (
    <IonModal
      isOpen={isOpen}
      onDidDismiss={onClose}
      {...(presentation === 'sheet' && {
        breakpoints: SHEET_BREAKPOINTS,
        initialBreakpoint: 0.5,
        backdropBreakpoint: 0.5,
        handle: true,
      })}
    >
      <IonHeader className="ion-no-border">
        <IonToolbar className="bg-white px-3 border-b border-sky-100">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-slate-800 truncate">
              {presentation === 'sheet' && customer ? customer.name : 'پرونده و گردش حساب مشتری'}
            </h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </IonToolbar>
      </IonHeader>

      <IonContent className="bg-slate-50">
        <LoadingOverlay isOpen={loading} message="بارگذاری پرونده..." />

        {customer && (
          <div className="p-3 space-y-3.5 max-w-md mx-auto pb-8">
            {/* Customer Summary Card */}
            <div className="bg-white rounded-2xl p-3 border border-sky-100 shadow-sm space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center font-bold text-lg">
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-800">{customer.name}</h3>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400 font-mono" dir="ltr">
                      <span>{customer.phoneNumber || 'بدون شماره'}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center">
                  <button
                    onClick={startEditProfile}
                    className="p-2 rounded-xl text-slate-400 hover:text-sky-600 hover:bg-sky-50 transition"
                    title="ویرایش نام و شماره"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleDelete}
                    className="p-2 rounded-xl text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition"
                    title="حذف مشتری"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {editingProfile && (
                <div className="space-y-2 rounded-xl border border-sky-100 bg-sky-50/40 p-2.5">
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="نام مشتری"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                  />
                  <input
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="شماره همراه"
                    inputMode="tel"
                    dir="ltr"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-mono text-left bg-white"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => void saveProfile()}
                      disabled={savingProfile || !editName.trim()}
                      className="flex-1 py-2 rounded-xl bg-sky-600 text-white text-[11px] font-bold disabled:opacity-40"
                    >
                      {savingProfile ? 'در حال ذخیره…' : 'ذخیره نام و شماره'}
                    </button>
                    <button onClick={() => setEditingProfile(false)} className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-[11px] font-bold text-slate-500">
                      انصراف
                    </button>
                  </div>
                </div>
              )}

              {/* Balance Box */}
              <div
                className={`px-3 py-2.5 rounded-xl border flex items-center justify-between ${
                  customer.balance > 0
                    ? 'bg-rose-50/70 border-rose-200 text-rose-950'
                    : customer.balance === 0
                    ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                    : 'bg-sky-50/70 border-sky-200 text-sky-950'
                }`}
              >
                <div>
                  <span className="text-xs font-semibold block opacity-80">وضعیت مانده حساب:</span>
                  <span className="text-lg font-black mt-0.5 block">
                    {formatToman(Math.abs(customer.balance))}
                  </span>
                </div>

                <span
                  className={`text-xs font-black px-3 py-1 rounded-full ${
                    customer.balance > 0
                      ? 'bg-rose-500 text-white shadow-sm shadow-rose-300'
                      : customer.balance === 0
                      ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-300'
                      : 'bg-sky-500 text-white shadow-sm shadow-sky-300'
                  }`}
                >
                  {customer.balance > 0
                    ? 'بدهکار به مغازه'
                    : customer.balance === 0
                    ? 'تسویه کامل'
                    : 'بستانکار (طلبکار)'}
                </span>
              </div>

              {customer.balance > 0 && (
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="bg-slate-50 rounded-xl px-3 py-2">
                    <span className="text-slate-400 block">نسیه فاکتورها ({openInvoices.length.toLocaleString('fa-IR')})</span>
                    <span className="font-mono font-bold text-slate-700">{formatToman(invoiceDebt)}</span>
                  </div>
                  <div className="bg-slate-50 rounded-xl px-3 py-2">
                    <span className="text-slate-400 block">بدهی دستی / سایر</span>
                    <span className="font-mono font-bold text-slate-700">{formatToman(Math.max(0, otherDebt))}</span>
                  </div>
                </div>
              )}

              <div className="rounded-xl bg-slate-50 border border-slate-100 px-2.5 py-2">
                <span className="text-[10px] font-bold text-slate-500">فروش شش ماه اخیر</span>
                <div className="mt-2 flex items-end gap-1 h-14">
                  {salesChart.buckets.map((b) => (
                    <div key={b.key} className="flex-1 h-full flex items-end">
                      <div
                        className="w-full rounded-md bg-sky-500"
                        style={{ height: `${Math.max(b.amount > 0 ? 8 : 2, (b.amount / salesChart.max) * 100)}%` }}
                        title={`${b.label}: ${formatToman(b.amount)}`}
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-1 flex gap-1">
                  {salesChart.buckets.map((b) => (
                    <span key={b.key} className="flex-1 text-center text-[8px] leading-tight text-slate-400 truncate">
                      {b.label}
                    </span>
                  ))}
                </div>
              </div>

              {/* Details & Address */}
              <div className="space-y-2 text-xs text-slate-600 empty:hidden">
                {customer.address && (
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-sky-500 flex-shrink-0" />
                    <span className="leading-relaxed">{customer.address}</span>
                  </div>
                )}
                {customer.creditLimit > 0 && (
                  <div className="flex items-center justify-between text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-xl">
                    <span>سقف اعتبار نسیه:</span>
                    <span className="font-bold text-slate-700">
                      {formatToman(customer.creditLimit)}
                    </span>
                  </div>
                )}
                {customer.notes && (
                  <div className="p-2.5 bg-amber-50/60 rounded-xl border border-amber-100 text-[11px] text-amber-900 leading-relaxed">
                    <span className="font-bold block mb-0.5">یادداشت:</span>
                    {customer.notes}
                  </div>
                )}
              </div>

              {/* Action Buttons Grid */}
              <div className="grid grid-cols-4 gap-1.5 pt-2.5 border-t border-slate-100">
                <button
                  onClick={() => setTxKind('payment')}
                  className="flex flex-col items-center justify-center p-2 rounded-xl bg-emerald-600 active:scale-95 text-white transition"
                >
                  <Wallet className="w-4 h-4 mb-1" />
                  <span className="text-[11px] font-bold">دریافت وجه</span>
                </button>

                <button
                  onClick={() => setTxKind('debt')}
                  className="flex flex-col items-center justify-center p-2 rounded-xl bg-rose-50 active:scale-95 text-rose-700 border border-rose-200/70 transition"
                >
                  <PlusCircle className="w-4 h-4 mb-1" />
                  <span className="text-[11px] font-bold">بدهی دستی</span>
                </button>

                <button
                  onClick={handleSendSms}
                  className="flex flex-col items-center justify-center p-2 rounded-xl bg-slate-50 active:scale-95 text-slate-700 border border-slate-200 transition"
                >
                  <Send className="w-4 h-4 mb-1" />
                  <span className="text-[11px] font-bold">گزارش پیامکی</span>
                </button>

                <a
                  href={`tel:${customer.phoneNumber}`}
                  className="flex flex-col items-center justify-center p-2 rounded-xl bg-slate-50 active:scale-95 text-slate-700 border border-slate-200 transition"
                >
                  <Phone className="w-4 h-4 mb-1" />
                  <span className="text-[11px] font-bold">تماس</span>
                </a>
              </div>
            </div>

            <div className="flex bg-slate-200/70 p-1 rounded-2xl gap-1">
              {([
                ['invoices', 'فاکتورها', invoices.length, FileText],
                ['transactions', 'گردش حساب', transactions.length, Clock],
                ['followups', 'پیگیری', followUps.length, PhoneCall],
              ] as const).map(([key, label, count, Icon]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveTab(key)}
                  className={`flex-1 py-2 rounded-xl text-[11px] font-bold transition flex items-center justify-center gap-1 ${
                    activeTab === key ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>
                    {label} (<span className="font-mono">{count.toLocaleString('fa-IR')}</span>)
                  </span>
                </button>
              ))}
            </div>

            {activeTab === 'followups' && (
              <div className="space-y-2.5">
                <button
                  onClick={() =>
                    setFollowUpTarget({
                      customerId: customer._id,
                      name: customer.name,
                      phoneNumber: customer.phoneNumber,
                      balance: customer.balance,
                      reason: 'manual',
                    })
                  }
                  className="w-full py-2.5 rounded-2xl bg-sky-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 active:scale-[0.98] transition"
                >
                  <PhoneCall className="w-4 h-4" />
                  ثبت نتیجه تماس
                </button>
                {followUps.length === 0 ? (
                  <div className="bg-white rounded-2xl p-6 text-center border border-dashed border-slate-200 text-xs text-slate-400">
                    هنوز تماسی با این مشتری ثبت نشده است.
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl border border-slate-100 divide-y divide-slate-100">
                    {followUps.map((f) => (
                      <div key={f._id} className="p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                            {RESULT_LABELS[f.result]}
                          </span>
                          <span className="text-[10px] text-slate-400">{formatDate(f.createdAt)}</span>
                        </div>
                        {f.note && <p className="text-[11px] text-slate-600 mt-1">{f.note}</p>}
                        <div className="text-[10px] text-slate-400 mt-1 flex gap-1.5">
                          {f.createdByName && <span>{f.createdByName}</span>}
                          {f.promisedAmount > 0 && (
                            <span className="text-amber-600">
                              · قول <span className="font-mono">{formatToman(f.promisedAmount)}</span>
                            </span>
                          )}
                          {f.nextFollowUpAt && (
                            <span>
                              · تماس بعدی{' '}
                              {new Intl.DateTimeFormat('fa-IR', { month: 'short', day: 'numeric' }).format(new Date(f.nextFollowUpAt))}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Invoices Tab Content */}
            {activeTab === 'invoices' && (
              <div className="space-y-2.5">
                {invoices.length === 0 ? (
                  <div className="bg-white rounded-2xl p-6 text-center border border-dashed border-slate-200 space-y-1">
                    <FileText className="w-8 h-8 text-slate-300 mx-auto" />
                    <p className="text-xs text-slate-400">هنوز فاکتوری برای این مشتری ثبت نشده است.</p>
                  </div>
                ) : (
                  invoices.map((inv) => (
                    <div
                      key={inv._id}
                      onClick={() => setSelectedInvoice(inv)}
                      className="bg-white rounded-2xl p-3 border border-sky-100 shadow-sm hover:shadow-md transition cursor-pointer active:scale-[0.99] space-y-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
                            <FileText className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="text-xs font-black text-slate-800 font-mono" dir="ltr">
                              {inv.invoiceNumber}
                            </span>
                            <div className="flex items-center gap-2 text-[10px] text-slate-400">
                              <span>{formatDate(inv.invoiceDate || inv.createdAt)}</span>
                              <span>• {inv.items.length} قلم کالا</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              inv.isPaid
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}
                          >
                            {inv.isPaid ? 'تسویه شده' : `نسیه همین فاکتور: ${formatToman(inv.remainingDebt)}`}
                            {!inv.isPaid && inv.dueDate && new Date(inv.dueDate).getTime() < Date.now() ? ' · تاخیر' : ''}
                          </span>
                          <ChevronLeft className="w-4 h-4 text-slate-400" />
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5 text-slate-500 text-[11px]">
                          <Scale className="w-3.5 h-3.5 text-slate-400" />
                          <span>وزن:</span>
                          <span className="font-bold text-slate-700">
                            {inv.totalWeightKg.toLocaleString('fa-IR')} کیلو
                          </span>
                          <span className="text-slate-300">|</span>
                          <span className="text-slate-400 text-[10px]">
                            {inv.paymentMethod === 'pos'
                              ? 'کارتخوان'
                              : inv.paymentMethod === 'cash'
                              ? 'نقدی'
                              : inv.paymentMethod === 'credit'
                              ? 'نسیه'
                              : inv.paymentMethod === 'transfer'
                              ? 'کارت‌به‌کارت'
                              : inv.paymentMethod === 'cheque'
                              ? 'چک'
                              : 'ترکیبی'}
                          </span>
                        </div>

                        <div className="text-left">
                          <span className="text-sm font-black text-sky-700 font-mono">
                            {inv.finalAmount.toLocaleString('fa-IR')}
                          </span>
                          <span className="text-[10px] text-slate-400 mr-1">تومان</span>
                        </div>
                      </div>

                      {inv.type === 'sale' && (
                        <div className={`grid gap-2 ${inv.remainingDebt > 0 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                          {inv.remainingDebt > 0 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setPayInvoice(inv);
                              }}
                              className="w-full py-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold flex items-center justify-center gap-1.5 active:scale-[0.98] transition"
                            >
                              <Wallet className="w-3.5 h-3.5" />
                              ثبت پرداخت این فاکتور
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              void sendInvoiceSms(inv);
                            }}
                            className="w-full py-2 rounded-xl bg-sky-50 text-sky-700 border border-sky-200 text-[11px] font-bold flex items-center justify-center gap-1.5 active:scale-[0.98] transition"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            گزارش پیامکی
                          </button>
                        </div>
                      )}
                      {inv.type === 'sale' && inv.remainingDebt > 0 && (
                        <div className="flex items-center gap-1 flex-wrap" onClick={(e) => e.stopPropagation()}>
                          <span className="text-[10px] text-slate-400">
                            سررسید {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString('fa-IR') : '۱۵ روز'}
                          </span>
                          {[7, 15, 30, 45, 60].map((d) => (
                            <button
                              key={d}
                              onClick={() => void changeDue(inv, d)}
                              className={`px-1.5 py-0.5 rounded-lg text-[10px] font-bold border ${
                                (inv.dueDays ?? 15) === d ? 'bg-rose-600 text-white border-rose-600' : 'bg-white text-slate-500 border-slate-200'
                              }`}
                            >
                              {d.toLocaleString('fa-IR')}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Transactions Tab Content */}
            {activeTab === 'transactions' && (
              <div className="space-y-2.5">
                {transactions.length === 0 ? (
                  <div className="bg-white rounded-2xl p-6 text-center border border-dashed border-slate-200">
                    <p className="text-xs text-slate-400">هنوز هیچ تراکنشی برای این مشتری ثبت نشده است.</p>
                  </div>
                ) : (
                  transactions.map((tx) => (
                    <div
                      key={tx._id}
                      className="bg-white rounded-2xl p-3 border border-sky-100 shadow-sm flex items-start justify-between gap-3"
                    >
                      <div className="flex items-start gap-2.5">
                        <div
                          className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${
                            tx.type === 'payment'
                              ? 'bg-emerald-100 text-emerald-600'
                              : 'bg-rose-100 text-rose-600'
                          }`}
                        >
                          {tx.type === 'payment' ? (
                            <ArrowDownLeft className="w-4 h-4" />
                          ) : (
                            <ArrowUpRight className="w-4 h-4" />
                          )}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-800">
                              {tx.type === 'payment'
                                ? 'دریافت وجه'
                                : tx.type === 'adjustment'
                                ? 'اصلاح مانده'
                                : tx.invoiceNumber
                                ? 'نسیه فاکتور'
                                : 'بدهی دستی'}
                            </span>
                            {tx.type === 'payment' && tx.paymentMethod && (
                              <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                                {PAYMENT_METHOD_LABELS[tx.paymentMethod]}
                              </span>
                            )}
                            {tx.type === 'payment' && tx.accountId && (
                              <span className="text-[10px] bg-sky-50 text-sky-700 px-2 py-0.5 rounded-full">
                                {accountTitle(settings.bankCards, tx.accountId)}
                              </span>
                            )}
                            {tx.type === 'debt' && tx.invoiceNumber && (
                              <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full" dir="ltr">
                                {tx.invoiceNumber}
                              </span>
                            )}
                          </div>

                          {tx.description && (
                            <p className="text-[11px] text-slate-500 mt-0.5">{tx.description}</p>
                          )}

                          {tx.type === 'payment' && !!tx.allocations?.length && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {tx.allocations.map((a) => (
                                <span key={a.invoiceId} className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">
                                  <span className="font-mono" dir="ltr">{a.invoiceNumber}</span>
                                  {' : '}
                                  <span className="font-mono">{formatToman(a.amount)}</span>
                                </span>
                              ))}
                            </div>
                          )}

                          <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-1">
                            <span className="flex items-center gap-0.5">
                              <Calendar className="w-3 h-3" />
                              {formatDate(tx.date)}
                            </span>
                            {tx.recordedByName && <span>• ثبت توسط: {tx.recordedByName}</span>}
                          </div>
                          {Array.from(
                            new Set([tx.invoiceId, ...(tx.allocations?.map((a) => a.invoiceId) ?? [])].filter(Boolean)),
                          ).map((id) => {
                            const linked = invoices.find((i) => i._id === id);
                            if (!linked || linked.type !== 'sale') return null;
                            return (
                              <button
                                key={id}
                                onClick={() => void sendInvoiceSms(linked)}
                                className="mt-1.5 inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-sky-50 text-sky-700 border border-sky-100 text-[10px] font-bold"
                              >
                                <MessageSquare className="w-3 h-3" />
                                گزارش پیامکی
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="text-left flex-shrink-0">
                        <span
                          className={`text-xs font-black block ${
                            tx.type === 'payment' ? 'text-emerald-600' : 'text-rose-600'
                          }`}
                        >
                          {tx.type === 'payment' ? '-' : '+'}
                          {formatToman(tx.amount)}
                        </span>
                        <span className="text-[10px] text-slate-400 block">
                          مانده: <span className="font-mono">{formatToman(tx.balanceAfter)}</span>
                        </span>
                        {(tx.type === 'payment' || (tx.type === 'debt' && !tx.invoiceId)) && (
                          <button
                            onClick={() => handleDeleteTx(tx)}
                            className="mt-1 p-1 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition"
                            title="حذف تراکنش"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            <div className="bg-white rounded-2xl border border-sky-100 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-sky-500" />
                  موقعیت مشتری
                </span>
                {customer.latitude != null && customer.longitude != null && (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setIsLocationPickerOpen(true)}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-50 text-slate-600 border border-slate-200 text-[11px] font-medium active:scale-95"
                    >
                      <Pencil className="w-3 h-3" />
                      تغییر
                    </button>
                    <a
                      href={directionsUrl(customer.latitude, customer.longitude)}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-sky-600 text-white text-[11px] font-bold active:scale-95"
                    >
                      <Navigation className="w-3 h-3" />
                      مسیریابی
                    </a>
                  </div>
                )}
              </div>
              {customer.latitude != null && customer.longitude != null ? (
                <CustomerLocationMap lat={customer.latitude} lng={customer.longitude} />
              ) : (
                <button
                  onClick={() => setIsLocationPickerOpen(true)}
                  className="w-full py-5 border-t border-dashed border-slate-200 text-xs text-sky-600 font-medium flex items-center justify-center gap-1.5 active:bg-sky-50"
                >
                  <MapPin className="w-4 h-4" />
                  لوکیشن ثبت نشده — ثبت روی نقشه
                </button>
              )}
            </div>
          </div>
        )}

        <CustomerLocationPickerModal
          isOpen={isLocationPickerOpen}
          initialLat={customer?.latitude}
          initialLng={customer?.longitude}
          autoLocate={customer?.latitude == null}
          customerName={customer?.name}
          onClose={() => setIsLocationPickerOpen(false)}
          onSelectLocation={handleSaveLocation}
        />

        {/* Invoice Detail Sub-Modal */}
        <InvoiceDetailModal
          isOpen={!!selectedInvoice}
          invoice={selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
          onChanged={afterChange}
        />

        <InvoicePaymentSheet
          invoice={payInvoice}
          onClose={() => setPayInvoice(null)}
          onPaid={() => {
            setPayInvoice(null);
            afterChange();
          }}
        />

        <FollowUpSheet
          target={followUpTarget}
          onClose={() => setFollowUpTarget(null)}
          onLogged={() => {
            setFollowUpTarget(null);
            loadData(true);
          }}
        />

        <RecordTransactionModal
          isOpen={!!txKind}
          customer={customer}
          initialType={txKind ?? undefined}
          onClose={() => setTxKind(null)}
          onSuccess={afterChange}
        />
      </IonContent>
    </IonModal>
  );
};
