import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { IonContent, IonPage, IonRefresher, IonRefresherContent } from '@ionic/react';
import { useSearchParams } from 'react-router-dom';
import { ChevronDown, Warehouse } from 'lucide-react';
import { productsService, type Product } from '../services/products.service';
import { invoicesService, type Invoice } from '../services/invoices.service';
import { ReportHeader } from '../components/reports/ReportUI';
import { ListSkeleton } from '../components/ui/Skeleton';
import { formatJalaliIso } from '../lib/jalali';
import { formatToman, num, weight } from '../lib/format';

export const WarehousesPage: React.FC = () => {
  const [params] = useSearchParams();
  const requested = params.get('open');
  const [products, setProducts] = useState<Product[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);

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
      const name = product.category || 'عمومی';
      const rows = byName.get(name) || [];
      rows.push(product);
      byName.set(name, rows);
    }
    return [...byName.entries()].map(([name, goods]) => {
      const ids = new Set(goods.map((product) => product._id));
      const related = invoices.filter((inv) => (inv.items || []).some((item) => ids.has(item.productId)));
      const kg = goods.reduce((sum, product) => sum + (product.stock || 0) * (product.weightPerUnitKg || (product.unit === 'کیلوگرم' ? 1 : 0)), 0);
      return {
        name,
        goods,
        kg,
        purchases: related.filter((inv) => inv.type === 'purchase'),
        sales: related.filter((inv) => inv.type === 'sale'),
      };
    }).sort((a, b) => a.name.localeCompare(b.name, 'fa'));
  }, [products, invoices]);

  return (
    <IonPage>
      <ReportHeader title="انبارهای جدا" subtitle="هر دسته یک انبار است: موجودی، خرید و فروش همان کالاها" />
      <IonContent className="bg-slate-50">
        <IonRefresher slot="fixed" onIonRefresh={async (e) => { await load(); e.detail.complete(); }}>
          <IonRefresherContent />
        </IonRefresher>
        <div className="p-3 max-w-2xl mx-auto space-y-3 pb-10">
          {error && <div className="rounded-2xl bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}
          {loading ? <ListSkeleton rows={4} /> : warehouses.map((house) => {
            const shown = open === house.name;
            return (
              <section key={house.name} className="rounded-3xl bg-white border border-slate-200 overflow-hidden">
                <button type="button" onClick={() => setOpen(shown ? null : house.name)} className="w-full px-4 py-3 flex items-center justify-between text-right">
                  <span>
                    <span className="flex items-center gap-2 text-sm font-bold text-slate-800"><Warehouse className="w-4 h-4 text-sky-600" />انبار {house.name}</span>
                    <span className="block text-[11px] text-slate-500 mt-1">{num(house.goods.length)} کالا · {weight(house.kg)} · {num(house.purchases.length)} خرید · {num(house.sales.length)} فروش</span>
                  </span>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition ${shown ? 'rotate-180' : ''}`} />
                </button>
                {shown && (
                  <div className="px-4 pb-4 space-y-3 border-t border-slate-100">
                    <div className="pt-3 space-y-1">
                      {house.goods.map((product) => (
                        <div key={product._id} className="flex items-center justify-between text-xs">
                          <span className="text-slate-700">{product.name}{product.sku ? <span className="mr-1 font-mono text-slate-400" dir="ltr">{product.sku}</span> : ''}</span>
                          <span className="font-mono text-slate-800">{num(product.stock || 0)} {product.unit}</span>
                        </div>
                      ))}
                    </div>
                    <InvoiceGroup title="فاکتورهای خرید این انبار" rows={house.purchases} />
                    <InvoiceGroup title="فاکتورهای فروش مرتبط" rows={house.sales} />
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </IonContent>
    </IonPage>
  );
};

const InvoiceGroup: React.FC<{ title: string; rows: Invoice[] }> = ({ title, rows }) => (
  <div>
    <h3 className="text-[11px] font-bold text-slate-500 mb-1">{title}</h3>
    {rows.length === 0 ? <p className="text-[11px] text-slate-400">فاکتوری نیست</p> : (
      <div className="space-y-1">
        {rows.slice(0, 20).map((inv) => (
          <div key={inv._id} className="rounded-xl bg-slate-50 px-2.5 py-2 text-[11px] flex items-center justify-between gap-2">
            <span>
              <b className="font-mono" dir="ltr">{inv.invoiceNumber}</b>
              <span className="text-slate-500"> · {inv.customerName} · {formatJalaliIso(inv.invoiceDate)}</span>
              {inv.fulfillment === 'factory' && <span className="mr-1 text-amber-700">ارسال از کارخانه</span>}
            </span>
            <span className="font-mono shrink-0">{formatToman(inv.finalAmount)}</span>
          </div>
        ))}
      </div>
    )}
  </div>
);
