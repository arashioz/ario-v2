import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { IonContent, IonPage, IonRefresher, IonRefresherContent } from '@ionic/react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, Minus, Plus } from 'lucide-react';
import { productsService, type Product } from '../services/products.service';
import { invoicesService, type Invoice } from '../services/invoices.service';
import { ReportHeader } from '../components/reports/ReportUI';
import { ListSkeleton } from '../components/ui/Skeleton';
import { useNotification } from '../context/NotificationContext';
import { formatJalaliIso } from '../lib/jalali';
import { formatToman, num, weight } from '../lib/format';

const companyOf = (product: Product) => (product.supplierName || '').trim() || 'بدون شرکت';
const unitKg = (product: Product) => product.weightPerUnitKg || (product.unit === 'کیلوگرم' ? 1 : 0);
const MONTH = 30 * 24 * 60 * 60 * 1000;

const movement = (rows: Invoice[], ids: Set<string>, goods: Product[]) => {
  const perKg = new Map(goods.map((product) => [product._id, unitKg(product)]));
  let amount = 0;
  let kg = 0;
  for (const invoice of rows) {
    for (const item of invoice.items || []) {
      if (!ids.has(item.productId)) continue;
      amount += item.totalPrice || 0;
      kg += item.weightKg || (item.quantity || 0) * (perKg.get(item.productId) || 0);
    }
  }
  return { amount, kg };
};

export const WarehousesPage: React.FC = () => {
  const [params] = useSearchParams();
  const requested = params.get('open');
  const { showNotification } = useNotification();
  const [products, setProducts] = useState<Product[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const [goods, docs] = await Promise.all([productsService.getProducts(), invoicesService.getAll()]);
      setProducts(goods);
      setInvoices(docs);
    } catch {
      setError('دریافت انبارها انجام نشد');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (requested) setOpen(requested); }, [requested]);

  const warehouses = useMemo(() => {
    const byName = new Map<string, Product[]>();
    for (const product of products) {
      const name = companyOf(product);
      const rows = byName.get(name) || [];
      rows.push(product);
      byName.set(name, rows);
    }
    const recent = invoices.filter((invoice) => {
      const time = Date.parse(invoice.invoiceDate);
      return Number.isFinite(time) && Date.now() - time <= MONTH;
    });
    const byDate = (a: Invoice, b: Invoice) => Date.parse(b.invoiceDate) - Date.parse(a.invoiceDate);
    return [...byName.entries()].map(([name, goods]) => {
      const ids = new Set(goods.map((product) => product._id));
      const related = invoices.filter((invoice) => (invoice.items || []).some((item) => ids.has(item.productId)));
      const purchases = related.filter((invoice) => invoice.type === 'purchase').sort(byDate);
      const sales = related.filter((invoice) => invoice.type === 'sale').sort(byDate);
      const recentPurchases = recent.filter((invoice) => invoice.type === 'purchase' && (invoice.items || []).some((item) => ids.has(item.productId)));
      const recentSales = recent.filter((invoice) => invoice.type === 'sale' && (invoice.items || []).some((item) => ids.has(item.productId)));
      return {
        name,
        goods: [...goods].sort((a, b) => (a.stock || 0) - (b.stock || 0) || a.name.localeCompare(b.name, 'fa')),
        kg: goods.reduce((sum, product) => sum + (product.stock || 0) * unitKg(product), 0),
        cost: goods.reduce((sum, product) => sum + (product.stock || 0) * (product.buyPrice || 0), 0),
        wholesale: goods.reduce((sum, product) => sum + (product.stock || 0) * (product.priceWholesale || product.sellPrice || 0), 0),
        empty: goods.filter((product) => (product.stock || 0) <= 0).length,
        purchases,
        sales,
        bought: movement(recentPurchases, ids, goods),
        sold: movement(recentSales, ids, goods),
      };
    }).sort((a, b) => a.name.localeCompare(b.name, 'fa'));
  }, [products, invoices]);

  const current = warehouses.find((house) => house.name === open) || null;
  const others = warehouses.filter((house) => house.name !== open);

  const bump = async (product: Product, delta: number) => {
    if (busy) return;
    if (delta < 0 && (product.stock || 0) <= 0) return;
    setBusy(product._id);
    try {
      const updated = await productsService.updateStock(product._id, { quantityChange: delta, reason: 'اصلاح دستی انبار' });
      setProducts((rows) => rows.map((row) => (row._id === product._id ? { ...row, stock: updated.stock } : row)));
    } catch {
      showNotification({ title: 'موجودی عوض نشد', message: 'کم یا زیاد کردن این کالا انجام نشد.', type: 'error' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <IonPage>
      <ReportHeader title={current ? current.name : 'انبار شرکت‌ها'} subtitle={current ? 'موجودی، پول خوابیده و خرید و فروش سی روز' : 'شرکت را باز کنید'} />
      <IonContent className="bg-slate-50">
        <IonRefresher slot="fixed" onIonRefresh={async (e) => { await load(); e.detail.complete(); }}>
          <IonRefresherContent />
        </IonRefresher>
        <div className="p-3 max-w-2xl mx-auto space-y-3 pb-10">
          {error && <div className="rounded-2xl bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}
          {loading ? <ListSkeleton rows={5} /> : (
            <>
              {current && (
                <section className="rounded-3xl bg-white border border-slate-100 shadow-sm overflow-hidden">
                  <div className="grid grid-cols-3 divide-x divide-x-reverse divide-slate-100 border-b border-slate-100">
                    <Stat label="موجودی" value={weight(current.kg)} hint={`${num(current.goods.length)} کالا`} />
                    <Stat label="پول خوابیده" value={formatToman(current.cost)} hint="به قیمت خرید" />
                    <Stat label="اگر عمده بفروشی" value={formatToman(current.wholesale)} hint="ارزش فعلی" />
                  </div>
                  <div className="grid grid-cols-2 divide-x divide-x-reverse divide-slate-100 border-b border-slate-100">
                    <Stat label="خرید ۳۰ روز" value={weight(current.bought.kg)} hint={formatToman(current.bought.amount)} />
                    <Stat label="فروش ۳۰ روز" value={weight(current.sold.kg)} hint={formatToman(current.sold.amount)} />
                  </div>
                  {current.empty > 0 && (
                    <p className="px-4 py-2 text-[11px] font-bold text-rose-700 bg-rose-50">{num(current.empty)} کالا موجودی ندارد</p>
                  )}
                  <div className="px-3 py-2 space-y-1">
                    {current.goods.map((product) => (
                      <div key={product._id} className="flex items-center gap-2 py-1.5">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-800 truncate">{product.name}</p>
                          <p className="text-[10px] text-slate-400 truncate">{product.category} · خرید {formatToman((product.stock || 0) * (product.buyPrice || 0))}</p>
                        </div>
                        <button type="button" disabled={busy === product._id || (product.stock || 0) <= 0} onClick={() => void bump(product, -1)} className="w-7 h-7 rounded-lg border border-slate-200 text-slate-600 disabled:opacity-30 flex items-center justify-center">
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className={`w-16 text-center text-[11px] font-mono font-bold ${(product.stock || 0) <= 0 ? 'text-rose-600' : 'text-slate-800'}`}>{num(product.stock || 0)} {product.unit}</span>
                        <button type="button" disabled={busy === product._id} onClick={() => void bump(product, 1)} className="w-7 h-7 rounded-lg border border-slate-200 text-slate-600 disabled:opacity-30 flex items-center justify-center">
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="px-4 pb-4 space-y-3 border-t border-slate-100 pt-3">
                    <InvoiceGroup title="آخرین خریدها" rows={current.purchases} />
                    <InvoiceGroup title="آخرین فروش‌ها" rows={current.sales} />
                  </div>
                </section>
              )}
              {others.length > 0 && (
                <section className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden divide-y divide-slate-100">
                  {current && <h2 className="px-3.5 pt-3 text-[11px] font-bold text-slate-400">انبارهای دیگر</h2>}
                  {others.map((house) => (
                    <button key={house.name} type="button" onClick={() => setOpen(house.name)} className="w-full px-3.5 py-3 flex items-center justify-between gap-3 text-right active:bg-slate-50">
                      <span className="min-w-0">
                        <span className="block text-[13px] font-bold text-slate-800 truncate">{house.name}</span>
                        <span className="block text-[11px] text-slate-400 mt-0.5">{weight(house.kg)} · {formatToman(house.cost)}{house.empty ? ` · ${num(house.empty)} تمام‌شده` : ''}</span>
                      </span>
                      <span className="flex items-center gap-0.5 text-[12px] font-bold text-sky-700 shrink-0">جزئیات<ChevronLeft className="w-4 h-4" /></span>
                    </button>
                  ))}
                </section>
              )}
            </>
          )}
        </div>
      </IonContent>
    </IonPage>
  );
};

const Stat: React.FC<{ label: string; value: string; hint: string }> = ({ label, value, hint }) => (
  <div className="px-2.5 py-3 text-right min-w-0">
    <p className="text-[10px] text-slate-400">{label}</p>
    <p className="text-[12px] font-bold text-slate-800 mt-0.5 truncate">{value}</p>
    <p className="text-[10px] text-slate-400 truncate">{hint}</p>
  </div>
);

const InvoiceGroup: React.FC<{ title: string; rows: Invoice[] }> = ({ title, rows }) => (
  <div>
    <h3 className="text-[11px] font-bold text-slate-500 mb-1">{title}</h3>
    {rows.length === 0 ? <p className="text-[11px] text-slate-400">فاکتوری نیست</p> : (
      <div className="space-y-1">
        {rows.slice(0, 12).map((invoice) => (
          <div key={invoice._id} className="rounded-xl bg-slate-50 px-2.5 py-2 text-[11px] flex items-center justify-between gap-2">
            <span className="min-w-0">
              <b className="font-mono" dir="ltr">{invoice.invoiceNumber}</b>
              <span className="text-slate-500"> · {invoice.customerName} · {formatJalaliIso(invoice.invoiceDate)}</span>
              {invoice.fulfillment === 'factory' && <span className="mr-1 text-amber-700">ارسال از کارخانه</span>}
            </span>
            <span className="font-mono shrink-0">{formatToman(invoice.finalAmount)}</span>
          </div>
        ))}
      </div>
    )}
  </div>
);
