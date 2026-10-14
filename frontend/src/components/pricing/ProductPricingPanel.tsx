import React, { useCallback, useEffect, useState } from 'react';
import { productsService } from '../../services/products.service';
import type { Product } from '../../services/products.service';
import { settingsService, useSettings } from '../../services/settings.service';
import { CategoryPricingPanel } from '../products/CategoryPricingPanel';
import { MoneyTextInput } from '../ui/AmountInput';
import { SplashScreen } from '../SplashScreen';
import { kgPerUnit } from '../pos/cart';
import { formatToman, searchKey } from '../../lib/format';
import { apiErrorMessage } from '../../services/invoices.service';
import { useNotification } from '../../context/NotificationContext';

const field = 'w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs';

const ProductPricingRow: React.FC<{ product: Product; onSaved: (p: Product) => void }> = ({ product, onSaved }) => {
  const settings = useSettings();
  const { showNotification } = useNotification();
  const [enabled, setEnabled] = useState(!!product.autoPricing);
  const [fee, setFee] = useState(String(product.commissionAmount || 0));
  const [unit, setUnit] = useState<'kg' | 'unit'>(product.commissionUnit || 'kg');
  const [profit, setProfit] = useState(String(product.commissionPercent || 0));
  const [saving, setSaving] = useState(false);
  const base = settings.categoryBasePrices.find((r) => r.category === product.category);
  const kg = kgPerUnit(product);
  const valid = Number.isFinite(Number(profit)) && Number(profit) >= 0 && Number(profit) <= 1000;
  const canCalculate = !!base && (base.unit !== 'kg' || kg > 0) && (unit !== 'kg' || Number(fee) === 0 || kg > 0);
  const cost = base ? base.amount * (base.unit === 'kg' ? kg : 1) + Number(fee) * (unit === 'kg' ? kg : 1) : 0;
  const price = Math.round(cost * (1 + Number(profit) / 100));
  const save = async () => {
    setSaving(true);
    try {
      const updated = await productsService.update(product._id, { autoPricing: enabled, commissionAmount: Number(fee), commissionUnit: unit, commissionPercent: Number(profit) });
      onSaved(updated);
      showNotification({ title: 'قیمت‌گذاری محصول ذخیره شد', message: enabled ? `قیمت هر ${product.unit}: ${formatToman(updated.sellPrice)}` : 'کارمزد و سود ذخیره شد؛ محاسبهٔ خودکار خاموش است.', type: 'success' });
    } catch (err) { showNotification({ title: 'ذخیره نشد', message: apiErrorMessage(err, 'قیمت‌گذاری ذخیره نشد'), type: 'error' }); }
    finally { setSaving(false); }
  };
  return <article className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
    {saving && <SplashScreen message="در حال ذخیره قیمت…" />}
    <div><h3 className="text-sm font-bold text-slate-800">{product.name}</h3><p className="text-[11px] text-slate-500 mt-1">{product.category} · پایه: {base ? `${formatToman(base.amount)} / ${base.unit === 'kg' ? 'کیلو' : 'واحد'}` : 'تعیین نشده'}</p></div>
    <fieldset disabled={saving} className="space-y-3">
      <label className="flex items-center gap-2 text-xs text-slate-700"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />محاسبهٔ خودکار قیمت فروش</label>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs space-y-1"><span>کارمزد محصول (تومان)</span><MoneyTextInput className={field} value={fee} onChange={setFee} /></label>
        <label className="text-xs space-y-1"><span>کارمزد برای</span><select className={field} value={unit} onChange={(e) => setUnit(e.target.value as 'kg' | 'unit')}><option value="kg">هر کیلو</option><option value="unit">هر {product.unit}</option></select></label>
        <label className="text-xs space-y-1 col-span-2"><span>درصد سود روی مجموع پایه و کارمزد</span><input className={field} type="number" min="0" max="1000" step="any" value={profit} onChange={(e) => setProfit(e.target.value)} /></label>
      </div>
      {canCalculate && valid ? <p className="rounded-xl bg-blue-50 p-3 text-xs text-blue-900 leading-6">قیمت هر {product.unit}: <b>{formatToman(price)}</b>{kg > 0 && kg !== 1 && <span> · هر کیلو {formatToman(Math.round(price / kg))}</span>}</p> : <p className="text-xs text-amber-700">{!base ? 'ابتدا قیمت پایهٔ دسته را ثبت کنید.' : !valid ? 'درصد سود باید بین صفر و ۱۰۰۰ باشد.' : 'وزن هر واحد محصول را در مدیریت محصولات مشخص کنید.'}</p>}
      <button type="button" disabled={saving || !valid || (enabled && !canCalculate)} onClick={() => void save()} className="w-full rounded-xl bg-blue-700 py-2.5 text-xs font-bold text-white disabled:opacity-40">{saving ? 'در حال ذخیره…' : 'ذخیره کارمزد و سود محصول'}</button>
    </fieldset>
  </article>;
};

export const ProductPricingPanel: React.FC<{ onSaved: () => void }> = ({ onSaved }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [rows] = await Promise.all([productsService.getProducts(), settingsService.get(true)]);
      setProducts(rows);
    } catch (err) { setError(apiErrorMessage(err, 'دریافت محصولات انجام نشد')); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return <div className="p-3 max-w-xl mx-auto space-y-3 pb-8">
    {loading && <SplashScreen message="در حال دریافت قیمت محصولات…" />}
    <p className="rounded-2xl bg-blue-50 p-3 text-xs leading-6 text-blue-900">قیمت نهایی = (قیمت پایه + کارمزد محصول) × (۱ + درصد سود ÷ ۱۰۰). قیمت پایهٔ هر کیلو با وزن بسته محاسبه می‌شود. با فعال کردن محاسبهٔ خودکار، قیمت تکی، سوپر و عمدهٔ محصول برابر این مبلغ می‌شود.</p>
    {error && <div role="alert" className="rounded-xl bg-rose-50 p-3 text-xs text-rose-700">{error}<button className="mr-3 underline" onClick={() => void load()}>تلاش دوباره</button></div>}
    <CategoryPricingPanel categories={[...new Set(products.map((p) => p.category))]} onSaved={() => { void load(); onSaved(); }} />
    <input aria-label="جستجوی محصول برای کارمزد" className={field} placeholder="جستجوی محصول یا دسته‌بندی…" value={search} onChange={(e) => setSearch(e.target.value)} />
    {products.filter((p) => searchKey(`${p.name} ${p.category}`).includes(searchKey(search))).map((p) => <ProductPricingRow key={`${p._id}-${p.updatedAt}`} product={p} onSaved={(updated) => { setProducts((rows) => rows.map((row) => row._id === updated._id ? updated : row)); onSaved(); }} />)}
  </div>;
};
