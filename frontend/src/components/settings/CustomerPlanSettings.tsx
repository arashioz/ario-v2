import React, { useEffect, useState } from 'react';
import { settingsService, useSettings } from '../../services/settings.service';
import { customersService } from '../../services/customers.service';
import type { Customer } from '../../services/customers.service';
import { formatToman } from '../../lib/format';
import { useNotification } from '../../context/NotificationContext';
import { apiErrorMessage } from '../../services/invoices.service';

type Row = { customer: Customer; invoices: number; amount: number; daysSincePurchase: number };

export const CustomerPlanSettings: React.FC = () => {
  const settings = useSettings();
  const { showNotification } = useNotification();
  const [invoices, setInvoices] = useState(String(settings.loyalty?.championInvoices || 6));
  const [amount, setAmount] = useState(String(settings.loyalty?.championAmount || 20000000));
  const [quiet, setQuiet] = useState(String(settings.loyalty?.quietDays || 21));
  const [planDays, setPlanDays] = useState(String(settings.loyalty?.planDays || 3));
  const [champions, setChampions] = useState<Row[]>([]);
  const [quietRows, setQuietRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const report = await customersService.loyalty();
    setChampions(report.champions);
    setQuietRows(report.quiet);
  };

  useEffect(() => { void load().catch(() => undefined); }, []);

  const save = async () => {
    setSaving(true);
    try {
      await settingsService.update({
        loyalty: {
          championInvoices: Math.max(1, Number(invoices) || 1),
          championAmount: Math.max(0, Number(amount) || 0),
          quietDays: Math.max(1, Number(quiet) || 1),
          planDays: Math.max(1, Number(planDays) || 1),
        },
      });
      await load();
      showNotification({ title: 'برنامه مشتریان ذخیره شد', message: 'رتبه وفاداری با همین حدها دوباره ساخته شد.', type: 'success' });
    } catch (err) {
      showNotification({ title: 'ذخیره نشد', message: apiErrorMessage(err, 'برنامه مشتریان ذخیره نشد'), type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const plan = async () => {
    setSaving(true);
    try {
      const result = await customersService.planLoyalty();
      showNotification({ title: 'تماس برنامه‌ریزی شد', message: `${result.planned.toLocaleString('fa-IR')} مشتری وفادارِ ساکت برای پیگیری گذاشته شد.`, type: 'success' });
    } catch (err) {
      showNotification({ title: 'برنامه نشد', message: apiErrorMessage(err, 'برنامه‌ریزی تماس انجام نشد'), type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl bg-white border border-emerald-100 p-4 space-y-3">
      <h3 className="text-sm font-bold text-slate-800">برنامه مشتریان وفادار</h3>
      <p className="text-[11px] leading-6 text-slate-500">سیستم از روی تعداد فاکتور و مبلغ خرید، مشتری برتر را جدا می‌کند. اگر مدتی خرید نکند، برای تماس بعدی برنامه‌ریزی می‌شود.</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px] space-y-1"><span>حداقل تعداد فاکتور</span><input className="w-full rounded-xl border p-2" inputMode="numeric" value={invoices} onChange={(e) => setInvoices(e.target.value)} /></label>
        <label className="text-[11px] space-y-1"><span>یا حداقل مبلغ خرید</span><input className="w-full rounded-xl border p-2" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        <label className="text-[11px] space-y-1"><span>روزهای سکوت</span><input className="w-full rounded-xl border p-2" inputMode="numeric" value={quiet} onChange={(e) => setQuiet(e.target.value)} /></label>
        <label className="text-[11px] space-y-1"><span>تماس تا چند روز دیگر</span><input className="w-full rounded-xl border p-2" inputMode="numeric" value={planDays} onChange={(e) => setPlanDays(e.target.value)} /></label>
      </div>
      <button type="button" disabled={saving} onClick={() => void save()} className="w-full rounded-xl bg-emerald-700 py-2.5 text-xs font-bold text-white disabled:opacity-40">ذخیره حد وفاداری</button>
      <div className="space-y-1">
        <h4 className="text-[11px] font-bold text-emerald-800">مشتریان برتر</h4>
        {champions.length === 0 ? <p className="text-[11px] text-slate-400">هنوز مشتری به این حد نرسیده است.</p> : champions.map((row) => (
          <p key={row.customer._id} className="text-[11px] text-slate-700">{row.customer.name} · {row.invoices.toLocaleString('fa-IR')} فاکتور · {formatToman(row.amount)}</p>
        ))}
      </div>
      <div className="space-y-1">
        <h4 className="text-[11px] font-bold text-amber-800">وفادارهایی که ساکت شده‌اند</h4>
        {quietRows.length === 0 ? <p className="text-[11px] text-slate-400">همه مشتریان برتر در این بازه خرید داشته‌اند.</p> : quietRows.map((row) => (
          <p key={row.customer._id} className="text-[11px] text-slate-700">{row.customer.name} · {row.daysSincePurchase.toLocaleString('fa-IR')} روز بدون خرید</p>
        ))}
      </div>
      <button type="button" disabled={saving || quietRows.length === 0} onClick={() => void plan()} className="w-full rounded-xl border border-amber-300 bg-amber-50 py-2.5 text-xs font-bold text-amber-900 disabled:opacity-40">برنامه‌ریزی تماس برای ساکت‌ها</button>
    </section>
  );
};
