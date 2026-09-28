import React, { useState, useEffect } from 'react';
import { Sheet } from '../ui/Sheet';
import { AmountInput } from '../ui/AmountInput';
import { customersService, PAYMENT_METHOD_LABELS } from '../../services/customers.service';
import type { Customer, PaymentMethod, CustomerTransaction } from '../../services/customers.service';
import { apiErrorMessage } from '../../services/invoices.service';
import { useNotification } from '../../context/NotificationContext';
import { useSettings } from '../../services/settings.service';
import { AccountPicker, defaultAccountId } from '../ui/AccountPicker';
import { formatToman } from '../../lib/format';

type Kind = 'payment' | 'debt';

interface RecordTransactionModalProps {
  isOpen: boolean;
  customer: Customer | null;
  initialType?: Kind;
  onClose: () => void;
  onSuccess: (updatedCustomer: Customer, transaction: CustomerTransaction) => void;
}

/** General customer ledger entry: a payment (spread over oldest open invoices) or a manual personal debt. */
export const RecordTransactionModal: React.FC<RecordTransactionModalProps> = ({
  isOpen,
  customer,
  initialType,
  onClose,
  onSuccess,
}) => {
  const { showNotification } = useNotification();
  const [saving, setSaving] = useState(false);
  const [type, setType] = useState<Kind>('payment');
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<PaymentMethod>('transfer');
  const [description, setDescription] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [accountId, setAccountId] = useState('');
  const { bankCards } = useSettings();

  useEffect(() => {
    if (customer && isOpen) {
      setType(initialType ?? (customer.balance > 0 ? 'payment' : 'debt'));
      setAmount(0);
      setMethod('transfer');
      setDescription('');
      setReferenceNumber('');
      setAccountId(defaultAccountId(bankCards));
    }
  }, [customer, isOpen, initialType]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!customer || !isOpen) return null;

  const isPayment = type === 'payment';
  const projected = customer.balance + (isPayment ? -amount : amount);
  const isCard = isPayment && (method === 'pos' || method === 'transfer');
  const needsAccount = isCard && bankCards.length > 0 && !accountId;

  const submit = async () => {
    if (amount <= 0 || needsAccount) return;
    if (!isPayment && !description.trim()) {
      showNotification({ title: 'بابت بدهی', message: 'لطفاً بنویسید این بدهی بابت چیست.', type: 'warning' });
      return;
    }
    setSaving(true);
    try {
      const res = await customersService.recordTransaction(customer._id, {
        type,
        amount,
        paymentMethod: isPayment ? method : undefined,
        accountId: isCard ? accountId || undefined : undefined,
        referenceNumber: referenceNumber.trim() || undefined,
        description: description.trim() || undefined,
      });
      showNotification({
        title: isPayment ? 'دریافت ثبت شد' : 'بدهی ثبت شد',
        message: `${formatToman(amount)} برای ${customer.name} ثبت شد.`,
        type: 'success',
      });
      onSuccess(res.customer, res.transaction);
      onClose();
    } catch (err) {
      showNotification({ title: 'خطا', message: apiErrorMessage(err, 'ثبت انجام نشد'), type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={isPayment ? 'دریافت وجه از مشتری' : 'ثبت بدهی دستی'}
      subtitle={customer.name}
      footer={
        <button
          onClick={submit}
          disabled={saving || amount <= 0 || needsAccount}
          className={`w-full py-3 rounded-2xl text-white text-sm font-bold disabled:opacity-40 active:scale-[0.98] transition ${
            isPayment ? 'bg-emerald-600' : 'bg-rose-600'
          }`}
        >
          {saving ? 'در حال ثبت…' : needsAccount ? 'حساب واریز را انتخاب کنید' : isPayment ? 'ثبت دریافت' : 'ثبت بدهی'}
        </button>
      }
    >
      <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-2xl">
        {(['payment', 'debt'] as Kind[]).map((k) => (
          <button
            key={k}
            onClick={() => setType(k)}
            className={`py-2 rounded-xl text-xs font-bold transition ${
              type === k ? 'bg-white shadow-sm ' + (k === 'payment' ? 'text-emerald-700' : 'text-rose-700') : 'text-slate-500'
            }`}
          >
            {k === 'payment' ? 'دریافت وجه' : 'بدهی دستی'}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between text-xs bg-slate-50 rounded-2xl px-4 py-3">
        <span className="text-slate-500">مانده فعلی</span>
        <span className={`font-mono font-bold ${customer.balance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
          {formatToman(Math.abs(customer.balance))} {customer.balance < 0 ? '(بستانکار)' : ''}
        </span>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-bold text-slate-700">مبلغ</label>
          {isPayment && customer.balance > 0 && (
            <button onClick={() => setAmount(customer.balance)} className="text-[11px] text-emerald-600 font-bold">
              تسویه کامل
            </button>
          )}
        </div>
        <AmountInput value={amount} onChange={setAmount} autoFocus />
      </div>

      {isPayment && (
        <>
          <div className="grid grid-cols-4 gap-1.5">
            {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => (
              <button
                key={m}
                onClick={() => setMethod(m)}
                className={`py-2 rounded-xl text-[11px] font-bold border transition ${
                  method === m ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-slate-600 border-slate-200'
                }`}
              >
                {PAYMENT_METHOD_LABELS[m]}
              </button>
            ))}
          </div>
          {isCard && <AccountPicker value={accountId} onChange={setAccountId} />}
          <p className="text-[11px] text-slate-400 leading-5">
            این مبلغ به‌ترتیب روی قدیمی‌ترین فاکتورهای نسیه تسویه می‌شود. برای پرداخت یک فاکتور خاص، از دکمه «پرداخت» کنار همان فاکتور استفاده کنید.
          </p>
          <input
            value={referenceNumber}
            onChange={(e) => setReferenceNumber(e.target.value)}
            placeholder="شماره پیگیری / سریال چک (اختیاری)"
            dir="ltr"
            className="w-full px-4 py-2.5 rounded-2xl border border-slate-200 text-xs text-right focus:outline-none focus:border-sky-500"
          />
        </>
      )}

      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder={isPayment ? 'توضیح (اختیاری)' : 'بابت (مثلاً قرض شخصی، مانده حساب قدیم…)'}
        className="w-full px-4 py-2.5 rounded-2xl border border-slate-200 text-xs focus:outline-none focus:border-sky-500"
      />

      {amount > 0 && (
        <div className="flex items-center justify-between text-xs px-1">
          <span className="text-slate-500">مانده پس از ثبت</span>
          <span className={`font-mono font-bold ${projected > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
            {formatToman(Math.abs(projected))} {projected < 0 ? '(بستانکار)' : ''}
          </span>
        </div>
      )}
    </Sheet>
  );
};
