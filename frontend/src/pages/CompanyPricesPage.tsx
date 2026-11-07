import React, { useCallback, useEffect, useState } from 'react';
import { IonContent, IonHeader, IonPage, IonToolbar } from '@ionic/react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { invoicesService, type PriceBoardProduct } from '../services/invoices.service';
import { productsService } from '../services/products.service';
import { MoneyTextInput } from '../components/ui/AmountInput';
import { useNotification } from '../context/NotificationContext';
import { apiErrorMessage } from '../services/invoices.service';
import { formatToman, num, parseDecimal } from '../lib/format';
import { formatJalaliIso } from '../lib/jalali';
import { sellFromBase } from '../lib/packPrice';

type Draft = { retail: number; supermarket: number; wholesale: number; agencyGap: number; agencyBase: number; feePerKg: number; feePerPack: number; kiloBase: number };

const field = 'w-full rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs font-bold';
const DEFAULT_GAP = 5000;
type RoundDir = 'near' | 'up' | 'down';

const roundMoney = (n: number, step: number, dir: RoundDir) => {
  if (!(n > 0)) return 0;
  if (!(step > 1)) return Math.round(n);
  const q = n / step;
  const k = dir === 'up' ? Math.ceil(q - 1e-9) : dir === 'down' ? Math.floor(q + 1e-9) : Math.round(q);
  return Math.max(0, k * step);
};

const riseOf = (price: number, base: number) => {
  if (!(base > 0) || !(price > 0)) return '';
  const pct = Math.round(((price - base) / base) * 1000) / 10;
  return `${pct > 0 ? '+' : ''}${num(pct, 1)}٪`;
};

const rowOf = (p: PriceBoardProduct): Draft => ({
  retail: p.retail,
  supermarket: p.supermarket,
  wholesale: p.wholesale,
  agencyGap: p.agencyGap || 0,
  agencyBase: p.agencyBasePrice || 0,
  feePerKg: p.commissionUnit === 'kg' ? p.commissionAmount || 0 : 0,
  feePerPack: (p.packageFee || 0) + (p.commissionUnit === 'unit' ? p.commissionAmount || 0 : 0),
  kiloBase: p.basePerKg || 0,
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
  const [roundStep, setRoundStep] = useState(1000);
  const [roundDir, setRoundDir] = useState<RoundDir>('near');
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
  const kgOf = (p: PriceBoardProduct) => p.weightPerUnitKg || (p.unit === 'کیلوگرم' ? 1 : 0);
  const quotePack = (p: PriceBoardProduct, row: Draft, pct: string, current: number) => {
    if (pct.trim() === '') return current;
    const n = parseDecimal(pct);
    const kg = kgOf(p);
    const buy = baseOf(p);
    const buyPerKg = kg > 0 && buy > 0 ? buy / kg : buy;
    const basePerKg = row.kiloBase > 0 ? row.kiloBase : buyPerKg;
    if (!(basePerKg > 0)) return current;
    return roundMoney(sellFromBase({ basePerKg, feePerKg: row.feePerKg, feePerPack: row.feePerPack, percent: n, kg }).pack, roundStep, roundDir);
  };

  const applyPercents = () => {
    setDraft((prev) => {
      const next = { ...prev };
      for (const p of products) {
        const row = next[p.productId] || rowOf(p);
        next[p.productId] = {
          ...row,
          retail: quotePack(p, row, retailPct, row.retail),
          supermarket: quotePack(p, row, superPct, row.supermarket),
          wholesale: quotePack(p, row, wholePct, row.wholesale),
        };
      }
      return next;
    });
  };

  const applyOne = (productId: string) => {
    const product = products.find((item) => item.productId === productId);
    if (!product) return;
    setDraft((prev) => {
      const row = prev[productId] || rowOf(product);
      return {
        ...prev,
        [productId]: {
          ...row,
          retail: quotePack(product, row, retailPct, row.retail),
          supermarket: quotePack(product, row, superPct, row.supermarket),
          wholesale: quotePack(product, row, wholePct, row.wholesale),
        },
      };
    });
  };

  const applyGap = () => {
    const gap = Math.max(0, Math.round(Number(gapPlain) || 0));
    setDraft((prev) => {
      const next = { ...prev };
      for (const p of products) {
        const buy = baseOf(p);
        const row = next[p.productId] || rowOf(p);
        const agencyBase = buy > 0 ? roundMoney(buy + gap, roundStep, roundDir) : row.agencyBase;
        next[p.productId] = {
          ...row,
          agencyGap: buy > 0 ? Math.max(0, agencyBase - buy) : gap,
          agencyBase,
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
      const row = prev[id] || { retail: 0, supermarket: 0, wholesale: 0, agencyGap: 0, agencyBase: 0, feePerKg: 0, feePerPack: 0, kiloBase: 0 };
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
          commissionAmount: row.feePerKg,
          commissionUnit: 'kg' as const,
          packageFee: row.feePerPack,
          basePerKg: row.kiloBase || (kgOf(p) > 0 && baseOf(p) > 0 ? Math.round(baseOf(p) / kgOf(p)) : baseOf(p)),
        };
      });
      const result = await productsService.applyChannelPrices(items);
      showNotification({ title: 'قیمت فروش ثبت شد', message: `${result.modified.toLocaleString('fa-IR')} کالا در لیست کالا، فروشگاه و ارسال از کارخانه به‌روز شد.`, type: 'success' });
      window.dispatchEvent(new Event('ario-prices-applied'));
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
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold text-slate-600">رند کردن روی اعمال</p>
                <div className="grid grid-cols-3 gap-1">
                  {(
                    [
                      [1, 'بدون رند'],
                      [500, '۵۰۰ تومانی'],
                      [1000, '۱۰۰۰ تومانی'],
                    ] as const
                  ).map(([step, label]) => (
                    <button key={step} type="button" onClick={() => setRoundStep(step)} className={`py-2 rounded-xl text-[10px] font-bold border ${roundStep === step ? 'bg-slate-800 text-white border-slate-800' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                      {label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {(
                    [
                      ['down', 'رند پایین'],
                      ['near', 'نزدیک'],
                      ['up', 'رند بالا'],
                    ] as const
                  ).map(([dir, label]) => (
                    <button key={dir} type="button" onClick={() => setRoundDir(dir)} className={`py-2 rounded-xl text-[10px] font-bold border ${roundDir === dir ? 'bg-violet-700 text-white border-violet-700' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <button type="button" onClick={applyPercents} className="w-full rounded-xl bg-violet-600 py-2.5 text-xs font-bold text-white">اعمال درصد</button>
              <p className="text-[10px] text-slate-400 leading-5">درصد روی قیمت پایهٔ هر کیلو به‌علاوه کارمزد می‌نشیند. کارمزد را می‌توانید کیلویی، بسته‌ای، یا هر دو بزنید. کارمزد بسته اول به هر کیلو تقسیم می‌شود.</p>
            </div>
          )}

          {company && !loading && products.length === 0 && (
            <p className="text-xs text-slate-500 leading-6">برای این شرکت کالایی پیدا نشد. کالا یا از نام شرکت روی خودش می‌آید، یا از آخرین فاکتور خرید همان شرکت.</p>
          )}

          {products.map((p) => {
            const row = draft[p.productId] || rowOf(p);
            const buy = baseOf(p);
            const kg = kgOf(p);
            const perKg = (amount: number) => (kg > 0 && amount > 0 ? Math.round(amount / kg) : 0);
            const buyPerKg = kg > 0 && buy > 0 ? buy / kg : buy;
            const basePerKg = row.kiloBase > 0 ? row.kiloBase : buyPerKg;
            const perKgFee = (row.feePerKg || 0) + (kg > 0 ? (row.feePerPack || 0) / kg : row.feePerPack || 0);
            const samplePct = retailPct.trim() === '' ? 0 : parseDecimal(retailPct);
            const preview = basePerKg > 0 ? sellFromBase({ basePerKg, feePerKg: row.feePerKg, feePerPack: row.feePerPack, percent: Number.isFinite(samplePct) ? samplePct : 0, kg }) : null;
            const spreadPerKg = preview && buyPerKg > 0 ? preview.sellPerKg - buyPerKg : 0;
            const inflationPerKg = basePerKg > 0 && buyPerKg > 0 ? basePerKg - buyPerKg : 0;
            const realPerKg = preview ? preview.sellPerKg - basePerKg : 0;
            const profit = row.agencyBase > 0 && buy > 0 ? row.agencyBase - buy : 0;
            const tierProfit = (v: number) => (buy > 0 && v > 0 ? v - buy : null);
            const tierProfitText = (label: string, v: number) => {
              const t = tierProfit(v);
              if (t === null) return null;
              return (
                <span key={label} className={`font-bold ${t >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                  {label} {t >= 0 ? '+' : '−'}{formatToman(Math.abs(t))}
                </span>
              );
            };
            const kiloLine = (amount: number) => (perKg(amount) > 0 ? `هر کیلو ${formatToman(perKg(amount))}` : kg > 0 ? '' : 'وزن هر واحد نیست');
            return (
              <article key={p.productId} className="rounded-2xl bg-white border border-slate-200 p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-bold text-slate-800">{p.name}</h2>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {p.category} · هر {p.unit}
                      {kg > 0 ? ` · ${num(kg, 2)} کیلو` : ''}
                    </p>
                  </div>
                  <div className="text-left">
                    <p className="text-[10px] text-slate-400">آخرین خرید</p>
                    <p className="text-xs font-bold text-slate-800">{buy > 0 ? formatToman(buy) : 'ندارد'}</p>
                    {buy > 0 && <p className="text-[10px] text-slate-500">{kiloLine(buy)}</p>}
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
                  {row.agencyBase > 0 && (
                    <p className="col-span-2 text-[10px] text-slate-600">
                      {kiloLine(row.agencyBase)}
                      {buy > 0 ? ` · افزایش ${riseOf(row.agencyBase, buy) || '۰٪'}` : ''}
                    </p>
                  )}
                  {row.agencyBase > 0 && buy > 0 && (
                    <p className={`col-span-2 text-[10px] font-bold ${profit >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                      سود ارسال از کارخانه {formatToman(profit)} در هر {p.unit}
                      {perKg(profit) > 0 ? ` · هر کیلو ${formatToman(perKg(Math.abs(profit)))}` : ''}
                    </p>
                  )}
                </div>
                <div className="rounded-xl border border-slate-100 p-2 space-y-2">
                  <span className="text-[11px] font-bold text-slate-700">کارمزد این کالا</span>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-[10px] text-slate-500 space-y-1 block">
                      <span>هر کیلو</span>
                      <MoneyTextInput className={field} value={row.feePerKg} onChange={(v) => setPrice(p.productId, 'feePerKg', v)} />
                    </label>
                    <label className="text-[10px] text-slate-500 space-y-1 block">
                      <span>هر {p.unit || 'بسته'}</span>
                      <MoneyTextInput className={field} value={row.feePerPack} onChange={(v) => setPrice(p.productId, 'feePerPack', v)} />
                    </label>
                  </div>
                  <label className="text-[10px] text-slate-500 space-y-1 block">
                    <span>قیمت پایه هر کیلو</span>
                    <MoneyTextInput className={field} value={row.kiloBase || Math.round(buyPerKg)} onChange={(v) => setPrice(p.productId, 'kiloBase', v)} />
                  </label>
                  {(row.feePerKg > 0 || row.feePerPack > 0) && (
                    <p className="text-[10px] text-slate-600">
                      {row.feePerKg > 0 ? `کارمزد کیلویی ${formatToman(row.feePerKg)}. ` : ''}
                      {row.feePerPack > 0 && kg > 0 ? `کارمزد ${p.unit || 'بسته'} ${formatToman(row.feePerPack)} یعنی هر کیلو ${num(row.feePerPack / kg, 2)} تومان. ` : ''}
                      جمع کارمزد هر کیلو {num(perKgFee, 2)} تومان است.
                    </p>
                  )}
                  {preview && buyPerKg > 0 && (
                    <p className="text-[10px] text-slate-700 leading-5">
                      این بار کیلویی {formatToman(Math.round(buyPerKg))} خریده شده. قیمت پایه {formatToman(Math.round(basePerKg))}
                      {Number.isFinite(samplePct) && samplePct !== 0 ? ` با درصد ${num(samplePct, 2)} می‌شود ${formatToman(Math.round(preview.sellPerKg))}` : ` و فروش هر کیلو ${formatToman(Math.round(preview.sellPerKg))}`}.
                      مابه‌التفاوت هر کیلو {formatToman(Math.round(spreadPerKg))} است: {formatToman(Math.round(inflationPerKg))} اثر گران شدن تا قیمت پایه، و {formatToman(Math.round(realPerKg))} درصد و کارمزد.
                    </p>
                  )}
                  <button type="button" onClick={() => applyOne(p.productId)} className="w-full rounded-xl bg-slate-800 py-2 text-[11px] font-bold text-white">محاسبه کارمزد و درصد این کالا</button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <label className="text-[10px] text-slate-500 space-y-1">
                    <span>تکی {buy > 0 ? riseOf(row.retail, buy) : ''}</span>
                    <MoneyTextInput className={field} value={row.retail} onChange={(v) => setPrice(p.productId, 'retail', v)} />
                    <span className="block text-slate-400">{kiloLine(row.retail)}</span>
                  </label>
                  <label className="text-[10px] text-slate-500 space-y-1">
                    <span>سوپرمارکت {buy > 0 ? riseOf(row.supermarket, buy) : ''}</span>
                    <MoneyTextInput className={field} value={row.supermarket} onChange={(v) => setPrice(p.productId, 'supermarket', v)} />
                    <span className="block text-slate-400">{kiloLine(row.supermarket)}</span>
                  </label>
                  <label className="text-[10px] text-slate-500 space-y-1">
                    <span>عمده {buy > 0 ? riseOf(row.wholesale, buy) : ''}</span>
                    <MoneyTextInput className={field} value={row.wholesale} onChange={(v) => setPrice(p.productId, 'wholesale', v)} />
                    <span className="block text-slate-400">{kiloLine(row.wholesale)}</span>
                  </label>
                </div>
                {buy > 0 && (
                  <p className="text-[10px] leading-5 flex flex-wrap gap-x-3 gap-y-0.5 rounded-xl bg-slate-50 px-2 py-1.5">
                    <span className="text-slate-500">سود نسبت به آخرین خرید:</span>
                    {tierProfitText('تکی', row.retail)}
                    {tierProfitText('سوپرمارکت', row.supermarket)}
                    {tierProfitText('عمده', row.wholesale)}
                    <span className="text-violet-700 font-bold">
                      رند: {roundStep > 1 ? `${num(roundStep)} تومانی` : 'بدون رند'} · {roundDir === 'up' ? 'بالا' : roundDir === 'down' ? 'پایین' : 'نزدیک'}
                    </span>
                  </p>
                )}
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
