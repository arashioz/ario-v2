import React, { useEffect, useState } from 'react';
import { productsService } from '../../services/products.service';
import { settingsService, useSettings } from '../../services/settings.service';
import { MoneyTextInput } from '../ui/AmountInput';
import { useNotification } from '../../context/NotificationContext';
import { apiErrorMessage } from '../../services/invoices.service';
import { formatToman } from '../../lib/format';

const field = 'w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs';

export const CategoryPricingPanel: React.FC<{ categories: string[]; onSaved: () => void }> = ({ categories, onSaved }) => {
  const settings = useSettings();
  const { showNotification } = useNotification();
  const [category, setCategory] = useState(categories[0] || '');
  const [amount, setAmount] = useState('');
  const [retail, setRetail] = useState('0');
  const [supermarket, setSupermarket] = useState('0');
  const [wholesale, setWholesale] = useState('0');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!category && categories[0]) setCategory(categories[0]);
  }, [categories, category]);

  useEffect(() => {
    const rule = settings.categoryBasePrices.find((r) => r.category === category);
    setAmount(rule ? String(rule.amount) : '');
    setRetail(String(rule?.retailPercent ?? 0));
    setSupermarket(String(rule?.supermarketPercent ?? 0));
    setWholesale(String(rule?.wholesalePercent ?? 0));
  }, [category, settings.categoryBasePrices]);

  const save = async () => {
    if (!category || amount === '') return;
    setSaving(true);
    try {
      const result = await productsService.saveCategoryPrice({
        category,
        amount: Number(amount),
        unit: 'kg',
        retailPercent: Number(retail) || 0,
        supermarketPercent: Number(supermarket) || 0,
        wholesalePercent: Number(wholesale) || 0,
      });
      await settingsService.get(true);
      onSaved();
      const missed = result.skipped?.length ? ` ${result.skipped.length.toLocaleString('fa-IR')} کالا به‌خاطر وزن نامشخص عوض نشد.` : '';
      showNotification({ title: 'قیمت دسته عوض شد', message: `${result.modified.toLocaleString('fa-IR')} کالا با درصد فروشنده، سوپرمارکت و عمده به‌روز شد.${missed}`, type: 'success' });
    } catch (error) {
      showNotification({ title: 'ذخیره نشد', message: apiErrorMessage(error, 'ذخیره قیمت پایه انجام نشد'), type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4 space-y-3">
      <h3 className="text-sm font-bold text-blue-900">قیمت پایه و درصد هر دسته</h3>
      <p className="text-xs leading-6 text-slate-600">
        یک دسته را انتخاب کنید. با عوض شدن قیمت پایه هر کیلو، قیمت همه کالاهای همان دسته برای فروشنده، سوپرمارکت و عمده‌فروش دوباره حساب می‌شود.
      </p>
      <label className="block text-xs space-y-1">
        <span>دسته‌بندی</span>
        <select className={field} value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">انتخاب دسته‌بندی</option>
          {categories.map((c) => <option key={c}>{c}</option>)}
        </select>
      </label>
      <label className="block text-xs space-y-1">
        <span>قیمت پایه هر کیلو (تومان)</span>
        <MoneyTextInput className={field} value={amount} onChange={setAmount} allowZero disabled={saving} />
      </label>
      <div className="grid grid-cols-3 gap-2">
        <label className="text-xs space-y-1"><span>سود فروشنده ٪</span><input className={field} type="number" min="0" value={retail} onChange={(e) => setRetail(e.target.value)} /></label>
        <label className="text-xs space-y-1"><span>سود سوپرمارکت ٪</span><input className={field} type="number" min="0" value={supermarket} onChange={(e) => setSupermarket(e.target.value)} /></label>
        <label className="text-xs space-y-1"><span>سود عمده ٪</span><input className={field} type="number" min="0" value={wholesale} onChange={(e) => setWholesale(e.target.value)} /></label>
      </div>
      <button onClick={() => void save()} disabled={saving || !category || amount === ''} className="w-full rounded-xl bg-blue-600 py-3 text-xs font-bold text-white disabled:opacity-40">
        {saving ? 'در حال محاسبه…' : 'اعمال پایه و درصد روی همه کالاهای این دسته'}
      </button>
      <div className="space-y-1">
        {settings.categoryBasePrices.map((r) => (
          <button key={r.category} type="button" onClick={() => setCategory(r.category)} className="block w-full text-right text-[11px] text-slate-600">
            {r.category}: {formatToman(r.amount)} / کیلو · فروشنده {r.retailPercent || 0}٪ · سوپر {r.supermarketPercent || 0}٪ · عمده {r.wholesalePercent || 0}٪
          </button>
        ))}
      </div>
    </section>
  );
};
