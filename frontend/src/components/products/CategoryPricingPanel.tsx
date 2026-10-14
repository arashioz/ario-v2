import React, { useEffect, useState } from 'react';
import { productsService } from '../../services/products.service';
import { settingsService, useSettings } from '../../services/settings.service';
import { MoneyTextInput } from '../ui/AmountInput';
import { useNotification } from '../../context/NotificationContext';
import { apiErrorMessage } from '../../services/invoices.service';
import { formatToman, num } from '../../lib/format';

export const CategoryPricingPanel: React.FC<{ categories: string[]; onSaved: () => void }> = ({ categories, onSaved }) => {
  const settings = useSettings();
  const { showNotification } = useNotification();
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const rule = settings.categoryBasePrices.find((r) => r.category === category);
    setAmount(rule?.unit === 'kg' ? String(rule.amount) : '');
  }, [category, settings.categoryBasePrices]);
  const save = async () => {
    if (!category || amount === '') return;
    setSaving(true);
    try {
      const result = await productsService.saveCategoryPrice({ category, amount: Number(amount), unit: 'kg' });
      await settingsService.get(true); onSaved();
      showNotification({ title: 'قیمت پایه ذخیره شد', message: `قیمت ${num(result.modified)} محصول با کارمزد خودش به‌روز شد.`, type: 'success' });
    } catch (error) { showNotification({ title: 'ذخیره نشد', message: apiErrorMessage(error, 'ذخیره قیمت پایه انجام نشد'), type: 'error' }); }
    finally { setSaving(false); }
  };
  const field = 'w-full rounded-xl border border-slate-200 bg-white p-3 text-xs';
  return <details open className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
    <summary className="cursor-pointer text-sm font-bold text-blue-900">قیمت پایهٔ هر کیلو</summary>
    <div className="mt-4 space-y-3">
      <p className="text-xs leading-6 text-slate-600">قیمت هر کیلو را برای دسته مشخص کنید. قیمت محصولات فعال در محاسبهٔ خودکار، با کارمزد و درصد سود خودشان به‌روز می‌شود.</p>
      <label className="block text-xs space-y-1"><span>دسته‌بندی</span><select className={field} value={category} onChange={(e) => setCategory(e.target.value)}><option value="">انتخاب دسته‌بندی</option>{categories.map((c) => <option key={c}>{c}</option>)}</select></label>
      <label className="block text-xs space-y-1"><span>قیمت پایهٔ هر کیلو (تومان)</span><MoneyTextInput className={field} value={amount} onChange={setAmount} allowZero disabled={saving} /></label>
      <button onClick={() => void save()} disabled={saving || !category || amount === ''} className="w-full rounded-xl bg-blue-600 py-3 text-xs font-bold text-white disabled:opacity-40">{saving ? 'در حال ذخیره…' : 'ذخیره و محاسبهٔ خودکار قیمت محصولات'}</button>
      {settings.categoryBasePrices.map((r) => <p key={r.category} className="text-[11px] text-slate-600">{r.category}: {formatToman(r.amount)} / {r.unit === 'kg' ? 'کیلو' : 'بسته یا واحد'}</p>)}
    </div>
  </details>;
};
