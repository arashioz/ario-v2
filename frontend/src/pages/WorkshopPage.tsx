import React, { useEffect, useRef, useState } from 'react';
import { IonContent, IonHeader, IonPage, IonToolbar } from '@ionic/react';
import { ArrowRight, Factory, Plus, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { productsService, type Product } from '../services/products.service';
import { workshopService, type WorkshopBatch, type WorkshopInput } from '../services/workshop.service';
import { useNotification } from '../context/NotificationContext';
import { MoneyTextInput } from '../components/ui/AmountInput';
import { NewProductModal } from '../components/products/NewProductModal';
import { kgPerUnit, tierPrice } from '../components/pos/cart';
import { formatToman, num } from '../lib/format';

const field = 'w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs outline-none focus:border-sky-500';
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
  const { showNotification } = useNotification();
  const [products, setProducts] = useState<Product[]>([]);
  const [history, setHistory] = useState<WorkshopBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lines, setLines] = useState([initialLine()]);
  const [outputId, setOutputId] = useState('');
  const [outputQuantity, setOutputQuantity] = useState('');
  const [packaging, setPackaging] = useState('');
  const [labor, setLabor] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [newProduct, setNewProduct] = useState(false);
  const inFlight = useRef(false);
  // Keep the same payload and ID after a network timeout; retry must never deduct twice.
  const pendingRequest = useRef<WorkshopInput | null>(null);
  const [retryPending, setRetryPending] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [ps, batches] = await Promise.all([productsService.getAll(), workshopService.list()]);
      setProducts(ps); setHistory(batches); setLoadError(false);
    } catch { setLoadError(true); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const output = products.find((p) => p._id === outputId);
  const prepared = lines.map((line) => {
    const product = products.find((p) => p._id === line.productId);
    const quantity = Math.round(Number(line.quantity) / (line.by === 'kg' && product ? kgPerUnit(product) || 1 : 1) * 1e6) / 1e6;
    return { product, quantity };
  });
  const materials = prepared.reduce((s, l) => s + (l.product?.buyPrice || 0) * (l.quantity || 0), 0);
  const total = materials + Number(packaging) + Number(labor);
  const unitCost = Number(outputQuantity) > 0 ? total / Number(outputQuantity) : 0;
  const invalid = !output || !(Number(outputQuantity) > 0) || !sellPrice || prepared.some((l) => !l.product || !(l.quantity > 0) || l.quantity > l.product.stock || l.product._id === outputId);
  const chooseOutput = (p: Product) => { setOutputId(p._id); setSellPrice(String(tierPrice(p, 'retail') || '')); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inFlight.current || (!pendingRequest.current && invalid)) return;
    inFlight.current = true; setSaving(true);
    if (!pendingRequest.current) pendingRequest.current = {
      requestId: newRequestId(), inputs: prepared.map((l) => ({ productId: l.product!._id, quantity: l.quantity })),
      outputProductId: outputId, outputQuantity: Number(outputQuantity), packagingCost: Number(packaging),
      laborCost: Number(labor), sellPrice: Number(sellPrice), notes,
    };
    try {
      const batch = await workshopService.create(pendingRequest.current);
      pendingRequest.current = null; setRetryPending(false);
      setLines([initialLine()]); setOutputQuantity(''); setPackaging(''); setLabor(''); setNotes('');
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
        <button aria-label="بازگشت" onClick={() => navigate(-1)} className="p-2 rounded-xl bg-sky-50 text-sky-700"><ArrowRight size={20} /></button>
        <Factory size={20} className="text-sky-600" /><h1 className="text-sm font-bold">تولید کارگاهی</h1>
      </div>
    </IonToolbar></IonHeader>
    <IonContent>
      <div className="max-w-lg mx-auto p-4 pb-24 space-y-4" dir="rtl">
        <p className="text-xs text-slate-500 leading-6">مواد مصرفی از موجودی کم می‌شوند و محصول آماده به انبار اضافه می‌شود. مقدارها و هزینه‌ها را برای کل این نوبت تولید وارد کنید.</p>
        {loadError && <div className="rounded-xl bg-rose-50 p-3 text-xs text-rose-700">دریافت اطلاعات انجام نشد. <button type="button" onClick={() => void load()} className="underline">تلاش دوباره</button></div>}
        {loading && <p className="text-xs text-slate-500">در حال دریافت موجودی و سوابق…</p>}
        <form onSubmit={submit} className="space-y-4">
          <fieldset disabled={saving || loading || loadError || retryPending} className="space-y-4 disabled:opacity-60">
            <section className="rounded-2xl border border-slate-200 bg-slate-50 p-3 space-y-3">
              <h2 className="text-sm font-bold">مواد و کالاهای مصرفی</h2>
              {lines.map((line, index) => {
                const p = prepared[index].product;
                const edit = (next: Partial<typeof line>) => setLines((prev) => prev.map((l, i) => i === index ? { ...l, ...next } : l));
                return <div key={index} className="rounded-xl bg-white p-3 space-y-2 border border-slate-100">
                  <div className="flex gap-2">
                    <select aria-label={`ماده مصرفی ${index + 1}`} className={field} value={line.productId} onChange={(e) => edit({ productId: e.target.value, by: 'unit' })} required>
                      <option value="">انتخاب ماده یا بسته‌بندی</option>
                      {products.filter((item) => item._id !== outputId && !lines.some((l, i) => i !== index && l.productId === item._id)).map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
                    </select>
                    <button type="button" aria-label="حذف ماده" disabled={lines.length === 1} onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))} className="text-rose-500 disabled:opacity-20"><Trash2 size={18} /></button>
                  </div>
                  <div className="flex gap-2">
                    <input aria-label={`مقدار مصرف ${index + 1}`} className={field} type="number" inputMode="decimal" min="0.000001" step="any" required value={line.quantity} onChange={(e) => edit({ quantity: e.target.value })} placeholder="مقدار مصرف" />
                    <select aria-label="واحد مصرف" className={field} value={line.by} onChange={(e) => edit({ by: e.target.value as 'unit' | 'kg' })}>
                      <option value="unit">{p?.unit || 'واحد انبار'}</option>
                      {p && kgPerUnit(p) > 0 && p.unit !== 'کیلوگرم' && <option value="kg">کیلوگرم</option>}
                    </select>
                  </div>
                  {p && <p className={`text-[11px] ${prepared[index].quantity > p.stock ? 'text-rose-600' : 'text-slate-500'}`}>موجودی: {num(p.stock, 3)} {p.unit} · پس از تولید: {num(p.stock - (prepared[index].quantity || 0), 3)} {p.unit}</p>}
                  {p && !p.buyPrice && <p className="text-[11px] text-amber-700">بهای این ماده صفر است؛ در صورت نیاز قیمت خرید آن را اصلاح کنید.</p>}
                </div>;
              })}
              <button type="button" disabled={lines.length >= 100} onClick={() => setLines((prev) => [...prev, initialLine()])} className="flex items-center gap-1 text-xs text-sky-700"><Plus size={16} />افزودن ماده</button>
            </section>
            <section className="rounded-2xl border border-slate-200 p-3 space-y-3">
              <h2 className="text-sm font-bold">محصول آماده</h2>
              <select aria-label="محصول خروجی" className={field} value={outputId} onChange={(e) => { const p = products.find((p) => p._id === e.target.value); if (p) chooseOutput(p); else setOutputId(''); }} required>
                <option value="">انتخاب محصول خروجی</option>
                {products.filter((p) => !lines.some((l) => l.productId === p._id)).map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
              </select>
              <button type="button" onClick={() => setNewProduct(true)} className="text-xs text-sky-700">+ تعریف محصول جدید با موجودی اولیهٔ صفر</button>
              <label className="block text-xs text-slate-600 space-y-1"><span>مقدار محصول تولیدشده ({output?.unit || 'واحد انبار'})</span>
                <input className={field} type="number" inputMode="decimal" min="0.000001" step="any" value={outputQuantity} onChange={(e) => setOutputQuantity(e.target.value)} required />
              </label>
              {output && <p className="text-[11px] text-slate-500">موجودی پس از تولید: {num(output.stock + (Number(outputQuantity) || 0), 3)} {output.unit}</p>}
              <label className="block text-xs text-slate-600 space-y-1"><span>هزینهٔ بسته‌بندی کل (تومان)</span><MoneyTextInput className={field} value={packaging} onChange={setPackaging} /></label>
              <p className="text-[10px] text-slate-400">اگر بسته‌بندی را در مواد مصرفی انتخاب کرده‌اید، بهای آن را دوباره اینجا وارد نکنید.</p>
              <label className="block text-xs text-slate-600 space-y-1"><span>اجرت و سایر هزینه‌های تولید کل (تومان)</span><MoneyTextInput className={field} value={labor} onChange={setLabor} /></label>
              <label className="block text-xs text-slate-600 space-y-1"><span>قیمت فروش هر {output?.unit || 'واحد'} (تومان)</span><MoneyTextInput className={field} value={sellPrice} onChange={setSellPrice} /></label>
              <label className="block text-xs text-slate-600 space-y-1"><span>یادداشت</span><textarea maxLength={1000} className={field} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
            </section>
          </fieldset>
          <div className="rounded-2xl bg-sky-50 p-3 space-y-2 text-xs text-sky-900">
            <div className="flex justify-between"><span>بهای مواد با قیمت خرید فعلی</span><strong>{formatToman(materials)}</strong></div>
            <div className="flex justify-between"><span>بهای کل تولید</span><strong>{formatToman(total)}</strong></div>
            <div className="flex justify-between"><span>بهای هر {output?.unit || 'واحد'} خروجی</span><strong>{formatToman(unitCost)}</strong></div>
            <p className="text-[10px] leading-5">گزارش سود، بهای مواد را به ترتیب خریدهای انبار محاسبه می‌کند. هزینه‌های واردشده به بهای محصول اضافه می‌شوند.</p>
          </div>
          {retryPending && <p className="text-xs text-amber-700">وضعیت ثبت قبلی هنوز مشخص نیست. بررسی دوباره، همان درخواست را پیگیری می‌کند.</p>}
          <button type="submit" disabled={saving || (!retryPending && (invalid || loading || loadError))} className="w-full rounded-2xl bg-sky-600 text-white py-3 text-sm font-bold disabled:opacity-40">{saving ? 'در حال ثبت…' : retryPending ? 'بررسی دوبارهٔ همین تولید' : 'ثبت تولید و تبدیل موجودی'}</button>
        </form>
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-slate-700">۵۰ تولید اخیر</h2>
          {!loading && !loadError && !history.length && <p className="text-xs text-slate-400">هنوز تولیدی ثبت نشده است.</p>}
          {history.map((batch) => <details key={batch._id} className="rounded-2xl border border-slate-200 bg-white p-3 text-xs">
            <summary className="cursor-pointer font-bold text-slate-700 leading-6">{batch.output.productName} · {num(batch.output.quantity, 3)} {batch.output.unit}<span className="block text-[10px] font-normal text-slate-400">{new Date(batch.date).toLocaleString('fa-IR')} · {batch.createdByName}</span></summary>
            <div className="pt-3 space-y-2 text-slate-600">
              {batch.inputs.map((l) => <p key={l.productId}>{l.productName}: {num(l.quantity, 3)} {l.unit} · {formatToman(l.quantity * l.unitCost)}</p>)}
              <p>بسته‌بندی: {formatToman(batch.packagingCost)} · اجرت: {formatToman(batch.laborCost)}</p>
              <p>بهای کل ثبت‌شده: {formatToman(batch.totalCost)}</p><p>قیمت فروش هر {batch.output.unit}: {formatToman(batch.sellPrice)}</p>
              {batch.notes && <p>{batch.notes}</p>}
            </div>
          </details>)}
        </section>
      </div>
      <NewProductModal isOpen={newProduct} onClose={() => setNewProduct(false)} categories={[...new Set(products.map((p) => p.category))]} onProductSaved={(p) => { setProducts((prev) => [...prev, p]); chooseOutput(p); }} />
    </IonContent>
  </IonPage>;
};
