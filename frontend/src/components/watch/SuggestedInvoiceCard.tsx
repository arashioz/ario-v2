import React, { useState } from 'react';
import { FileText, MessageSquare, RefreshCw } from 'lucide-react';
import type { WatchResume, WatchSuggestion } from '../../services/customerWatch.service';
import { customerWatchService as watchService } from '../../services/customerWatch.service';
import { formatToman, weight } from '../../lib/format';
import { openSms, suggestSms } from '../../lib/sms';
import { useSettings } from '../../services/settings.service';
import { useNotification } from '../../context/NotificationContext';
import { apiErrorMessage } from '../../services/invoices.service';
import { useNavigate } from 'react-router-dom';

export const SuggestedInvoiceCard: React.FC<{
  customerId: string;
  resume: WatchResume;
  onChanged?: () => void;
}> = ({ customerId, resume, onChanged }) => {
  const settings = useSettings();
  const { showNotification } = useNotification();
  const navigate = useNavigate();
  const [busy, setBusy] = useState('');
  const [suggestion, setSuggestion] = useState<WatchSuggestion>(resume.suggestion);

  const reload = async (source?: string, invoiceId?: string) => {
    setBusy(source || 'load');
    try {
      setSuggestion(await watchService.suggest(customerId, { source, invoiceId }));
    } catch (err) {
      showNotification({ title: 'پیشنهاد ساخته نشد', message: apiErrorMessage(err, 'دوباره تلاش کنید'), type: 'error' });
    } finally {
      setBusy('');
    }
  };

  const toProforma = async () => {
    setBusy('proforma');
    try {
      const doc = await watchService.toProforma(customerId, { source: suggestion.source, invoiceId: suggestion.source === 'invoice' ? resume.lastInvoiceId : undefined });
      showNotification({ title: 'پیش‌فاکتور ساخته شد', message: doc.number, type: 'success' });
      onChanged?.();
      navigate('/proformas');
    } catch (err) {
      showNotification({ title: 'پیش‌فاکتور نشد', message: apiErrorMessage(err, 'ثبت پیش‌فاکتور انجام نشد'), type: 'error' });
    } finally {
      setBusy('');
    }
  };

  const sms = async () => {
    await openSms(resume.customer.phoneNumber, suggestSms(resume.customer, suggestion, settings));
  };

  return (
    <section className="bg-white rounded-2xl border border-sky-100 shadow-sm overflow-hidden">
      <div className="px-3.5 py-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-[13px] font-bold text-slate-800">فاکتور پیشنهادی</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">{suggestion.sourceLabel}</p>
        </div>
        <span className="text-[11px] font-mono text-slate-500">دراپ {weight(suggestion.dropKg)}</span>
      </div>
      <div className="px-3.5 pb-2 flex flex-wrap gap-1">
        {([
          ['mix', 'ترکیبی'],
          ['last', 'آخرین فاکتور'],
          ['top', 'پرمصرف'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            disabled={!!busy}
            onClick={() => void reload(id)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${suggestion.source === id ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600'}`}
          >
            {label}
          </button>
        ))}
        {resume.lastInvoiceId && (
          <button type="button" disabled={!!busy} onClick={() => void reload('invoice', resume.lastInvoiceId)} className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-50 text-emerald-800">
            فعال‌کردن {resume.lastInvoiceNumber || 'فاکتور قبلی'}
          </button>
        )}
      </div>
      <div className="divide-y divide-slate-100 border-t border-slate-100">
        {suggestion.items.length === 0 ? (
          <p className="px-3.5 py-3 text-[12px] text-slate-400">خریدی برای پیشنهاد نیست.</p>
        ) : suggestion.items.map((item) => (
          <div key={item.productId} className="px-3.5 py-2 flex items-center justify-between gap-2 text-right">
            <span className="min-w-0">
              <span className="block text-[13px] font-bold text-slate-800 truncate">{item.productName}</span>
              <span className="block text-[11px] text-slate-400 font-mono">{item.quantity} {item.unit} · {weight(item.weightKg || 0)}</span>
            </span>
            <span className="text-[12px] font-bold font-mono text-slate-700">{formatToman(item.totalPrice)}</span>
          </div>
        ))}
      </div>
      <div className="px-3.5 py-3 border-t border-slate-100 flex items-center justify-between">
        <span className="text-[12px] text-slate-500">{weight(suggestion.totalWeightKg)}</span>
        <span className="text-[14px] font-black font-mono text-slate-900">{formatToman(suggestion.totalAmount)}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 p-3 pt-0">
        <button type="button" disabled={!!busy || !suggestion.items.length} onClick={() => void toProforma()} className="py-2.5 rounded-xl bg-slate-900 text-white text-[12px] font-bold disabled:opacity-40 flex items-center justify-center gap-1.5">
          <FileText className="w-3.5 h-3.5" />
          {busy === 'proforma' ? 'ثبت…' : 'تبدیل به پیش‌فاکتور'}
        </button>
        <button type="button" disabled={!suggestion.items.length} onClick={() => void sms()} className="py-2.5 rounded-xl bg-sky-50 text-sky-800 text-[12px] font-bold flex items-center justify-center gap-1.5">
          <MessageSquare className="w-3.5 h-3.5" />
          پیامک پیشنهاد
        </button>
      </div>
      {busy && busy !== 'proforma' && (
        <div className="px-3.5 pb-3 text-[11px] text-slate-400 flex items-center gap-1">
          <RefreshCw className="w-3 h-3 animate-spin" /> در حال ساخت پیشنهاد…
        </div>
      )}
    </section>
  );
};
