import React, { useEffect, useState } from 'react';
import { settingsService, useSettings } from '../../services/settings.service';
import { DEFAULT_WATCH, type CustomerWatchSettings } from '../../services/customerWatch.service';
import { MoneyTextInput } from '../ui/AmountInput';
import { useNotification } from '../../context/NotificationContext';
import { apiErrorMessage } from '../../services/invoices.service';

const Toggle: React.FC<{ label: string; checked: boolean; onChange: (v: boolean) => void }> = ({ label, checked, onChange }) => (
  <button type="button" onClick={() => onChange(!checked)} className="w-full flex items-center justify-between py-2 text-right">
    <span className="text-xs text-slate-700">{label}</span>
    <span className={`w-10 h-6 rounded-full p-0.5 ${checked ? 'bg-sky-600' : 'bg-slate-200'}`}>
      <span className={`block w-5 h-5 rounded-full bg-white shadow ${checked ? '-translate-x-4' : ''}`} />
    </span>
  </button>
);

const Num: React.FC<{ label: string; value: number; onChange: (n: number) => void; money?: boolean }> = ({ label, value, onChange, money }) => (
  <label className="block text-right">
    <span className="text-[10px] text-slate-500 block mb-1">{label}</span>
    {money ? (
      <MoneyTextInput value={value || ''} onChange={(plain) => onChange(Number(plain) || 0)} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-mono" />
    ) : (
      <input
        type="text"
        inputMode="numeric"
        value={value || ''}
        onChange={(e) => onChange(Number(e.target.value.replace(/[^\d]/g, '')) || 0)}
        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-mono"
      />
    )}
  </label>
);

export const WatchSettingsForm: React.FC = () => {
  const settings = useSettings();
  const { showNotification } = useNotification();
  const [form, setForm] = useState<CustomerWatchSettings>({ ...DEFAULT_WATCH, ...(settings.customerWatch || {}) });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({ ...DEFAULT_WATCH, ...(settings.customerWatch || {}) });
  }, [settings.customerWatch]);

  const patch = (partial: Partial<CustomerWatchSettings>) => setForm((prev) => ({ ...prev, ...partial }));

  const save = async () => {
    setSaving(true);
    try {
      await settingsService.update({ customerWatch: form });
      showNotification({ title: 'قوانین پایش ذخیره شد', message: 'اسکن بعدی با همین حدها گرید می‌زند.', type: 'success' });
    } catch (err) {
      showNotification({ title: 'ذخیره نشد', message: apiErrorMessage(err, 'تنظیمات پایش ذخیره نشد'), type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3.5 space-y-3">
      <div>
        <h2 className="text-[13px] font-bold text-slate-800">قوانین گرید و تماس</h2>
        <p className="text-[11px] text-slate-400 mt-0.5 leading-5">استاندارد RFM: ارزش خرید ماه/سال گذشته، تازگی خرید، و دراپ‌سایز سفارش. مبلغ‌ها تومان است.</p>
      </div>
      <div className="text-[11px] font-bold text-slate-500">حد طلایی / نقره‌ای / برنزی · ماه گذشته</div>
      <div className="grid grid-cols-3 gap-2">
        <Num label="طلایی ماه" money value={form.gradeAMonthAmount} onChange={(n) => patch({ gradeAMonthAmount: n })} />
        <Num label="نقره‌ای ماه" money value={form.gradeBMonthAmount} onChange={(n) => patch({ gradeBMonthAmount: n })} />
        <Num label="برنزی ماه" money value={form.gradeCMonthAmount} onChange={(n) => patch({ gradeCMonthAmount: n })} />
      </div>
      <div className="text-[11px] font-bold text-slate-500">حد سال گذشته</div>
      <div className="grid grid-cols-3 gap-2">
        <Num label="طلایی سال" money value={form.gradeAYearAmount} onChange={(n) => patch({ gradeAYearAmount: n })} />
        <Num label="نقره‌ای سال" money value={form.gradeBYearAmount} onChange={(n) => patch({ gradeBYearAmount: n })} />
        <Num label="برنزی سال" money value={form.gradeCYearAmount} onChange={(n) => patch({ gradeCYearAmount: n })} />
      </div>
      <div className="text-[11px] font-bold text-slate-500">روزهای سکوت تا تماس، بر اساس گرید</div>
      <div className="grid grid-cols-4 gap-2">
        <Num label="طلایی" value={form.quietDaysA} onChange={(n) => patch({ quietDaysA: n })} />
        <Num label="نقره‌ای" value={form.quietDaysB} onChange={(n) => patch({ quietDaysB: n })} />
        <Num label="برنزی" value={form.quietDaysC} onChange={(n) => patch({ quietDaysC: n })} />
        <Num label="راکد" value={form.quietDaysD} onChange={(n) => patch({ quietDaysD: n })} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Num label="تعداد فاکتور دراپ‌سایز" value={form.dropSizeInvoices} onChange={(n) => patch({ dropSizeInvoices: n })} />
        <Num label="ریزش دراپ٪" value={form.dropSizeDropPercent} onChange={(n) => patch({ dropSizeDropPercent: n })} />
        <Num label="تعداد کالای پرمصرف" value={form.suggestTopProducts} onChange={(n) => patch({ suggestTopProducts: n })} />
      </div>
      <div>
        <div className="text-[11px] font-bold text-slate-500 mb-1">روش پیشنهاد سفارش</div>
        <div className="grid grid-cols-3 gap-1">
          {([
            ['mix', 'ترکیبی'],
            ['last', 'آخرین فاکتور'],
            ['top', 'پرمصرف'],
          ] as const).map(([id, label]) => (
            <button key={id} type="button" onClick={() => patch({ suggestMode: id })} className={`py-2 rounded-xl text-[11px] font-bold ${form.suggestMode === id ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="divide-y divide-slate-100">
        <Toggle label="تماس برای مشتری ساکت" checked={form.ruleQuiet} onChange={(v) => patch({ ruleQuiet: v })} />
        <Toggle label="تماس برای بدهکار" checked={form.ruleDebt} onChange={(v) => patch({ ruleDebt: v })} />
        <Toggle label="تماس وقتی سفارش از دراپ‌سایز افتاده" checked={form.ruleDropOff} onChange={(v) => patch({ ruleDropOff: v })} />
        <Toggle label="نگهداشت مشتری طلایی/نقره‌ای" checked={form.ruleChampion} onChange={(v) => patch({ ruleChampion: v })} />
        <Toggle label="بعد از اسکن، پیگیری در تقویم بگذار" checked={form.planFollowUp} onChange={(v) => patch({ planFollowUp: v })} />
      </div>
      <Num label="چند روز بعد از اسکن زنگ بزنیم" value={form.planDays} onChange={(n) => patch({ planDays: n })} />
      <button type="button" disabled={saving} onClick={() => void save()} className="w-full py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold disabled:opacity-50">
        {saving ? 'در حال ذخیره…' : 'ذخیره قوانین پایش'}
      </button>
    </section>
  );
};
