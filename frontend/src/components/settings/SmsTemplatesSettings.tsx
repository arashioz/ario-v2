import React, { useEffect, useRef, useState } from 'react';
import { MessageSquareText, RotateCcw, Save } from 'lucide-react';
import {
  DEFAULT_SMS_TEMPLATES,
  SMS_PLACEHOLDERS,
  SMS_TEMPLATE_LABELS,
  settingsService,
  type AppSettings,
  type SmsTemplateKey,
} from '../../services/settings.service';
import { apiErrorMessage } from '../../services/invoices.service';
import { useNotification } from '../../context/NotificationContext';
import { sampleSms } from '../../lib/sms';

const KEYS: SmsTemplateKey[] = ['invoice', 'proforma', 'debt'];

export const SmsTemplatesSettings: React.FC<{ settings: AppSettings; isAdmin: boolean }> = ({ settings, isAdmin }) => {
  const { showNotification } = useNotification();
  const [key, setKey] = useState<SmsTemplateKey>('invoice');
  const [draft, setDraft] = useState(settings.smsTemplates);
  const [saving, setSaving] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => setDraft(settings.smsTemplates), [settings.smsTemplates]);

  const text = draft[key];
  const dirty = text !== settings.smsTemplates[key];

  const insert = (ph: string) => {
    const el = area.current;
    const token = `{${ph}}`;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = text.slice(0, start) + token + text.slice(end);
    setDraft((d) => ({ ...d, [key]: next }));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const save = async (value: string) => {
    try {
      setSaving(true);
      await settingsService.update({ smsTemplates: { [key]: value === DEFAULT_SMS_TEMPLATES[key] ? '' : value } });
      showNotification({ title: 'ذخیره شد', message: `${SMS_TEMPLATE_LABELS[key]} به‌روز شد.`, type: 'success' });
    } catch (err) {
      showNotification({ title: 'ذخیره نشد', message: apiErrorMessage(err, 'خطا در ذخیره قالب'), type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="bg-white rounded-3xl border border-slate-100 shadow-sm p-4 space-y-3">
      <h2 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
        <MessageSquareText className="w-4 h-4 text-sky-600" /> قالب پیامک‌ها
      </h2>
      <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-slate-100">
        {KEYS.map((k) => (
          <button
            key={k}
            onClick={() => setKey(k)}
            className={`py-2 rounded-xl text-[10px] font-bold leading-4 transition ${key === k ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-500'}`}
          >
            {k === 'invoice' ? 'فاکتور' : k === 'proforma' ? 'پیش‌فاکتور' : 'گزارش حساب مشتری'}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-slate-400 leading-5">
        روی هر مورد بزنید تا در متن اضافه شود. خطی که مقدارش خالی باشد (مثلاً تخفیف نداشته باشد) خودکار حذف می‌شود.
      </p>
      <div className="flex flex-wrap gap-1">
        {SMS_PLACEHOLDERS[key].map(([ph, label]) => (
          <button
            key={ph}
            disabled={!isAdmin}
            onClick={() => insert(ph)}
            className="px-2 py-1 rounded-lg bg-sky-50 text-sky-700 text-[10px] font-bold border border-sky-100 disabled:opacity-50"
          >
            {label}
          </button>
        ))}
      </div>
      <textarea
        ref={area}
        rows={10}
        disabled={!isAdmin}
        value={text}
        onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
        className="w-full px-3 py-2.5 rounded-2xl border border-slate-200 text-xs leading-6 focus:outline-none focus:border-sky-400 disabled:bg-slate-50"
      />
      <div className="rounded-2xl bg-emerald-50/60 border border-emerald-100 p-3">
        <div className="text-[10px] font-bold text-emerald-800 mb-1">پیش‌نمایش با اطلاعات نمونه</div>
        <pre className="text-[11px] text-slate-700 whitespace-pre-wrap font-[inherit] leading-6">{sampleSms(key, settings, text)}</pre>
      </div>
      {isAdmin && (
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => setDraft((d) => ({ ...d, [key]: DEFAULT_SMS_TEMPLATES[key] }))}
            className="py-2.5 rounded-2xl bg-slate-100 text-slate-600 text-[11px] font-bold flex items-center justify-center gap-1"
          >
            <RotateCcw className="w-3.5 h-3.5" /> متن پیش‌فرض
          </button>
          <button
            onClick={() => save(text)}
            disabled={saving || !dirty || !text.trim()}
            className="col-span-2 py-2.5 rounded-2xl bg-sky-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-40"
          >
            <Save className="w-4 h-4" /> {saving ? 'در حال ذخیره…' : 'ذخیره قالب'}
          </button>
        </div>
      )}
    </section>
  );
};
