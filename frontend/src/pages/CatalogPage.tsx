import React, { useEffect, useMemo, useState } from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { useSearchParams } from 'react-router-dom';
import { ImageOff, MapPin, Phone, Search } from 'lucide-react';
import { productImageUrl, productsService } from '../services/products.service';
import type { Catalog, CatalogProduct } from '../services/products.service';
import { Sheet } from '../components/ui/Sheet';
import { formatToman, num, searchKey } from '../lib/format';
import { formatJalaliIso } from '../lib/jalali';

const TIER_LABEL = { retail: 'قیمت مصرف‌کننده', supermarket: 'قیمت سوپرمارکت', wholesale: 'قیمت عمده' } as const;

const PackageInfo: React.FC<{ p: CatalogProduct }> = ({ p }) =>
  p.weightPerUnitKg > 0 && p.unit !== 'کیلوگرم' ? (
    <span>
      هر {p.unit} {num(p.weightPerUnitKg, 2)} کیلو
    </span>
  ) : (
    <span>هر {p.unit}</span>
  );

/** Public price list — reachable without login at /catalog. */
export const CatalogPage: React.FC = () => {
  const [params] = useSearchParams();
  const tierParam = params.get('tier');
  const tier = tierParam === 'wholesale' || tierParam === 'supermarket' ? tierParam : 'retail';

  const [data, setData] = useState<Catalog | null>(null);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [selected, setSelected] = useState<CatalogProduct | null>(null);

  useEffect(() => {
    productsService
      .getCatalog(tier)
      .then((c) => {
        setData(c);
        document.title = `کاتالوگ ${c.shopName}`;
      })
      .catch(() => setError(true));
  }, [tier]);

  const categories = useMemo(() => {
    const names = [...new Set((data?.products ?? []).map((p) => p.category))];
    const order = data?.categoryOrder ?? [];
    const listed = order.filter((c) => names.includes(c));
    const rest = names.filter((c) => !listed.includes(c)).sort((a, b) => a.localeCompare(b, 'fa'));
    return [...listed, ...rest];
  }, [data]);

  const visible = useMemo(() => {
    const q = searchKey(search.trim());
    return (data?.products ?? []).filter(
      (p) =>
        (category === 'all' || p.category === category) &&
        (!q || searchKey(`${p.name} ${p.category} ${p.subcategory}`).includes(q)),
    );
  }, [data, search, category]);

  return (
    <IonPage>
      <IonContent fullscreen className="bg-slate-50">
        <div className="max-w-3xl mx-auto px-4 pb-8" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}>
          <header className="relative overflow-hidden rounded-[28px] bg-slate-900 text-white p-6 shadow-xl">
            <div className="absolute -left-8 -top-10 w-36 h-36 rounded-full bg-sky-500/30 blur-2xl" />
            <p className="relative text-[11px] tracking-wide text-sky-200">لیست قیمت</p>
            <h1 className="relative text-2xl font-extrabold mt-1">{data?.shopName || 'کاتالوگ'}</h1>
            <p className="relative text-[12px] text-slate-300 mt-2">
              {TIER_LABEL[tier]}
              {data && ` · ${formatJalaliIso(data.generatedAt)}`}
            </p>
            {(data?.shopPhone || data?.shopAddress) && (
              <div className="mt-3 pt-3 border-t border-white/20 space-y-1.5 text-xs">
                {data.shopPhone && (
                  <a href={`tel:${data.shopPhone}`} className="flex items-center gap-1.5 w-fit">
                    <Phone className="w-3.5 h-3.5" />
                    <span dir="ltr">{data.shopPhone}</span>
                  </a>
                )}
                {data.shopAddress && (
                  <p className="flex items-start gap-1.5">
                    <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>{data.shopAddress}</span>
                  </p>
                )}
              </div>
            )}
          </header>

          <div className="sticky top-0 z-10 -mx-4 px-4 pt-3 pb-2 bg-slate-50/90 backdrop-blur-md">
            <div className="relative flex items-center">
              <Search className="absolute right-3.5 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="جستجوی کالا..."
                className="w-full pl-4 pr-10 py-3 text-sm rounded-2xl bg-white border border-slate-200 shadow-sm focus:border-sky-400 outline-none"
              />
            </div>
            {categories.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar mt-2.5 pb-1">
                {['all', ...categories].map((c) => (
                  <button
                    key={c}
                    onClick={() => setCategory(c)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition ${
                      category === c ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 border border-slate-200'
                    }`}
                  >
                    {c === 'all' ? 'همه' : c}
                  </button>
                ))}
              </div>
            )}
          </div>

          {error ? (
            <p className="text-center text-sm text-rose-600 py-16">بارگذاری کاتالوگ ممکن نشد. دوباره تلاش کنید.</p>
          ) : !data ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-4 border-sky-200 border-t-sky-600 rounded-full animate-spin" />
            </div>
          ) : visible.length === 0 ? (
            <p className="text-center text-sm text-slate-400 py-16">کالایی یافت نشد</p>
          ) : (
            <div className="space-y-4 mt-2">
              {(category === 'all' ? categories.filter((c) => visible.some((p) => p.category === c)) : [category]).map((group) => (
                <section key={group}>
                  {category === 'all' && (
                    <h2 className="text-sm font-extrabold text-slate-800 mb-2 flex items-center gap-2">
                      <span className="w-1 h-4 rounded-full bg-slate-900" />
                      {group}
                    </h2>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {visible.filter((p) => p.category === group).map((p) => (
                <button
                  key={p._id}
                  onClick={() => setSelected(p)}
                  className="bg-white rounded-[24px] border border-slate-100 shadow-sm overflow-hidden text-right flex flex-col active:scale-[0.98] transition"
                >
                  <div className="aspect-[4/5] bg-slate-100 flex items-center justify-center relative">
                    {p.image ? (
                      <img src={productImageUrl(p.image)} alt={p.name} loading="lazy" className="w-full h-full object-cover" />
                    ) : (
                      <ImageOff className="w-8 h-8 text-slate-300" />
                    )}
                    <span className="absolute top-2 right-2 text-[10px] font-bold bg-white/90 text-slate-700 px-2 py-0.5 rounded-full">
                      {p.category}
                    </span>
                    {!p.inStock && (
                      <span className="absolute bottom-2 right-2 text-[10px] font-bold bg-rose-600 text-white px-2 py-0.5 rounded-full">
                        ناموجود
                      </span>
                    )}
                  </div>
                  <div className="p-3 flex-1 flex flex-col">
                    <h3 className="text-[13px] font-extrabold text-slate-900 leading-5 line-clamp-2">{p.name}</h3>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      <PackageInfo p={p} />
                    </p>
                    <div className="mt-auto pt-2">
                      <div className="text-[15px] font-extrabold text-slate-900 font-mono">{formatToman(p.price)}</div>
                      {p.pricePerKg > 0 && p.weightPerUnitKg !== 1 && (
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">هر کیلو {formatToman(p.pricePerKg)}</div>
                      )}
                    </div>
                  </div>
                </button>
              ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>

        <Sheet open={!!selected} title={selected?.name || ''} subtitle={selected?.category} onClose={() => setSelected(null)}>
          {selected && (
            <>
              {selected.image && (
                <img src={productImageUrl(selected.image)} alt={selected.name} className="w-full rounded-2xl object-cover" />
              )}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-sky-50 rounded-2xl p-3">
                  <span className="text-[10px] text-slate-500 block">
                    <PackageInfo p={selected} />
                  </span>
                  <span className="text-sm font-bold text-sky-700 font-mono">{formatToman(selected.price)}</span>
                </div>
                {selected.pricePerKg > 0 && (
                  <div className="bg-slate-50 rounded-2xl p-3">
                    <span className="text-[10px] text-slate-500 block">هر کیلو</span>
                    <span className="text-sm font-bold text-slate-700 font-mono">{formatToman(selected.pricePerKg)}</span>
                  </div>
                )}
              </div>
              <p className={`text-xs font-bold ${selected.inStock ? 'text-emerald-600' : 'text-rose-600'}`}>
                {selected.inStock ? 'موجود' : 'ناموجود'}
              </p>
              {data?.shopPhone && (
                <a
                  href={`tel:${data.shopPhone}`}
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-sky-600 text-white text-sm font-bold"
                >
                  <Phone className="w-4 h-4" />
                  تماس برای سفارش
                </a>
              )}
            </>
          )}
        </Sheet>
      </IonContent>
    </IonPage>
  );
};
