import React, { useEffect, useState } from 'react';
import { productsService } from '../../services/products.service';
import { settingsService, useSettings } from '../../services/settings.service';
import { MoneyTextInput } from '../ui/AmountInput';
import { useNotification } from '../../context/NotificationContext';
import { apiErrorMessage } from '../../services/invoices.service';
import { formatToman } from '../../lib/format';

const field = 'w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs';

const perKg = (base: string, percent: string) => {
  const amount = Number(base);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * (1 + (Number(percent) || 0) / 100));
};

export const CategoryPricingPanel: React.FC<{ categories: string[]; onSaved: () => void }> = ({ categories, onSaved }) => {
  const settings = useSettings();
  const { showNotification } = useNotification();
  const [category, setCategory] = useState(categories[0] || '');
  const [amount, setAmount] = useState('');
  const [retail, setRetail] = useState('0');
  const [supermarket, setSupermarket] = useState('0');
  const [wholesale, setWholesale] = useState('0');
  const [distributor, setDistributor] = useState('0');
  const [editPercents, setEditPercents] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!category && categories[0]) setCategory(categories[0]);
  }, [categories, category]);

  useEffect(() => {
    const rule = settings.categoryBasePrices.find((item) => item.category === category);
    setAmount(rule ? String(rule.amount) : '');
    setRetail(String(rule?.retailPercent ?? 0));
    setSupermarket(String(rule?.supermarketPercent ?? 0));
    setWholesale(String(rule?.wholesalePercent ?? 0));
    setDistributor(String(rule?.distributorPercent ?? 0));
    setEditPercents(!(rule && [rule.retailPercent, rule.supermarketPercent, rule.wholesalePercent].some((n) => (n || 0) > 0)));
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
        distributorPercent: Number(distributor) || 0, // kept so an old stored percent is not wiped; sales no longer uses it
      });
      await settingsService.get(true);
      onSaved();
      const missed = result.skipped?.length ? ` ${result.skipped.length.toLocaleString('fa-IR')} کالا قیمت خرید ندارد و عوض نشد.` : '';
      showNotification({ title: 'قیمت بازار اعمال شد', message: `${result.modified.toLocaleString('fa-IR')} کالا با همان درصدهای فروش به‌روز شد.${missed}`, type: 'success' });
    } catch (error) {
      showNotification({ title: 'ذخیره نشد', message: apiErrorMessage(error, 'ذخیره قیمت پایه انجام نشد'), type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const preview = [
    ['تکی', retail],
    ['سوپرمارکت', supermarket],
    ['عمده', wholesale],
  ] as const;

  return (
    <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4 space-y-3">
      <div>
        <h3 className="text-sm font-bold text-blue-900">قیمت بازار</h3>
        <ol className="mt-2 space-y-1 text-xs leading-6 text-slate-600 list-decimal pr-4">
          <li>دسته را انتخاب کنید. مثلاً قند.</li>
          <li>درصد تکی، سوپرمارکت و عمده را یک بار بگذارید.</li>
          <li>هر بار که قیمت بازار عوض شد، فقط قیمت پایه هر کیلو را عوض کنید. همان درصدها خودکار روی همه کالاهای دسته می‌نشیند. کارمزد بسته هر کالا سر جایش می‌ماند.</li>
        </ol>
      </div>
      <label className="block text-xs space-y-1">
        <span>دسته‌بندی</span>
        <select className={field} value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">انتخاب دسته‌بندی</option>
          {categories.map((name) => <option key={name}>{name}</option>)}
        </select>
      </label>
      <label className="block text-xs space-y-1">
        <span>قیمت پایه هر کیلو در بازار (تومان)</span>
        <MoneyTextInput className={field} value={amount} onChange={setAmount} allowZero disabled={saving} />
      </label>
      {editPercents ? (
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs space-y-1"><span>سود تکی ٪</span><input className={field} type="number" min="0" value={retail} onChange={(e) => setRetail(e.target.value)} /></label>
          <label className="text-xs space-y-1"><span>سود سوپرمارکت ٪</span><input className={field} type="number" min="0" value={supermarket} onChange={(e) => setSupermarket(e.target.value)} /></label>
          <label className="text-xs space-y-1"><span>سود عمده ٪</span><input className={field} type="number" min="0" value={wholesale} onChange={(e) => setWholesale(e.target.value)} /></label>
        </div>
      ) : (
        <button type="button" onClick={() => setEditPercents(true)} className="w-full text-right text-[11px] leading-6 text-slate-600">
          درصدهای ذخیره‌شده: تکی {retail}٪ · سوپرمارکت {supermarket}٪ · عمده {wholesale}٪
          <span className="block font-bold text-sky-700 mt-0.5">تغییر درصد</span>
        </button>
      )}
      {perKg(amount, retail) !== null && (
        <div className="rounded-xl bg-white p-3 text-[11px] leading-6 text-slate-700">
          <p className="font-bold text-slate-800">با این پایه، هر کیلو می‌شود</p>
          {preview.map(([label, percent]) => (
            <p key={label}>{label}: {formatToman(perKg(amount, percent) || 0)}</p>
          ))}
          <p className="text-slate-400">کارمزد و عدد بسته هر کالا بعد از این پایه اضافه می‌شود.</p>
        </div>
      )}
      <button onClick={() => void save()} disabled={saving || !category || amount === ''} className="w-full rounded-xl bg-blue-600 py-3 text-xs font-bold text-white disabled:opacity-40">
        {saving ? 'در حال محاسبه…' : 'اعمال قیمت جدید بازار'}
      </button>
    </section>
  );
};
