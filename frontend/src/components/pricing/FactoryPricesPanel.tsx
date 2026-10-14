import React, { useCallback, useEffect, useState } from 'react';
import { invoicesService, apiErrorMessage } from '../../services/invoices.service';
import type { FactoryPriceRow, Invoice } from '../../services/invoices.service';
import { productsService } from '../../services/products.service';
import { MoneyTextInput } from '../ui/AmountInput';
import { SplashScreen } from '../SplashScreen';
import { useNotification } from '../../context/NotificationContext';
import { useInvoiceOpener } from '../reports/useInvoiceOpener';
import { formatToman, searchKey } from '../../lib/format';

const field = 'w-full rounded-xl border border-slate-200 bg-white p-3 text-xs';

const FactoryRow: React.FC<{ row: FactoryPriceRow; onSave: (id: string, price: number | null) => Promise<boolean> }> = ({ row, onSave }) => {
  const [value, setValue] = useState(row.price === null ? '' : String(row.price));
  const [saving, setSaving] = useState(false);
  useEffect(() => { setValue(row.price === null ? '' : String(row.price)); }, [row.price, row.overridePrice]);
  const save = async (price: number | null) => {
    setSaving(true);
    await onSave(row.productId, price);
    setSaving(false);
  };
  return <article className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
    {saving && <SplashScreen message="در حال ذخیره قیمت…" />}
    <div className="flex justify-between gap-2"><h3 className="text-sm font-bold text-slate-800">{row.name}</h3><span className="text-[10px] text-slate-500">{row.category}</span></div>
    <p className="text-xs text-slate-500">آخرین خرید: <b className="text-slate-700">{row.lastPurchasePrice === null ? 'بدون سابقهٔ خرید' : formatToman(row.lastPurchasePrice)}</b> / هر {row.unit}</p>
    <label className="block space-y-1 text-xs text-slate-700"><span>قیمت کارخانهٔ هر {row.unit} (تومان)</span><MoneyTextInput value={value} onChange={setValue} className={field} disabled={saving} allowZero /></label>
    {row.weightPerUnitKg > 0 && value !== '' && <p className="text-[11px] text-slate-500">معادل {formatToman(Math.round(Number(value) / row.weightPerUnitKg))} برای هر کیلو</p>}
    <div className="flex gap-2">
      <button type="button" disabled={saving || value === '' || !Number.isFinite(Number(value))} onClick={() => void save(Number(value))} className="flex-1 rounded-xl bg-blue-700 text-white py-2.5 text-xs font-bold disabled:opacity-40">{saving ? 'در حال ذخیره…' : 'ذخیره قیمت کارخانه'}</button>
      {row.overridePrice !== null && <button type="button" disabled={saving} onClick={() => void save(null)} className="rounded-xl border border-slate-200 px-3 text-xs text-slate-600 disabled:opacity-40">استفاده از آخرین خرید</button>}
    </div>
    <p className="text-[10px] text-slate-500">{row.overridePrice === null ? 'قیمت از آخرین فاکتور خرید به‌روز می‌شود.' : 'قیمت اصلاح‌شدهٔ شما برای ارسال از کارخانه استفاده می‌شود.'}</p>
  </article>;
};

export const FactoryPricesPanel: React.FC = () => {
  const [rows, setRows] = useState<FactoryPriceRow[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const { showNotification } = useNotification();
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [prices, sales] = await Promise.all([invoicesService.factoryPrices(), invoicesService.getAll({ type: 'sale', fulfillment: 'factory' })]);
      setRows(prices); setInvoices(sales);
    } catch (err) { setError(apiErrorMessage(err, 'دریافت قیمت‌های کارخانه انجام نشد')); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const { open, modal } = useInvoiceOpener(() => void load());
  const save = async (id: string, price: number | null) => {
    try {
      await productsService.setFactoryPrice(id, price);
      setRows((previous) => previous.map((r) => r.productId === id ? { ...r, overridePrice: price, price: price ?? r.lastPurchasePrice } : r));
      showNotification({ title: 'قیمت کارخانه ذخیره شد', message: 'در فاکتور جدید ارسال از کارخانه استفاده می‌شود.', type: 'success' });
      return true;
    } catch (err) {
      showNotification({ title: 'ذخیره نشد', message: apiErrorMessage(err, 'قیمت کارخانه ذخیره نشد'), type: 'error' });
      return false;
    }
  };
  const shown = rows.filter((r) => searchKey(`${r.name} ${r.category}`).includes(searchKey(search)));
  return <div className="p-3 space-y-3 max-w-xl mx-auto pb-8">
    {loading && <SplashScreen message="در حال دریافت قیمت‌های کارخانه…" />}
    <p className="rounded-2xl bg-blue-50 p-3 text-xs text-blue-900 leading-6">قیمت اولیه از آخرین خرید هر محصول خوانده می‌شود. اصلاح قیمت در اینجا، قیمت کارخانهٔ فاکتورهای جدید را تعیین می‌کند. برای تغییر فاکتور ثبت‌شده، آن را از فهرست زیر باز کنید و «ویرایش» را بزنید.</p>
    {error && <div role="alert" className="rounded-xl bg-rose-50 p-3 text-xs text-rose-700">{error}<button className="mr-3 underline" onClick={() => void load()}>تلاش دوباره</button></div>}
    <details className="rounded-2xl border border-slate-200 bg-white p-3">
      <summary className="text-sm font-bold text-slate-800 cursor-pointer">فاکتورهای ارسال از کارخانه</summary>
      <div className="mt-3 space-y-2">
        {!loading && !invoices.length && <p className="text-xs text-slate-500">فاکتوری ثبت نشده است.</p>}
        {invoices.map((invoice) => <button key={invoice._id} type="button" onClick={() => void open(invoice._id)} className="w-full flex justify-between gap-2 rounded-xl bg-slate-50 p-3 text-right text-xs"><span>{invoice.invoiceNumber} · {invoice.customerName}</span><span className="text-blue-700">مشاهده و ویرایش</span></button>)}
      </div>
    </details>
    <input aria-label="جستجوی محصول در قیمت کارخانه" placeholder="جستجوی محصول یا دسته‌بندی…" className={field} value={search} onChange={(e) => setSearch(e.target.value)} />
    {!loading && !error && !shown.length && <p className="py-6 text-center text-xs text-slate-500">محصولی پیدا نشد.</p>}
    {shown.map((row) => <FactoryRow key={row.productId} row={row} onSave={save} />)}
    {modal}
  </div>;
};
