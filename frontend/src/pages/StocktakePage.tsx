import React, { useMemo, useState } from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { ReportHeader } from '../components/reports/ReportUI';
import { AmountInput } from '../components/ui/AmountInput';
import { productsService, type Product } from '../services/products.service';
import { apiErrorMessage } from '../services/invoices.service';
import { useNotification } from '../context/NotificationContext';
import { num } from '../lib/format';

type Step = 'start' | 'count' | 'review' | 'done';

export const StocktakePage: React.FC = () => {
  const { showNotification } = useNotification();
  const [step, setStep] = useState<Step>('start');
  const [products, setProducts] = useState<Product[]>([]);
  const [index, setIndex] = useState(0);
  const [counts, setCounts] = useState<Record<string, number | null>>({});
  const [draft, setDraft] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [changed, setChanged] = useState(0);

  const current = products[index];
  const counted = useMemo(
    () => products.filter((p) => counts[p._id] != null),
    [products, counts],
  );
  const diffs = counted.filter((p) => Math.abs((counts[p._id] ?? p.stock) - p.stock) >= 0.0005);

  const begin = async () => {
    setLoading(true);
    try {
      const list = (await productsService.getProducts()).filter((p) => p.isActive).sort((a, b) => a.name.localeCompare(b.name, 'fa'));
      setProducts(list);
      setCounts({});
      setIndex(0);
      setDraft(list[0]?.stock || 0);
      setStep('count');
    } catch (err) {
      showNotification({ title: 'کالاها نیامد', message: apiErrorMessage(err, 'لیست انبار خوانده نشد'), type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const remember = (qty: number | null) => {
    if (!current) return;
    setCounts((prev) => ({ ...prev, [current._id]: qty }));
  };

  const go = (next: number, qty: number | null) => {
    remember(qty);
    const i = Math.max(0, Math.min(products.length - 1, next));
    setIndex(i);
    const id = products[i]?._id;
    const saved = id ? counts[id] : null;
    setDraft(saved != null ? saved : products[i]?.stock || 0);
  };

  const finish = (qty: number | null) => {
    if (current) setCounts((prev) => ({ ...prev, [current._id]: qty }));
    setStep('review');
  };

  const apply = async () => {
    setSaving(true);
    try {
      const lines = diffs.map((p) => ({ productId: p._id, countedQty: counts[p._id] ?? p.stock }));
      const res = await productsService.applyStockCount(lines);
      setChanged(res.changed);
      setStep('done');
    } catch (err) {
      showNotification({ title: 'ثبت نشد', message: apiErrorMessage(err, 'انبارگردانی ذخیره نشد'), type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <IonPage>
      <ReportHeader
        title="انبارگردانی"
        subtitle={step === 'count' && products.length ? `کالای ${num(index + 1)} از ${num(products.length)}` : 'شمارش موجودی، قدم به قدم'}
      />
      <IonContent fullscreen className="bg-slate-50">
        <div className="p-3 max-w-md mx-auto pb-8 space-y-3">
          {step === 'start' && (
            <div className="bg-white rounded-3xl border border-slate-100 p-4 space-y-3">
              <p className="text-xs text-slate-600 leading-6">
                کالاها یکی‌یکی می‌آیند. عدد روی قفسه را وارد کنید. اگر کالایی را نخواستید بشمارید، «رد شو» را بزنید تا موجودی‌اش همان بماند. در پایان فقط اختلاف‌ها روی انبار نوشته می‌شود.
              </p>
              <button
                type="button"
                disabled={loading}
                onClick={() => void begin()}
                className="w-full py-3 rounded-2xl bg-sky-600 text-white text-sm font-bold disabled:opacity-40"
              >
                {loading ? 'در حال آماده‌سازی…' : 'شروع شمارش'}
              </button>
            </div>
          )}

          {step === 'count' && current && (
            <div className="bg-white rounded-3xl border border-slate-100 p-4 space-y-3">
              <div>
                <div className="text-base font-black text-slate-800">{current.name}</div>
                <div className="text-[11px] text-slate-400 mt-1">موجودی سیستم: {num(current.stock, 2)} {current.unit}</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500 mb-1">موجودی شمارش‌شده ({current.unit})</div>
                <AmountInput value={draft} onChange={setDraft} />
              </div>
              <button type="button" onClick={() => (index >= products.length - 1 ? finish(draft) : go(index + 1, draft))} className="w-full py-3 rounded-2xl bg-sky-600 text-white text-sm font-bold">
                {index >= products.length - 1 ? 'پایان و دیدن اختلاف' : 'بعدی'}
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" disabled={index === 0} onClick={() => go(index - 1, draft)} className="py-2.5 rounded-2xl bg-slate-100 text-slate-700 text-xs font-bold disabled:opacity-40">
                  قبلی
                </button>
                <button type="button" onClick={() => (index >= products.length - 1 ? finish(null) : go(index + 1, null))} className="py-2.5 rounded-2xl bg-slate-100 text-slate-700 text-xs font-bold">
                  رد شو
                </button>
              </div>
            </div>
          )}

          {step === 'review' && (
            <div className="bg-white rounded-3xl border border-slate-100 p-4 space-y-3">
              <p className="text-xs text-slate-600 leading-6">
                {diffs.length
                  ? `${num(diffs.length)} کالا با موجودی سیستم فرق دارد. با تأیید، موجودی همان‌ها عوض می‌شود.`
                  : 'شمارش با موجودی سیستم یکی است. چیزی برای اصلاح نیست.'}
              </p>
              <div className="divide-y divide-slate-100">
                {diffs.map((p) => {
                  const qty = counts[p._id] ?? p.stock;
                  const delta = qty - p.stock;
                  return (
                    <div key={p._id} className="py-2 flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <div className="font-bold text-slate-800 truncate">{p.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{num(p.stock, 2)} ← {num(qty, 2)} {p.unit}</div>
                      </div>
                      <span className={`font-mono font-bold shrink-0 ${delta > 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                        {delta > 0 ? '+' : ''}{num(delta, 2)}
                      </span>
                    </div>
                  );
                })}
              </div>
              <button type="button" disabled={saving || diffs.length === 0} onClick={() => void apply()} className="w-full py-3 rounded-2xl bg-emerald-600 text-white text-sm font-bold disabled:opacity-40">
                {saving ? 'در حال ثبت…' : 'تأیید و اصلاح موجودی'}
              </button>
              <button type="button" onClick={() => setStep('count')} className="w-full py-2.5 rounded-2xl bg-slate-100 text-slate-700 text-xs font-bold">
                برگشت به شمارش
              </button>
            </div>
          )}

          {step === 'done' && (
            <div className="bg-white rounded-3xl border border-emerald-100 p-4 space-y-2">
              <div className="text-sm font-black text-emerald-800">انبارگردانی ثبت شد</div>
              <p className="text-xs text-slate-600 leading-6">{num(changed)} کالا با عدد شمارش‌شده یکی شد. محاسبهٔ بعدی انبار از روی فاکتورها این اختلاف را پاک نمی‌کند.</p>
            </div>
          )}
        </div>
      </IonContent>
    </IonPage>
  );
};
