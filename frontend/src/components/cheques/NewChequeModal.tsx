import React, { useState, useEffect } from 'react';
import {
  IonModal,
  IonHeader,
  IonToolbar,
  IonContent,
} from '@ionic/react';
import {
  X,
  CreditCard,
  Calendar,
  Save,
} from 'lucide-react';
import { chequesService } from '../../services/cheques.service';
import type { Cheque } from '../../services/cheques.service';
import { customersService } from '../../services/customers.service';
import type { Customer } from '../../services/customers.service';
import { useNotification } from '../../context/NotificationContext';
import { LoadingOverlay } from '../LoadingOverlay';
import { InvoiceDateModal } from '../pos/InvoiceDateModal';
import { addDaysYmd, formatJalali, todayYmd } from '../../lib/jalali';
import { formatToman, parseToman, toman } from '../../lib/format';

interface NewChequeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onChequeCreated: (cheque: Cheque) => void;
  defaultType?: 'received' | 'paid';
}

const IRANIAN_BANKS = [
  'ملی',
  'ملت',
  'صادرات',
  'تجارت',
  'سپه',
  'کشاورزی',
  'رفاه کارگران',
  'مسکن',
  'پاسارگاد',
  'سامان',
  'پارسیان',
  'شهر',
  'سینا',
  'آینده',
  'توسعه تعاون',
  'مهر ایران',
  'رسالت',
];

export const NewChequeModal: React.FC<NewChequeModalProps> = ({
  isOpen,
  onClose,
  onChequeCreated,
  defaultType = 'received',
}) => {
  const { showNotification } = useNotification();

  const [type, setType] = useState<'received' | 'paid'>(defaultType);
  const [chequeNumber, setChequeNumber] = useState('');
  const [sayadNumber, setSayadNumber] = useState('');
  const [bankName, setBankName] = useState('ملت');
  const [branchName, setBranchName] = useState('');
  const [amount, setAmount] = useState('');

  // Default due date: 30 days from now
  const [dueDate, setDueDate] = useState<string>(() => addDaysYmd(todayYmd(), 30));
  const [isDueModalOpen, setIsDueModalOpen] = useState(false);

  const [issueDate, setIssueDate] = useState<string>(todayYmd);
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);

  const [partyName, setPartyName] = useState('');
  const [partyPhone, setPartyPhone] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [drawerName, setDrawerName] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [notes, setNotes] = useState('');

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setType(defaultType);
      loadCustomers();
    }
  }, [isOpen, defaultType]);

  const loadCustomers = async () => {
    try {
      const data = await customersService.getAll();
      setCustomers(data);
    } catch {
      // ignore
    }
  };

  const handleCustomerSelect = (custId: string) => {
    setSelectedCustomerId(custId);
    const c = customers.find((x) => x._id === custId);
    if (c) {
      setPartyName(c.name);
      setPartyPhone(c.phoneNumber || '');
      setDrawerName(c.name);
    }
  };

  const handleSubmit = async () => {
    if (!chequeNumber.trim()) {
      showNotification({
        title: 'شماره سریال چک',
        message: 'لطفاً شماره سریال یا پیگیری چک را وارد کنید.',
        type: 'warning',
      });
      return;
    }

    const numAmount = Number(amount.replace(/[^0-9]/g, '')) || 0;
    if (numAmount < 1000) {
      showNotification({
        title: 'مبلغ چک',
        message: 'لطفاً مبلغ معتبر برای چک وارد کنید.',
        type: 'warning',
      });
      return;
    }

    if (!partyName.trim()) {
      showNotification({
        title: 'طرف حساب',
        message: 'لطفاً نام پرداخت‌کننده یا دریافت‌کننده چک را وارد نمایید.',
        type: 'warning',
      });
      return;
    }

    try {
      setSubmitting(true);
      const res = await chequesService.create({
        type,
        chequeNumber: chequeNumber.trim(),
        sayadNumber: sayadNumber.trim(),
        bankName,
        branchName: branchName.trim(),
        amount: numAmount,
        dueDate,
        issueDate,
        customerId: selectedCustomerId || undefined,
        partyName: partyName.trim(),
        partyPhone: partyPhone.trim(),
        drawerName: drawerName.trim(),
        invoiceNumber: invoiceNumber.trim(),
        notes: notes.trim(),
        status: 'pending',
      });

      showNotification({
        title: 'چک صیادی با موفقیت ثبت شد',
        message: `چک شماره ${res.chequeNumber} به مبلغ ${formatToman(res.amount)} ثبت گردید.`,
        type: 'success',
      });

      onChequeCreated(res);
      onClose();
    } catch (err: any) {
      const msg = err.response?.data?.message || 'خطا در ثبت چک';
      showNotification({
        title: 'خطای ثبت چک',
        message: Array.isArray(msg) ? msg.join(' - ') : msg,
        type: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <IonModal isOpen={isOpen} onDidDismiss={onClose} className="new-cheque-modal">
      <IonHeader className="ion-no-border">
        <IonToolbar className="bg-white/95 backdrop-blur-md px-3 py-2 border-b border-sky-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
                <CreditCard className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-800">ثبت چک صیادی جدید</h2>
                <span className="text-[10px] text-slate-400">سامانه مدیریت چک و یادآوری سررسید</span>
              </div>
            </div>
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
        <div className="p-3 space-y-3 max-w-lg mx-auto pb-6">
          {/* Type Selector (Received vs Paid) */}
          <div className="bg-slate-200/80 p-1 rounded-2xl grid grid-cols-2 gap-1 text-xs">
            <button
              type="button"
              onClick={() => setType('received')}
              className={`py-2 rounded-xl text-center font-medium transition ${
                type === 'received'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              📥 چک دریافتی (از مشتری)
            </button>
            <button
              type="button"
              onClick={() => setType('paid')}
              className={`py-2 rounded-xl text-center font-medium transition ${
                type === 'paid'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              📤 چک پرداختی (به تامین‌کننده)
            </button>
          </div>

          {/* Cheque Specifications */}
          <div className="bg-white rounded-2xl p-3 border border-sky-100 shadow-sm space-y-3">
            <span className="text-xs font-semibold text-slate-700 block border-b border-slate-100 pb-2">
              مشخصات چک صیادی
            </span>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[11px] font-medium text-slate-600 mb-1 block">
                  شماره سریال چک *
                </label>
                <input
                  type="text"
                  dir="ltr"
                  placeholder="مثال: 782914"
                  value={chequeNumber}
                  onChange={(e) => setChequeNumber(e.target.value)}
                  className="w-full h-10 px-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-mono text-left focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-600 mb-1 block">
                  شناسه ۱۶ رقمی صیادی
                </label>
                <input
                  type="text"
                  dir="ltr"
                  maxLength={16}
                  placeholder="2981..."
                  value={sayadNumber}
                  onChange={(e) => setSayadNumber(e.target.value)}
                  className="w-full h-10 px-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-mono text-left focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>

            {/* Amount */}
            <div>
              <label className="text-[11px] font-medium text-slate-600 mb-1 block">
                مبلغ چک (تومان) *
              </label>
              <input
                type="text"
                dir="ltr"
                inputMode="numeric"
                placeholder="۲۵٬۰۰۰٬۰۰۰"
                value={amount ? toman(Number(amount)) : ''}
                onChange={(e) => {
                  const v = parseToman(e.target.value);
                  setAmount(v ? String(v) : '');
                }}
                className="w-full h-11 px-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm font-bold text-left focus:outline-none focus:border-purple-500"
              />
            </div>

            {/* Bank and Branch */}
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[11px] font-medium text-slate-600 mb-1 block">نام بانک *</label>
                <select
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className="w-full h-10 px-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs focus:outline-none focus:border-purple-500"
                >
                  {IRANIAN_BANKS.map((b) => (
                    <option key={b} value={b}>
                      بانک {b}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-600 mb-1 block">شعبه / کد شعبه</label>
                <input
                  type="text"
                  placeholder="مرکزی"
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                  className="w-full h-10 px-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>

            {/* Dates: Due Date and Issue Date */}
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <div>
                <label className="text-[11px] font-medium text-purple-800 mb-1 block">
                  📅 تاریخ سررسید (موعد وصول) *
                </label>
                <button
                  type="button"
                  onClick={() => setIsDueModalOpen(true)}
                  className="w-full h-10 px-3 rounded-2xl bg-purple-50 border border-purple-200 text-purple-900 text-xs font-mono font-semibold flex items-center justify-between"
                >
                  <span>{formatJalali(dueDate)}</span>
                  <Calendar className="w-3.5 h-3.5 text-purple-600" />
                </button>
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-600 mb-1 block">تاریخ صدور چک</label>
                <button
                  type="button"
                  onClick={() => setIsIssueModalOpen(true)}
                  className="w-full h-10 px-3 rounded-2xl bg-slate-50 border border-slate-200 text-slate-700 text-xs font-mono flex items-center justify-between"
                >
                  <span>{formatJalali(issueDate)}</span>
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                </button>
              </div>
            </div>
          </div>

          {/* Party and Drawer Details */}
          <div className="bg-white rounded-2xl p-3 border border-sky-100 shadow-sm space-y-3">
            <span className="text-xs font-semibold text-slate-700 block border-b border-slate-100 pb-2">
              {type === 'received' ? 'اطلاعات مشتری و صادرکننده' : 'اطلاعات تامین‌کننده'}
            </span>

            {type === 'received' && (
              <div>
                <label className="text-[11px] font-medium text-slate-600 mb-1 block">
                  انتخاب سریع از لیست مشتریان:
                </label>
                <select
                  value={selectedCustomerId}
                  onChange={(e) => handleCustomerSelect(e.target.value)}
                  className="w-full h-10 px-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs focus:outline-none focus:border-purple-500"
                >
                  <option value="">-- مشتری متفرقه / ثبت دستی نام --</option>
                  {customers.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name} {c.phoneNumber ? `(${c.phoneNumber})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[11px] font-medium text-slate-600 mb-1 block">
                  نام طرف حساب *
                </label>
                <input
                  type="text"
                  placeholder={type === 'received' ? 'نام مشتری' : 'نام تامین‌کننده'}
                  value={partyName}
                  onChange={(e) => setPartyName(e.target.value)}
                  className="w-full h-10 px-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-600 mb-1 block">شماره تماس</label>
                <input
                  type="tel"
                  dir="ltr"
                  placeholder="091..."
                  value={partyPhone}
                  onChange={(e) => setPartyPhone(e.target.value)}
                  className="w-full h-10 px-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-left focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[11px] font-medium text-slate-600 mb-1 block">
                  صاحب حساب / صادرکننده
                </label>
                <input
                  type="text"
                  placeholder="نام درج شده روی چک"
                  value={drawerName}
                  onChange={(e) => setDrawerName(e.target.value)}
                  className="w-full h-10 px-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-600 mb-1 block">
                  شماره فاکتور مرتبط
                </label>
                <input
                  type="text"
                  placeholder="INV-..."
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  className="w-full h-10 px-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-mono focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-medium text-slate-600 mb-1 block">توضیحات و بابت</label>
              <textarea
                rows={2}
                placeholder="توضیحات اختیاری، وضعیت ثبت در سامانه صیاد..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full p-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>

          {/* Submit */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className={`w-full h-12 rounded-2xl text-white font-medium text-xs shadow-lg flex items-center justify-center gap-2 active:scale-95 transition ${
              type === 'received'
                ? 'bg-purple-600 hover:bg-purple-700 shadow-purple-600/25'
                : 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/25'
            }`}
          >
            <Save className="w-4 h-4" />
            <span>ثبت نهایی چک صیادی</span>
          </button>
        </div>

        <LoadingOverlay isOpen={submitting} message="در حال ثبت چک صیادی..." />

        {/* Due Date Modal */}
        <InvoiceDateModal
          isOpen={isDueModalOpen}
          currentDate={dueDate}
          title="تاریخ سررسید چک"
          onClose={() => setIsDueModalOpen(false)}
          onSelectDate={(newDate) => setDueDate(newDate)}
        />

        {/* Issue Date Modal */}
        <InvoiceDateModal
          isOpen={isIssueModalOpen}
          currentDate={issueDate}
          title="تاریخ صدور چک"
          onClose={() => setIsIssueModalOpen(false)}
          onSelectDate={(newDate) => setIssueDate(newDate)}
        />
      </IonContent>
    </IonModal>
  );
};
