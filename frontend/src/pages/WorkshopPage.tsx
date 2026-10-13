import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IonContent, IonHeader, IonPage, IonToolbar, useIonViewWillEnter } from '@ionic/react';
import { ArrowRight, Factory, Plus, Trash2, PackageCheck, Layers3, ReceiptText, CheckCircle2, ChevronLeft, History } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { productsService, type Product } from '../services/products.service';
import { workshopService, type WorkshopBatch, type WorkshopInput } from '../services/workshop.service';
import { useNotification } from '../context/NotificationContext';
import { MoneyTextInput } from '../components/ui/AmountInput';
import { NewProductModal } from '../components/products/NewProductModal';
import { kgPerUnit, tierPrice } from '../components/pos/cart';
import { useSettings } from '../services/settings.service';
import { formatToman, num } from '../lib/format';

const field = 'w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100';
const card = 'rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4 shadow-sm';
const initialLine = () => ({ productId: '', quantity: '', by: 'unit' as 'unit' | 'kg' });
const newRequestId = () => {
  // randomUUID is unavailable on local HTTP deployments.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const s = Array.from(bytes, (v) => v.toString(16).padStart(2, '0')).join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
};

export const WorkshopPage: React.FC = () => {
  const navigate = useNavigate();
  const settings = useSettings();
  const { showNotification } = useNotification();
  const [products, setProducts] = useState<Product[]>([]);
  const [history, setHistory] = useState<WorkshopBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lines, setLines] = useState([initialLine()]);
  const [outputId, setOutputId] = useState('');
  const [outputCategory, setOutputCategory] = useState('');
  const [tab, setTab] = useState<'create' | 'history'>('create');
  const [completed, setCompleted] = useState<WorkshopBatch | null>(null);
  const [outputQuantity, setOutputQuantity] = useState('');
  const [packaging, setPackaging] = useState('');
  const [labor, setLabor] = useState('');
  const [laborPercent, setLaborPercent] = useState('');
  const [profitPercent, setProfitPercent] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [newProduct, setNewProduct] = useState(false);
  const inFlight = useRef(false);
  // Keep the same payload and ID after a network timeout; retry must never deduct twice.
  const pendingRequest = useRef<WorkshopInput | null>(null);
  const [retryPending, setRetryPending] = useState(false);

  const loadingRequest = useRef<Promise<void> | null>(null);
  const load = useCallback(() => {
    if (loadingRequest.current) return loadingRequest.current;
    setLoading(true);
    const request = Promise.all([productsService.getAll(), workshopService.list()])
      .then(([ps, batches]) => { setProducts(ps); setHistory(batches); setLoadError(false); })
      .catch(() => { setLoadError(true); })
      .finally(() => { setLoading(false); loadingRequest.current = null; });
    loadingRequest.current = request;
    return request;
  }, []);
  useEffect(() => { void load(); }, [load]);
  useIonViewWillEnter(() => { void load(); }, [load]);
  const categories = useMemo(() => [...new Set(products.map((p) => p.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fa')), [products]);

  const output = products.find((p) => p._id === outputId);
  const baseRule = settings.categoryBasePrices.find((rule) => rule.category === outputCategory.trim());
  const autoSellPrice = output?.autoPricing && baseRule ? Math.round(baseRule.amount * (baseRule.unit === 'kg' ? kgPerUnit(output) : 1) * (1 + (output.commissionPercent || 0) / 100) + (output.commissionAmount || 0) * (output.commissionUnit === 'kg' ? kgPerUnit(output) : 1)) : null;
  const selectedSellPrice = output?.autoPricing ? autoSellPrice === null ? '' : String(autoSellPrice) : sellPrice;
  const prepared = lines.map((line) => {
    const product = products.find((p) => p._id === line.productId);
    const quantity = Math.round(Number(line.quantity) / (line.by === 'kg' && product ? kgPerUnit(product) || 1 : 1) * 1e6) / 1e6;
    return { product, quantity };
  });
  const materials = prepared.reduce((s, l) => s + (l.product?.buyPrice || 0) * (l.quantity || 0), 0);
  const laborTotal = Math.round(Number(labor) + (materials + Number(packaging)) * Number(laborPercent) / 100);
  const total = materials + Number(packaging) + laborTotal;
  const unitCost = Number(outputQuantity) > 0 ? total / Number(outputQuantity) : 0;
  const invalid = !outputCategory.trim() || !output || !(Number(outputQuantity) > 0) || !selectedSellPrice || prepared.some((l) => !l.product || !(l.quantity > 0) || l.quantity > l.product.stock || l.product._id === outputId);
  const chooseOutput = (p: Product) => { setOutputId(p._id); setOutputCategory(p.category || ''); setSellPrice(String(tierPrice(p, 'retail') || '')); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inFlight.current || (!pendingRequest.current && invalid)) return;
    inFlight.current = true; setSaving(true);
    if (!pendingRequest.current) pendingRequest.current = {
      requestId: newRequestId(), inputs: prepared.map((l) => ({ productId: l.product!._id, quantity: l.quantity })),
      outputProductId: outputId, outputCategory: outputCategory.trim(), outputQuantity: Number(outputQuantity), packagingCost: Number(packaging),
      laborCost: Number(labor), laborPercent: Number(laborPercent), sellPrice: Number(selectedSellPrice), notes,
    };
    try {
      const batch = await workshopService.create(pendingRequest.current);
      pendingRequest.current = null; setRetryPending(false);
      setCompleted(batch);
      setLines([initialLine()]); setOutputQuantity(''); setPackaging(''); setLabor(''); setLaborPercent(''); setNotes('');
      showNotification({ title: 'تولید ثبت شد', message: `${num(batch.output.quantity)} ${batch.output.unit} ${batch.output.productName} به موجودی اضافه شد.`, type: 'success' });
      await load();
    } catch (error: unknown) {
      const err = error as { response?: { status?: number; data?: { message?: string | string[] } } };
      const messages = err.response?.data?.message;
      const message = Array.isArray(messages) ? messages.join('، ') : messages;
      // Validation errors occur before writes, or after confirmed rollback. Keep the ID for all uncertain failures.
      const definitive = err.response?.status === 400 || (err.response?.status === 409 && message?.includes('این ثبت انجام نشد'));
      if (definitive) { pendingRequest.current = null; setRetryPending(false); await load(); }
      else setRetryPending(true);
      showNotification({ title: 'ثبت تولید', message: message || 'پاسخ سرور دریافت نشد. با دکمهٔ بررسی دوباره، وضعیت همین تولید را بررسی کنید.', type: 'error' });
    } finally { inFlight.current = false; setSaving(false); }
  };

  return <IonPage>
    <IonHeader className="ion-no-border"><IonToolbar>
      <div className="flex items-center gap-3 px-4 py-2">
        <button aria-label="بازگشت" onClick={() => navigate(-1)} className="p-2 rounded-xl bg-slate-100 text-slate-600"><ArrowRight size={20} /></button>
        <div className="rounded-xl bg-blue-100 p-2 text-blue-700"><Factory size={20} /></div>
        <div><h1 className="text-sm font-bold">تولید کارگاهی</h1><p className="text-[11px] text-slate-500 mt-1">تبدیل مواد اولیه به محصول آماده</p></div>
      </div>
    </IonToolbar></IonHeader>
    <IonContent>
      <div className="max-w-2xl mx-auto p-4 pb-24 space-y-5" dir="rtl">
        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-slate-200/60 p-1" role="group" aria-label="بخش تولید کارگاهی">
          <button type="button" aria-pressed={tab === 'create'} onClick={() => setTab('create')} className={`rounded-xl py-3 text-xs font-bold ${tab === 'create' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>ثبت تولید</button>
          <button type="button" aria-pressed={tab === 'history'} onClick={() => setTab('history')} className={`flex items-center justify-center gap-2 rounded-xl py-3 text-xs font-bold ${tab === 'history' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}><History size={15} />سوابق تولید</button>
        </div>
        {completed && <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 space-y-3">
          <div className="flex items-start gap-2 text-emerald-800"><CheckCircle2 size={20} className="shrink-0" /><div><p className="text-sm font-bold">تولید با موفقیت ثبت شد</p><p className="text-xs mt-1 leading-6">{num(completed.output.quantity, 3)} {completed.output.unit} {completed.output.productName} به موجودی اضافه شد.</p></div></div>
          <button type="button" onClick={() => navigate(`/products?productId=${completed.output.productId}`)} className="flex items-center gap-1 text-xs font-bold text-emerald-800">مشاهده محصول در مدیریت کالاها<ChevronLeft size={16} /></button>
        </div>}
        {loadError && <div role="alert" className="rounded-xl bg-rose-50 p-3 text-xs text-rose-700">دریافت اطلاعات انجام نشد. <button type="button" onClick={() => void load()} className="underline">تلاش دوباره</button></div>}
        {loading && <p role="status" className="text-xs text-slate-500">در حال دریافت موجودی و سوابق…</p>}
        {tab === 'create' ? <form onSubmit={submit} className="space-y-5">
          <fieldset disabled={saving || loading || loadError || retryPending} className="space-y-5 disabled:opacity-60 min-w-0">
            <section className={card} aria-labelledby="workshop-output-title">
              <div className="flex items-center gap-3"><span className="flex items-center justify-center w-9 h-9 rounded-xl bg-blue-50 text-blue-700 font-bold">۱</span><div><h2 id="workshop-output-title" className="text-sm font-bold">محصول تولیدی</h2><p className="text-[11px] text-slate-500 mt-1">محصولی که پس از تولید وارد انبار می‌شود</p></div><PackageCheck size={20} className="mr-auto text-blue-500" /></div>
              <label className="block space-y-2"><span className="text-xs text-slate-600">محصول خروجی <span className="text-rose-500">*</span></span>
                <select className={field} value={outputId} onChange={(e) => { const p = products.find((p) => p._id === e.target.value); if (p) chooseOutput(p); else { setOutputId(''); setOutputCategory(''); } }} required>
                  <option value="">انتخاب محصول</option>
                  {products.filter((p) => !lines.some((l) => l.productId === p._id)).map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
                </select>
              </label>
              <button type="button" onClick={() => setNewProduct(true)} className="flex items-center gap-1.5 rounded-xl border border-dashed border-blue-200 bg-blue-50 px-3 py-2.5 text-xs font-bold text-blue-700"><Plus size={16} />تعریف محصول جدید</button>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-2"><span className="text-xs text-slate-600">دسته‌بندی محصول <span className="text-rose-500">*</span></span>
                  <input className={field} list="workshop-categories" value={outputCategory} onChange={(e) => setOutputCategory(e.target.value)} placeholder="انتخاب یا نوشتن دسته‌بندی" maxLength={120} required />
                  <datalist id="workshop-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
                </label>
                <label className="block space-y-2"><span className="text-xs text-slate-600">مقدار تولید ({output?.unit || 'واحد انبار'}) <span className="text-rose-500">*</span></span>
                  <input className={field} type="number" inputMode="decimal" min="0.000001" max="1000000000" step="any" value={outputQuantity} onChange={(e) => setOutputQuantity(e.target.value)} placeholder="۰" required />
                </label>
              </div>
              {output && <div className="flex flex-wrap justify-between gap-2 rounded-xl bg-blue-50 px-3 py-2.5 text-xs text-blue-800"><span>موجودی فعلی: {num(output.stock, 3)} {output.unit}</span><strong>پس از تولید: {num(output.stock + (Number(outputQuantity) || 0), 3)} {output.unit}</strong></div>}
              <p className="text-[11px] text-slate-500 leading-5">محصول با همین دسته‌بندی در مدیریت کالاها و صفحه فروش نمایش داده می‌شود.</p>
            </section>

            <section className={card} aria-labelledby="workshop-materials-title">
              <div className="flex items-center gap-3"><span className="flex items-center justify-center w-9 h-9 rounded-xl bg-blue-50 text-blue-700 font-bold">۲</span><div><h2 id="workshop-materials-title" className="text-sm font-bold">مواد مصرفی</h2><p className="text-[11px] text-slate-500 mt-1">مقدار مصرف برای کل این نوبت تولید</p></div><Layers3 size={20} className="mr-auto text-blue-500" /></div>
              {lines.map((line, index) => {
                const p = prepared[index].product;
                const shortage = !!p && prepared[index].quantity > p.stock;
                const edit = (next: Partial<typeof line>) => setLines((prev) => prev.map((l, i) => i === index ? { ...l, ...next } : l));
                return <div key={index} className={`rounded-xl p-3 space-y-3 border ${shortage ? 'border-rose-200 bg-rose-50' : 'border-slate-200 bg-slate-50'}`}>
                  <div className="flex items-center justify-between"><span className="text-xs font-bold text-slate-600">مادهٔ {num(index + 1)}</span><button type="button" aria-label={`حذف ماده ${index + 1}`} disabled={lines.length === 1} onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))} className="p-2 text-rose-500 disabled:opacity-20"><Trash2 size={17} /></button></div>
                  <select aria-label={`ماده مصرفی ${index + 1}`} className={field} value={line.productId} onChange={(e) => edit({ productId: e.target.value, by: 'unit' })} required>
                    <option value="">انتخاب ماده یا بسته‌بندی</option>
                    {products.filter((item) => item._id !== outputId && !lines.some((l, i) => i !== index && l.productId === item._id)).map((item) => <option key={item._id} value={item._id}>{item.name} · {num(item.stock, 3)} {item.unit}</option>)}
                  </select>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="space-y-1.5"><span className="text-[11px] text-slate-500">مقدار مصرف</span><input aria-label={`مقدار مصرف ${index + 1}`} className={field} type="number" inputMode="decimal" min="0.000001" step="any" required value={line.quantity} onChange={(e) => edit({ quantity: e.target.value })} placeholder="۰" /></label>
                    <label className="space-y-1.5"><span className="text-[11px] text-slate-500">واحد</span><select aria-label={`واحد مصرف ${index + 1}`} className={field} value={line.by} onChange={(e) => edit({ by: e.target.value as 'unit' | 'kg' })}>
                      <option value="unit">{p?.unit || 'واحد انبار'}</option>
                      {p && kgPerUnit(p) > 0 && p.unit !== 'کیلوگرم' && <option value="kg">کیلوگرم</option>}
                    </select></label>
                  </div>
                  {p && <div className={`flex flex-wrap justify-between gap-2 text-[11px] ${shortage ? 'text-rose-700' : 'text-slate-500'}`}><span>مانده پس از تولید: {num(p.stock - (prepared[index].quantity || 0), 3)} {p.unit}</span><span>بها: {formatToman((p.buyPrice || 0) * (prepared[index].quantity || 0))}</span></div>}
                  {shortage && <p role="alert" className="text-xs text-rose-700">مقدار مصرف بیشتر از موجودی است.</p>}
                  {p && !p.buyPrice && <p className="text-[11px] text-amber-700">قیمت خرید این ماده صفر است؛ در صورت نیاز آن را در مدیریت کالاها اصلاح کنید.</p>}
                </div>;
              })}
              <button type="button" disabled={lines.length >= 100} onClick={() => setLines((prev) => [...prev, initialLine()])} className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-blue-200 py-3 text-xs font-bold text-blue-700"><Plus size={16} />افزودن ماده مصرفی</button>
            </section>

            <section className={card} aria-labelledby="workshop-cost-title">
              <div className="flex items-center gap-3"><span className="flex items-center justify-center w-9 h-9 rounded-xl bg-blue-50 text-blue-700 font-bold">۳</span><div><h2 id="workshop-cost-title" className="text-sm font-bold">هزینه‌ها و قیمت فروش</h2><p className="text-[11px] text-slate-500 mt-1">تمام مبالغ به تومان</p></div><ReceiptText size={20} className="mr-auto text-blue-500" /></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-xs text-slate-600 space-y-2"><span>هزینهٔ بسته‌بندی کل</span><MoneyTextInput className={field} value={packaging} onChange={setPackaging} placeholder="۰" /></label>
                <label className="block text-xs text-slate-600 space-y-2"><span>اجرت و سایر هزینه‌های کل</span><MoneyTextInput className={field} value={labor} onChange={setLabor} placeholder="۰" /></label>
              </div>
              <p className="text-[11px] text-slate-500 leading-5">اگر بسته‌بندی را در مواد مصرفی انتخاب کرده‌اید، هزینهٔ آن را دوباره وارد نکنید.</p>
              <label className="block text-xs text-slate-600 space-y-2"><span>دستمزد درصدی روی بهای مواد و بسته‌بندی</span><input type="number" min="0" max="1000" step="any" className={field} value={laborPercent} onChange={(e) => setLaborPercent(e.target.value)} placeholder="۰٪" /></label>
              <p className="text-xs text-blue-700">دستمزد نهایی (ثابت + درصدی): {formatToman(laborTotal)}</p>
              <div className="grid grid-cols-2 gap-3 items-end"><label className="text-xs text-slate-600 space-y-2"><span>درصد سود فروش روی بهای تولید</span><input type="number" min="0" max="1000" step="any" className={field} value={profitPercent} onChange={(e) => setProfitPercent(e.target.value)} placeholder="۰٪" /></label><button type="button" disabled={!unitCost || !!output?.autoPricing} onClick={() => setSellPrice(String(Math.round(unitCost * (1 + Number(profitPercent) / 100))))} className="rounded-xl bg-blue-50 text-blue-700 py-3 text-xs font-bold">محاسبهٔ قیمت فروش</button></div>
              <label className="block text-xs text-slate-600 space-y-2"><span>قیمت فروش هر {output?.unit || 'واحد'} <span className="text-rose-500">*</span></span>{output?.autoPricing ? <p className="rounded-xl bg-blue-50 p-3 text-blue-800 leading-6">{autoSellPrice === null ? 'ابتدا قیمت پایهٔ این دسته را در مدیریت کالاها ثبت کنید.' : `${formatToman(autoSellPrice)} — قیمت پایهٔ دسته + کارمزد محصول (خودکار)`}</p> : <MoneyTextInput className={field} value={sellPrice} onChange={setSellPrice} />}</label>
              <label className="block text-xs text-slate-600 space-y-2"><span>یادداشت (اختیاری)</span><textarea rows={2} maxLength={1000} className={field} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="توضیحات این نوبت تولید" /></label>
            </section>
          </fieldset>
          <section className="rounded-2xl bg-blue-900 p-5 space-y-3 text-xs text-blue-100" aria-label="خلاصه تولید">
            <h2 className="text-sm font-bold text-white">خلاصهٔ تولید</h2>
            <div className="flex justify-between gap-3"><span>بهای مواد مصرفی</span><strong>{formatToman(materials)}</strong></div>
            <div className="flex justify-between gap-3"><span>بسته‌بندی و اجرت</span><strong>{formatToman(Number(packaging) + laborTotal)}</strong></div>
            <div className="flex justify-between gap-3 border-t border-blue-700 pt-3 text-white"><span>بهای کل تولید</span><strong>{formatToman(total)}</strong></div>
            <div className="flex justify-between gap-3"><span>بهای هر {output?.unit || 'واحد'} محصول</span><strong>{formatToman(unitCost)}</strong></div>
            <p className="text-[10px] leading-5 text-blue-200">برآورد بر اساس قیمت خرید فعلی مواد است. گزارش سود، بهای مواد را به ترتیب خریدهای انبار محاسبه می‌کند.</p>
          </section>
          {retryPending && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-xs leading-6 text-amber-800">وضعیت ثبت قبلی هنوز مشخص نیست. بررسی دوباره، همان درخواست را پیگیری می‌کند و موجودی دوباره کسر نمی‌شود.</p>}
          <button type="submit" disabled={saving || (!retryPending && (invalid || loading || loadError))} className="w-full flex items-center justify-center gap-2 rounded-2xl bg-blue-600 text-white py-4 text-sm font-bold shadow-sm disabled:opacity-40"><PackageCheck size={18} />{saving ? 'در حال ثبت تولید…' : retryPending ? 'بررسی دوبارهٔ همین تولید' : 'ثبت تولید و به‌روزرسانی موجودی'}</button>
          <p className="text-center text-[11px] text-slate-500">با ثبت، مواد مصرفی کسر و محصول تولیدی به موجودی اضافه می‌شود.</p>
        </form> : <section className="space-y-3" aria-label="سوابق تولید">
          <div className="flex items-center justify-between"><h2 className="text-sm font-bold text-slate-700">سوابق تولید</h2><span className="text-[11px] text-slate-400">۵۰ ثبت اخیر</span></div>
          {!loading && !loadError && !history.length && <div className={`${card} text-center py-10`}><Factory size={32} className="mx-auto text-slate-300" /><p className="text-sm text-slate-500">هنوز تولیدی ثبت نشده است.</p><button type="button" onClick={() => setTab('create')} className="text-xs font-bold text-blue-700">ثبت اولین تولید</button></div>}
          {history.map((batch) => <details key={batch._id} className="rounded-2xl border border-slate-200 bg-white p-4 text-xs">
            <summary className="cursor-pointer font-bold text-slate-700 leading-6">{batch.output.productName} · {num(batch.output.quantity, 3)} {batch.output.unit}<span className="block text-[10px] font-normal text-slate-400">{new Date(batch.date).toLocaleString('fa-IR')} · {batch.createdByName}</span></summary>
            <div className="pt-3 mt-3 border-t border-slate-100 space-y-3 text-slate-600">
              {batch.output.category && <p>دسته‌بندی: {batch.output.category}</p>}
              {batch.inputs.map((l) => <div key={l.productId} className="flex justify-between gap-2"><span>{l.productName} · {num(l.quantity, 3)} {l.unit}</span><span>{formatToman(l.quantity * l.unitCost)}</span></div>)}
              <p>بسته‌بندی: {formatToman(batch.packagingCost)} · اجرت: {formatToman(batch.laborCost)}{batch.laborPercent ? ` (شامل ${num(batch.laborPercent)}٪ دستمزد)` : ''}</p>
              <p className="font-bold">بهای کل: {formatToman(batch.totalCost)}</p><p>قیمت فروش هر {batch.output.unit}: {formatToman(batch.sellPrice)}</p>
              {batch.notes && <p className="rounded-xl bg-slate-50 p-3 leading-6">{batch.notes}</p>}
              <button type="button" onClick={() => navigate(`/products?productId=${batch.output.productId}`)} className="flex items-center gap-1 text-xs font-bold text-blue-700">مشاهده محصول<ChevronLeft size={16} /></button>
            </div>
          </details>)}
        </section>}
      </div>
      {newProduct && <NewProductModal isOpen onClose={() => setNewProduct(false)} productionOutput categories={categories} onProductSaved={(p) => { setProducts((prev) => [...prev, p]); chooseOutput(p); }} />}
    </IonContent>
  </IonPage>;
};
