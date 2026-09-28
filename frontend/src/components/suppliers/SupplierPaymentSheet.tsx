import React, { useEffect, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { Sheet } from '../ui/Sheet';
import { AmountInput } from '../ui/AmountInput';
import { JalaliDateField } from '../ui/JalaliDatePicker';
import { suppliersService, SUPPLIER_METHOD_LABELS, formatAccountNumber } from '../../services/suppliers.service';
import type { SupplierAccount, SupplierBankAccount, SupplierPaymentMethod, SupplierPaymentRow } from '../../services/suppliers.service';
import { apiErrorMessage } from '../../services/invoices.service';
import { useNotification } from '../../context/NotificationContext';
import { dateToYmd, todayYmd } from '../../lib/jalali';
import { formatToman } from '../../lib/format';

interface Props {
  open: boolean;
  supplier: string;
  /** Existing payment to edit; null = new payment. */
  payment: SupplierPaymentRow | null;
  destinations: string[];
  /** The company's registered bank accounts, offered as one-tap destinations. */
  accounts?: SupplierBankAccount[];
  debt: number;
  onClose: () => void;
  onSaved: (account: SupplierAccount) => void;
}

const METHODS: SupplierPaymentMethod[] = ['card_to_card', 'card', 'transfer', 'cash', 'cheque'];

export const SupplierPaymentSheet: React.FC<Props> = ({ open, supplier, payment, destinations, accounts = [], debt, onClose, onSaved }) => {
  const { showNotification } = useNotification();
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(todayYmd());
  const [method, setMethod] = useState<SupplierPaymentMethod>('card_to_card');
  const [destination, setDestination] = useState('');
  const [account, setAccount] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAmount(payment?.amount ?? 0);
    setDate(payment ? dateToYmd(new Date(payment.date)) : todayYmd());
    setMethod(payment?.method ?? 'card_to_card');
    setDestination(payment?.destination ?? destinations[0] ?? '');
    setAccount(payment?.destinationAccount ?? '');
    setNotes(payment?.notes ?? '');
    setConfirmDelete(false);
  }, [open, payment, destinations]);

  const save = async () => {
    if (amount <= 0) {
      showNotification({ title: 'مبلغ', message: 'مبلغ پرداخت را وارد کنید.', type: 'warning' });
      return;
    }
    setSaving(true);
    try {
      const input = { supplier, amount, date, method, destination: destination.trim(), destinationAccount: account.trim(), notes: notes.trim() };
      const res = payment ? await suppliersService.updatePayment(payment._id, input) : await suppliersService.createPayment(input);
      showNotification({
        title: payment ? 'پرداخت ویرایش شد' : 'پرداخت ثبت شد',
        message: `بدهی فعلی به ${supplier}: ${formatToman(res.summary.debt)}`,
        type: 'success',
      });
      onSaved(res);
      onClose();
    } catch (err) {
      showNotification({ title: 'خطا', message: apiErrorMessage(err, 'ثبت پرداخت ناموفق بود'), type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!payment) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setSaving(true);
    try {
      const res = await suppliersService.removePayment(payment._id);
      showNotification({ title: 'پرداخت حذف شد', message: `بدهی فعلی: ${formatToman(res.summary.debt)}`, type: 'success' });
      onSaved(res);
      onClose();
    } catch (err) {
      showNotification({ title: 'خطا', message: apiErrorMessage(err, 'حذف پرداخت ناموفق بود'), type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      title={payment ? 'ویرایش پرداخت' : 'ثبت پرداخت به شرکت'}
      subtitle={`${supplier} · بدهی فعلی ${formatToman(debt)}`}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          {payment && (
            <button
              onClick={remove}
              disabled={saving}
              className={`px-3 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-1 ${confirmDelete ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-600'}`}
            >
              <Trash2 className="w-4 h-4" />
              {confirmDelete ? 'حذف شود؟' : 'حذف'}
            </button>
          )}
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 py-2.5 rounded-2xl bg-emerald-600 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {payment ? 'ذخیره تغییرات' : 'ثبت پرداخت'}
          </button>
        </div>
      }
    >
      <div className="space-y-1.5">
        <label className="text-[11px] font-bold text-slate-600">مبلغ</label>
        <AmountInput value={amount} onChange={setAmount} autoFocus={!payment} />
        {!payment && debt > 0 && (
          <button onClick={() => setAmount(debt)} className="text-[10px] text-sky-600 font-bold">
            کل بدهی ({formatToman(debt)})
          </button>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="text-[11px] font-bold text-slate-600">تاریخ پرداخت</label>
        <JalaliDateField value={date} onChange={setDate} title="تاریخ پرداخت" max={todayYmd()} />
      </div>

      <div className="space-y-1.5">
        <label className="text-[11px] font-bold text-slate-600">روش پرداخت</label>
        <div className="flex flex-wrap gap-1.5">
          {METHODS.map((m) => (
            <button
              key={m}
              onClick={() => setMethod(m)}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-bold ${method === m ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}`}
            >
              {SUPPLIER_METHOD_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-[11px] font-bold text-slate-600">به حساب چه کسی</label>
        <input
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="مثلاً محسن بلالی"
          className="w-full px-3 py-2.5 rounded-2xl border border-slate-200 text-xs focus:outline-none focus:border-sky-500"
        />
        {accounts.length > 0 && (
          <div className="space-y-1">
            {accounts.map((a, i) => {
              const no = a.cardNumber || a.iban || a.accountNumber;
              const active = destination === a.holder && account === no;
              return (
                <button
                  key={i}
                  onClick={() => {
                    setDestination(a.holder);
                    setAccount(no);
                  }}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-[11px] border ${
                    active ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-slate-700 border-slate-200'
                  }`}
                >
                  <span className="font-bold truncate">
                    {a.holder}
                    {a.bank ? ` · ${a.bank}` : ''}
                  </span>
                  <span className="font-mono text-[10px] opacity-80 shrink-0" dir="ltr">
                    {no ? formatAccountNumber(no) : ''}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {destinations.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {destinations.map((d) => (
              <button
                key={d}
                onClick={() => setDestination(d)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${destination === d ? 'bg-sky-600 text-white' : 'bg-sky-50 text-sky-700'}`}
              >
                {d}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="text-[11px] font-bold text-slate-600">شماره کارت / شبا (اختیاری)</label>
        <input
          value={account}
          onChange={(e) => setAccount(e.target.value)}
          dir="ltr"
          className="w-full px-3 py-2.5 rounded-2xl border border-slate-200 text-xs font-mono focus:outline-none focus:border-sky-500"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-[11px] font-bold text-slate-600">توضیحات</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full px-3 py-2.5 rounded-2xl border border-slate-200 text-xs focus:outline-none focus:border-sky-500"
        />
      </div>

      <p className="text-[10px] text-slate-400 leading-5">پرداخت‌ها به ترتیب از قدیمی‌ترین فاکتور خرید باز کم می‌شوند.</p>
    </Sheet>
  );
};
