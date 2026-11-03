import React, { useState } from 'react';
import { settingsService, useSettings } from '../../services/settings.service';
import { TargetFields } from '../target/TargetFields';
import { useNotification } from '../../context/NotificationContext';
import { apiErrorMessage } from '../../services/invoices.service';

export const SalesTargetSettings: React.FC = () => {
  const settings = useSettings();
  const { showNotification } = useNotification();
  const [amount, setAmount] = useState(settings.salesTarget?.amount || 0);
  const [kg, setKg] = useState(settings.salesTarget?.kg || 0);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await settingsService.update({ salesTarget: { amount, kg } });
      showNotification({ title: 'تارگت فروشگاه ذخیره شد', message: 'هدف ماه جاری برای کل آریو ثبت شد.', type: 'success' });
    } catch (err) {
      showNotification({ title: 'ذخیره نشد', message: apiErrorMessage(err, 'تارگت فروشگاه ذخیره نشد'), type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl bg-white border border-slate-200 p-3 space-y-3">
      <div>
        <h2 className="text-sm font-bold text-slate-800">تارگت فروش آریو</h2>
        <p className="text-[11px] text-slate-500 mt-0.5 leading-5">هدف ماه جاری کل فروشگاه. تارگت هر بازاریاب را از ماژول تارگت یا صفحه کاربران بگذارید.</p>
      </div>
      <TargetFields value={{ amount, kg }} onChange={(next) => { setAmount(next.amount); setKg(next.kg); }} />
      <button type="button" disabled={saving} onClick={() => void save()} className="w-full py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold disabled:opacity-50">
        {saving ? 'در حال ذخیره…' : 'ذخیره تارگت فروشگاه'}
      </button>
    </section>
  );
};
