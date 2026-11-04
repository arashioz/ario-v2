import React, { useCallback, useEffect, useState } from 'react';
import { IonContent, IonHeader, IonPage, IonToolbar } from '@ionic/react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { invoicesService, type PriceBoardProduct } from '../services/invoices.service';
import { productsService } from '../services/products.service';
import { MoneyTextInput } from '../components/ui/AmountInput';
import { useNotification } from '../context/NotificationContext';
import { apiErrorMessage } from '../services/invoices.service';
import { formatToman } from '../lib/format';
import { formatJalaliIso } from '../lib/jalali';

type Draft = { retail: number; supermarket: number; wholesale: number; agencyGap: number; agencyBase: number };

const field = 'w-full rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs font-bold';
const DEFAULT_GAP = 5000;

const rowOf = (p: PriceBoardProduct): Draft => ({
  retail: p.retail,
  supermarket: p.supermarket,
  wholesale: p.wholesale,
  agencyGap: p.agencyGap || 0,
  agencyBase: p.agencyBasePrice || 0,
});

export const CompanyPricesPage: React.FC = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const company = params.get('company') || '';
  const { showNotification } = useNotification();
  const [active, setActive] = useState('');
  const [companies, setCompanies] = useState<string[]>([]);
  const [products, setProducts] = useState<PriceBoardProduct[]>([]);
  const [draft, setDraft] = useState<Record<string, Draft>>({});
  const [retailPct, setRetailPct] = useState('');
  const [superPct, setSuperPct] = useState('');
  const [wholePct, setWholePct] = useState('');
  const [gapPlain, setGapPlain] = useState(String(DEFAULT_GAP));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const board = await invoicesService.priceBoard(company);
      setCompanies(board.companies);
      setActive(board.company);
      setProducts(board.products);
      setDraft(Object.fromEntries(board.products.map((p) => [p.productId, rowOf(p)])));
    } catch (error) {
      showNotification({ title: 'قیمت‌ها', message: apiErrorMessage(error, 'لیست قیمت خوانده نشد'), type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [company, showNotification]);

  useEffect(() => { void load(); }, [load]);

  const pick = (name: string) => navigate(name ? `/prices?company=${encodeURIComponent(name)}` : '/prices');

  const baseOf = (p: PriceBoardProduct) => p.lastPurchase?.price || p.buyPrice || 0;
  const withPercent = (base: number, pct: string, current: number) => {
    if (pct.trim() === '' || !(base > 0)) return current;
    const n = Number(pct);
    if (!Number.isFinite(n)) return current;
    return Math.max(0, Math.round(base * (1 + n / 100)));
  };

  const applyPercents = () => {
    setDraft((prev) => {
      const next = { ...prev };
      for (const p of products) {
        const base = baseOf(p);
        const row = next[p.productId] || rowOf(p);
        next[p.productId] = {
          ...row,
          retail: withPercent(base, retailPct, row.retail),
          supermarket: withPercent(base, superPct, row.supermarket),
          wholesale: withPercent(base, wholePct, row.wholesale),
        };
      }
      return next;
    });
  };

  const applyGap = () => {
    const gap = Math.max(0, Math.round(Number(gapPlain) || 0));
    setDraft((prev) => {
      const next = { ...prev };
      for (const p of products) {
        const buy = baseOf(p);
        const row = next[p.productId] || rowOf(p);
        next[p.productId] = {
          ...row,
          agencyGap: gap,
          agencyBase: buy > 0 ? buy + gap : row.agencyBase,
        };
      }
      return next;
    });
  };

  const setPrice = (id: string, key: keyof Draft, plain: string) => {
    const n = Math.max(0, Math.round(Number(plain) || 0));
    setDraft((prev) => {
      const product = products.find((p) => p.productId === id);
      const buy = product ? baseOf(product) : 0;
      const row = prev[id] || { retail: 0, supermarket: 0, wholesale: 0, agencyGap: 0, agencyBase: 0 };
      if (key === 'agencyGap') return { ...prev, [id]: { ...row, agencyGap: n, agencyBase: buy > 0 ? buy + n : row.agencyBase } };
      if (key === 'agencyBase') return { ...prev, [id]: { ...row, agencyBase: n, agencyGap: buy > 0 ? Math.max(0, n - buy) : row.agencyGap } };
      return { ...prev, [id]: { ...row, [key]: n } };
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const items = products.map((p) => {
        const row = draft[p.productId] || rowOf(p);
        return {
          productId: p.productId,
          retail: row.retail,
          supermarket: row.supermarket,
          wholesale: row.wholesale,
          agencyBasePrice: row.agencyBase,
          agencyGap: row.agencyGap,
        };
      });
      const result = await productsService.applyChannelPrices(items);
      showNotification({ title: 'قیمت فروش ثبت شد', message: `${result.modified.toLocaleString('fa-IR')} کالا در کاتالوگ و ارسال از کارخانه به‌روز شد.`, type: 'success' });
      await load();
    } catch (error) {
      showNotification({ title: 'ثبت نشد', message: apiErrorMessage(error, 'قیمت‌ها ذخیره نشد'), type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <IonPage>
      <IonHeader className="ion-no-border">
        <IonToolbar className="bg-white/90 backdrop-blur-md px-3 py-2 border-b border-sky-100">
          <div className="flex items-center gap-2">
            <button onClick={() => navigate(-1)} className="p-2 rounded-2xl bg-sky-50 text-sky-700" title="بازگشت">
              <ArrowRight className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-sm font-bold text-slate-800">تعیین قیمت</h1>
              <p className="text-[10px] text-slate-400">آخرین خرید، قیمت پایه نمایندگی، بعد فروش فروشگاه</p>
            </div>
          </div>
        </IonToolbar>
      </IonHeader>
      <IonContent className="bg-slate-50">
        <div className="p-3 max-w-md mx-auto space-y-3 pb-28">
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {companies.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => pick(name)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap ${active === name ? 'bg-sky-600 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}
              >
                {name}
              </button>
            ))}
          </div>

          {!company && <p className="text-xs text-slate-500 leading-6">شرکت را انتخاب کنید تا کالاها و آخرین فاکتور خریدشان بیاید.</p>}
          {company && loading && <p className="text-xs text-slate-400">در حال خواندن قیمت‌ها…</p>}

          {company && !loading && (
            <div className="rounded-2xl bg-white border border-amber-100 p-3 space-y-2">
              <p className="text-[11px] font-bold text-amber-900">قیمت پایه نمایندگی برای ارسال از کارخانه</p>
              <p className="text-[10px] text-slate-500 leading-5">
                آخرین فاکتور کارخانه بهای تمام‌شده شماست. قیمت پایه همان عددی است که به مشتری اعلام می‌کنید. اختلاف را یک‌بار بگذارید؛ با فاکتور خرید بعدی، قیمت پایه خودش جلو می‌رود.
              </p>
              <label className="text-[10px] text-slate-500 space-y-1 block">
                <span>اختلاف با آخرین خرید (تومان)</span>
                <MoneyTextInput className={field} value={Number(gapPlain) || 0} onChange={setGapPlain} />
              </label>
              <button type="button" onClick={applyGap} className="w-full rounded-xl bg-amber-600 py-2.5 text-xs font-bold text-white">اعمال اختلاف روی همه کالاها</button>
            </div>
          )}

          {company && !loading && (
            <div className="rounded-2xl bg-white border border-violet-100 p-3 space-y-2">
              <p className="text-[11px] font-bold text-violet-900">درصد روی قیمت آخرین خرید، برای فروش از فروشگاه</p>
              <div className="grid grid-cols-3 gap-2">
                <label className="text-[10px] text-slate-500 space-y-1"><span>تکی ٪</span><input className={field} inputMode="decimal" value={retailPct} onChange={(e) => setRetailPct(e.target.value)} /></label>
                <label className="text-[10px] text-slate-500 space-y-1"><span>سوپرمارکت ٪</span><input className={field} inputMode="decimal" value={superPct} onChange={(e) => setSuperPct(e.target.value)} /></label>
                <label className="text-[10px] text-slate-500 space-y-1"><span>عمده ٪</span><input className={field} inputMode="decimal" value={wholePct} onChange={(e) => setWholePct(e.target.value)} /></label>
              </div>
              <button type="button" onClick={applyPercents} className="w-full rounded-xl bg-violet-600 py-2.5 text-xs font-bold text-white">اعمال درصد</button>
              <p className="text-[10px] text-slate-400 leading-5">این درصدها قیمت تکی، سوپر و عمده فروشگاه را می‌سازند، نه قیمت پایه کارخانه.</p>
            </div>
          )}

          {products.map((p) => {
            const row = draft[p.productId] || rowOf(p);
            const buy = baseOf(p);
            const profit = row.agencyBase > 0 && buy > 0 ? row.agencyBase - buy : 0;
            return (
              <article key={p.productId} className="rounded-2xl bg-white border border-slate-200 p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-bold text-slate-800">{p.name}</h2>
                    <p className="text-[10px] text-slate-400 mt-0.5">{p.category} · هر {p.unit}</p>
                  </div>
                  <div className="text-left">
                    <p className="text-[10px] text-slate-400">آخرین خرید</p>
                    <p className="text-xs font-bold text-slate-800">{buy > 0 ? formatToman(buy) : 'ندارد'}</p>
                  </div>
                </div>
                {p.lastPurchase ? (
                  <p className="text-[10px] text-sky-800 bg-sky-50 rounded-xl px-2 py-1.5">
                    فاکتور {p.lastPurchase.invoiceNumber} · {formatJalaliIso(p.lastPurchase.invoiceDate)} · قیمت خرید {formatToman(p.lastPurchase.price)}
                  </p>
                ) : (
                  <p className="text-[10px] text-amber-700">فاکتور خریدی برای این کالا ثبت نشده.</p>
                )}
                <div className="grid grid-cols-2 gap-2 rounded-xl bg-amber-50/80 p-2">
                  <label className="text-[10px] text-slate-500 space-y-1"><span>اختلاف</span><MoneyTextInput className={field} value={row.agencyGap} onChange={(v) => setPrice(p.productId, 'agencyGap', v)} /></label>
                  <label className="text-[10px] text-slate-500 space-y-1"><span>قیمت پایه</span><MoneyTextInput className={field} value={row.agencyBase} onChange={(v) => setPrice(p.productId, 'agencyBase', v)} /></label>
                  {row.agencyBase > 0 && buy > 0 && (
                    <p className={`col-span-2 text-[10px] font-bold ${profit >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                      سود ارسال از کارخانه {formatToman(profit)} در هر {p.unit}
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <label className="text-[10px] text-slate-500 space-y-1"><span>تکی</span><MoneyTextInput className={field} value={row.retail} onChange={(v) => setPrice(p.productId, 'retail', v)} /></label>
                  <label className="text-[10px] text-slate-500 space-y-1"><span>سوپرمارکت</span><MoneyTextInput className={field} value={row.supermarket} onChange={(v) => setPrice(p.productId, 'supermarket', v)} /></label>
                  <label className="text-[10px] text-slate-500 space-y-1"><span>عمده</span><MoneyTextInput className={field} value={row.wholesale} onChange={(v) => setPrice(p.productId, 'wholesale', v)} /></label>
                </div>
              </article>
            );
          })}
          {company && products.length > 0 && (
            <button type="button" disabled={saving} onClick={() => void save()} className="w-full rounded-2xl bg-sky-600 py-3 text-sm font-bold text-white disabled:opacity-40">
              {saving ? 'در حال ذخیره…' : 'ثبت قیمت در کاتالوگ و فروش'}
            </button>
          )}
        </div>
      </IonContent>
    </IonPage>
  );
};
