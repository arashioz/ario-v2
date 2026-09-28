import React, { useEffect, useState } from 'react';
import { Sheet } from '../ui/Sheet';
import { AmountInput } from '../ui/AmountInput';
import { invoicesService, apiErrorMessage } from '../../services/invoices.service';
import type { Invoice } from '../../services/invoices.service';
import { PAYMENT_METHOD_LABELS } from '../../services/customers.service';
import type { PaymentMethod } from '../../services/customers.service';
import { useNotification } from '../../context/NotificationContext';
import { useSettings } from '../../services/settings.service';
import { AccountPicker, defaultAccountId } from '../ui/AccountPicker';
import { formatToman } from '../../lib/format';

interface Props {
  invoice: Invoice | null;
  onClose: () => void;
  onPaid: (updated: Invoice) => void;
}

export const InvoicePaymentSheet: React.FC<Props> = ({ invoice, onClose, onPaid }) => {
  const { showNotification } = useNotification();
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<PaymentMethod>('transfer');
  const [note, setNote] = useState('');
  const [accountId, setAccountId] = useState('');
  const [saving, setSaving] = useState(false);
  const { bankCards } = useSettings();

  useEffect(() => {
    if (invoice) {
      setAmount(invoice.remainingDebt);
      setMethod('transfer');
      setNote('');
      setAccountId(defaultAccountId(bankCards));
    }
  }, [invoice]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!invoice) return null;

  const isCard = method === 'pos' || method === 'transfer';
  const needsAccount = isCard && bankCards.length > 0 && !accountId;

  const submit = async () => {
    if (amount <= 0 || amount > invoice.remainingDebt || needsAccount) return;
    try {
      setSaving(true);
      const updated = await invoicesService.addPayment(invoice._id, {
        amount,
        paymentMethod: method,
        description: note || undefined,
        accountId: isCard ? accountId || undefined : undefined,
      });
      showNotification({
        title: 'پرداخت ثبت شد',
        message: `${formatToman(amount)} روی فاکتور ${invoice.invoiceNumber}${invoice.customerId ? ' و حساب مشتری' : ''} ثبت شد.${
          amount === invoice.remainingDebt ? ' فاکتور تسویه شد.' : ''
        }`,
        type: 'success',
      });
      onPaid(updated);
    } catch (err) {
      showNotification({ title: 'خطا', message: apiErrorMessage(err, 'ثبت پرداخت انجام نشد'), type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="ثبت پرداخت فاکتور"
      subtitle={`${invoice.invoiceNumber} — ${invoice.customerName}`}
      footer={
        <button
          onClick={submit}
          disabled={saving || amount <= 0 || amount > invoice.remainingDebt || needsAccount}
          className="w-full py-3 rounded-2xl bg-sky-600 text-white text-sm font-bold disabled:opacity-40 active:scale-[0.98] transition"
        >
          {saving ? 'در حال ثبت…' : needsAccount ? 'حساب واریز را انتخاب کنید' : 'ثبت پرداخت'}
        </button>
      }
    >
      <div className="flex items-center justify-between text-xs bg-rose-50 text-rose-700 rounded-2xl px-4 py-3">
        <span>مانده این فاکتور</span>
        <span className="font-mono font-bold">{formatToman(invoice.remainingDebt)}</span>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-bold text-slate-700">مبلغ دریافتی</label>
          <div className="flex items-center gap-3">
            <button onClick={() => setAmount(Math.round(invoice.remainingDebt / 2))} className="text-[11px] text-slate-500 font-bold">
              نصف
            </button>
            <button onClick={() => setAmount(invoice.remainingDebt)} className="text-[11px] text-sky-600 font-bold">
              تسویه کامل
            </button>
          </div>
        </div>
        <AmountInput value={amount} onChange={setAmount} autoFocus />
        {amount > invoice.remainingDebt && (
          <p className="text-[11px] text-rose-600 mt-1">مبلغ از مانده فاکتور بیشتر است.</p>
        )}
      </div>

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

      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="توضیح (اختیاری)"
        className="w-full px-4 py-2.5 rounded-2xl border border-slate-200 text-xs focus:outline-none focus:border-sky-500"
      />
    </Sheet>
  );
};
