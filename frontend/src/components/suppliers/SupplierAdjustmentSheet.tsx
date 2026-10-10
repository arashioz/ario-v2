import React, { useEffect, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { Sheet } from '../ui/Sheet';
import { AmountInput } from '../ui/AmountInput';
import { JalaliDateField } from '../ui/JalaliDatePicker';
import { suppliersService } from '../../services/suppliers.service';
import type { SupplierAccount, SupplierAdjustmentRow } from '../../services/suppliers.service';
import { apiErrorMessage } from '../../services/invoices.service';
import { useNotification } from '../../context/NotificationContext';
import { dateToYmd, todayYmd } from '../../lib/jalali';
import { formatToman } from '../../lib/format';

interface Props {
  open: boolean;
  supplier: string;
  adjustment: SupplierAdjustmentRow | null;
  debt: number;
  onClose: () => void;
  onSaved: (account: SupplierAccount) => void;
}

export const SupplierAdjustmentSheet: React.FC<Props> = ({ open, supplier, adjustment, debt, onClose, onSaved }) => {
  const { showNotification } = useNotification();
  const [amount, setAmount] = useState(0);
  const [direction, setDirection] = useState<'debit' | 'credit'>('debit');
  const [kind, setKind] = useState<'opening' | 'reconcile'>('reconcile');
  const [date, setDate] = useState(todayYmd());
  const [title, setTitle] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    const signed = adjustment?.amount ?? 0;
    setAmount(Math.abs(signed));
    setDirection(signed < 0 ? 'credit' : 'debit');
    setKind(adjustment?.kind ?? 'reconcile');
    setDate(adjustment ? dateToYmd(new Date(adjustment.date)) : todayYmd());
    setTitle(adjustment?.title ?? '');
    setInvoiceNumber(adjustment?.relatedInvoiceNumber ?? '');
    setNotes(adjustment?.notes ?? '');
    setConfirmDelete(false);
  }, [open, adjustment]);

  const save = async () => {
    if (amount <= 0 || !title.trim()) {
      showNotification({ title: 'تعدیل', message: 'مبلغ و عنوان را وارد کنید.', type: 'warning' });
      return;
    }
    const signed = direction === 'debit' ? amount : -amount;
    setSaving(true);
    try {
      const input = {
        supplier,
        date,
        amount: Math.round(signed),
        kind,
        title: title.trim(),
        notes: notes.trim(),
        relatedInvoiceNumber: invoiceNumber.trim(),
      };
      const res = adjustment
        ? await suppliersService.updateAdjustment(adjustment._id, input)
        : await suppliersService.createAdjustment(input);
      showNotification({
        title: adjustment ? 'تعدیل ویرایش شد' : 'تعدیل ثبت شد',
        message: `بدهی فعلی به ${supplier}: ${formatToman(res.summary.debt)}`,
        type: 'success',
      });
      onSaved(res);
      onClose();
    } catch (err) {
      showNotification({ title: 'خطا', message: apiErrorMessage(err, 'ثبت تعدیل ناموفق بود'), type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!adjustment) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setSaving(true);
    try {
      const res = await suppliersService.removeAdjustment(adjustment._id);
      showNotification({
        title: 'تعدیل برداشته شد',
        message: 'فاکتور و واریز اصلی سر جایش ماند.',
        type: 'success',
      });
      onSaved(res);
      onClose();
    } catch (err) {
      showNotification({ title: 'خطا', message: apiErrorMessage(err, 'حذف تعدیل ناموفق بود'), type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      title={adjustment ? 'ویرایش تعدیل' : 'ثبت تعدیل حساب'}
      subtitle={`${supplier} · بدهی فعلی ${formatToman(debt)}`}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          {adjustment && (
            <button
              type="button"
              onClick={remove}
              disabled={saving}
              className={`px-3 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-1 ${confirmDelete ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-600'}`}
            >
              <Trash2 className="w-4 h-4" />
              {confirmDelete ? 'حذف شود؟' : 'حذف تعدیل'}
            </button>
          )}
          <button type="button" onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-2xl bg-amber-600 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {adjustment ? 'ذخیره تعدیل' : 'ثبت تعدیل'}
          </button>
        </div>
      }
    >
      <p className="text-[11px] text-slate-500 leading-5">
        تعدیل فقط مانده حساب را جابه‌جا می‌کند. فاکتور و واریز اصلی حذف نمی‌شود. اگر بعداً رسید بانکی پیدا شد، همین تعدیل را بردارید تا سند اصلی دوباره در مانده بیاید.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setDirection('debit')}
          className={`py-2.5 rounded-xl text-xs font-bold border ${direction === 'debit' ? 'bg-rose-600 text-white border-rose-600' : 'bg-white text-slate-600 border-slate-200'}`}
        >
          بدهکارتر می‌شویم
        </button>
        <button
          type="button"
          onClick={() => setDirection('credit')}
          className={`py-2.5 rounded-xl text-xs font-bold border ${direction === 'credit' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200'}`}
        >
          بستانکار می‌شویم
        </button>
      </div>
      <AmountInput value={amount} onChange={setAmount} />
      <JalaliDateField value={date} onChange={setDate} />
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setKind('reconcile')}
          className={`py-2 rounded-xl text-[11px] font-bold border ${kind === 'reconcile' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200'}`}
        >
          تعدیل مغایرت
        </button>
        <button
          type="button"
          onClick={() => setKind('opening')}
          className={`py-2 rounded-xl text-[11px] font-bold border ${kind === 'opening' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200'}`}
        >
          افتتاحیه
        </button>
      </div>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="عنوان، مثلاً تعدیل فی فاکتور ۲۰۹"
        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs"
      />
      <input
        value={invoiceNumber}
        onChange={(e) => setInvoiceNumber(e.target.value)}
        placeholder="شماره فاکتور اپ، اگر به سندی وصل است"
        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-mono"
      />
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="شرح تفاوت با دفتر شرکت"
        rows={4}
        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs leading-5"
      />
    </Sheet>
  );
};
