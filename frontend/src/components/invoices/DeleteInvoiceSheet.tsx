import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Sheet } from '../ui/Sheet';
import { invoicesService, apiErrorMessage } from '../../services/invoices.service';
import type { Invoice } from '../../services/invoices.service';
import { useNotification } from '../../context/NotificationContext';

interface Props {
  invoice: Invoice | null;
  onClose: () => void;
  onDeleted: () => void;
}

export const DeleteInvoiceSheet: React.FC<Props> = ({ invoice, onClose, onDeleted }) => {
  const { showNotification } = useNotification();
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  if (!invoice) return null;
  const isSale = invoice.type === 'sale';

  const submit = async () => {
    try {
      setSaving(true);
      const res = await invoicesService.remove(invoice._id, password);
      showNotification({ title: 'حذف شد', message: res.message, type: 'success' });
      setPassword('');
      onDeleted();
    } catch (err) {
      showNotification({ title: 'حذف نشد', message: apiErrorMessage(err, 'خطا در حذف فاکتور'), type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={`حذف فاکتور ${invoice.invoiceNumber}`}
      footer={
        <button
          onClick={submit}
          disabled={saving || !password}
          className="w-full py-3 rounded-2xl bg-rose-600 text-white text-sm font-bold disabled:opacity-40 active:scale-[0.98] transition"
        >
          {saving ? 'در حال حذف…' : 'حذف قطعی'}
        </button>
      }
    >
      <div className="flex gap-3 bg-amber-50 text-amber-800 rounded-2xl p-3 text-[12px] leading-6">
        <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
        <div>
          {isSale ? (
            <>
              کالاهای این فاکتور به انبار برمی‌گردد
              {invoice.creditAmount ? ' و نسیه آن از حساب مشتری کم می‌شود' : ''}.
              {invoice.paidAmount > 0 && invoice.creditAmount
                ? ' پرداخت‌های انجام‌شده روی این فاکتور در حساب مشتری می‌ماند.'
                : ''}
            </>
          ) : (
            'کالاهای این فاکتور خرید از موجودی انبار کم می‌شود.'
          )}
        </div>
      </div>
      <div>
        <label className="text-xs font-bold text-slate-700 block mb-1.5">رمز عبور حساب خود را وارد کنید</label>
        <input
          type="password"
          value={password}
          autoFocus
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && password && submit()}
          className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-sm focus:outline-none focus:border-rose-400"
          dir="ltr"
        />
      </div>
    </Sheet>
  );
};
