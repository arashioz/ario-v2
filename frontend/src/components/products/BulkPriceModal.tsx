import React, { useEffect, useMemo, useState } from 'react';
import { IonModal, IonHeader, IonToolbar, IonContent } from '@ionic/react';
import { X, Layers, Percent, Coins, CheckCircle2 } from 'lucide-react';
import { productsService } from '../../services/products.service';
import type { BulkPricePreviewItem } from '../../services/products.service';
import { useNotification } from '../../context/NotificationContext';
import { LoadingOverlay } from '../LoadingOverlay';
import { formatToman, num, parseSignedDecimal, percent, profitColor } from '../../lib/format';

interface BulkPriceModalProps {
  isOpen: boolean;
  categories: string[];
  onClose: () => void;
  onSuccess: () => void;
}

const ROUNDS = [
  { id: 1 as const, label: 'دقیق' },
  { id: 100 as const, label: '۱۰۰' },
  { id: 1000 as const, label: '۱٬۰۰۰' },
  { id: 10000 as const, label: '۱۰٬۰۰۰' },
];

const keepPercent = (raw: string) => {
  const latin = raw
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[٫,]/g, '.');
  const neg = latin.trim().startsWith('-') || latin.trim().startsWith('−');
  const digits = latin.replace(/[^0-9.]/g, '');
  const [whole, ...rest] = digits.split('.');
  const body = rest.length ? `${whole}.${rest.join('').slice(0, 2)}` : whole;
  if (!body) return neg ? '-' : '';
  return neg ? `-${body}` : body;
};

const markup = (sell: number, buy: number) => (buy > 0 ? ((sell - buy) / buy) * 100 : 0);

export const BulkPriceModal: React.FC<BulkPriceModalProps> = ({ isOpen, categories, onClose, onSuccess }) => {
  const { showNotification } = useNotification();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [type, setType] = useState<'percentage' | 'fixed' | 'profit'>('profit');
  const [value, setValue] = useState<string>('6');
  const [roundTo, setRoundTo] = useState<(typeof ROUNDS)[number]['id']>(1000);
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState<BulkPricePreviewItem[]>([]);

  const numValue = parseSignedDecimal(value);
  const ready = value !== '' && value !== '-' && value !== '.' && !Number.isNaN(numValue);

  useEffect(() => {
    if (!isOpen) return;
    if (!ready) {
      setPreview([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      productsService
        .previewBulkPrices({
          category: selectedCategory === 'all' ? undefined : selectedCategory,
          type,
          value: numValue,
          roundTo,
        })
        .then((items) => {
          if (!cancelled) setPreview(items);
        })
        .catch(() => {
          if (!cancelled) setPreview([]);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isOpen, selectedCategory, type, value, roundTo, ready, numValue]);

  const sums = useMemo(() => {
    let buy = 0;
    let now = 0;
    let next = 0;
    let changing = 0;
    for (const p of preview) {
      const qty = p.stock || 0;
      buy += (p.buy || 0) * qty;
      now += (p.profitBefore || 0) * qty;
      next += ((p.skipped ? p.profitBefore : p.profitAfter) || 0) * qty;
      if (!p.skipped && (p.before !== p.after || p.beforeSupermarket !== p.afterSupermarket || p.beforeWholesale !== p.afterWholesale)) {
        changing++;
      }
    }
    return { buy, now, next, changing };
  }, [preview]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) {
      showNotification({ title: 'خطای مقدار', message: 'یک درصد یا مبلغ معتبر بنویس. اعشار هم قبول است، مثل ۳٫۲', type: 'warning' });
      return;
    }
    const targetDesc = selectedCategory === 'all' ? 'همه کالاها' : `دسته «${selectedCategory}»`;
    const changeDesc =
      type === 'profit' ? `${numValue} درصد سود روی خرید` : type === 'percentage' ? `${numValue} درصد روی قیمت فعلی` : formatToman(numValue);
    if (!window.confirm(`قیمت تکی، سوپر و عمدهٔ ${targetDesc} (${sums.changing} کالا) با ${changeDesc} عوض شود؟`)) return;

    setIsSubmitting(true);
    try {
      const res = await productsService.bulkUpdatePrices({
        category: selectedCategory === 'all' ? undefined : selectedCategory,
        type,
        value: numValue,
        roundTo,
        reason: reason.trim() || undefined,
      });
      showNotification({ title: 'قیمت‌ها اعمال شد', message: res.message, type: 'success' });
      onSuccess();
      onClose();
    } catch (err: any) {
      const errMsg = err.response?.data?.message || 'خطا در تغییر گروهی قیمت‌ها';
      showNotification({ title: 'خطا', message: Array.isArray(errMsg) ? errMsg.join(' - ') : errMsg, type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <IonModal isOpen={isOpen} onDidDismiss={onClose}>
      <IonHeader className="ion-no-border">
        <IonToolbar className="bg-white px-3 py-2 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-extrabold text-slate-800">سود و تغییر قیمت</h2>
                <p className="text-[10px] text-slate-400">خرید، سود فعلی و قیمت جدید را قبل از اعمال ببین</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-full text-slate-400">
              <X className="w-5 h-5" />
            </button>
          </div>
        </IonToolbar>
      </IonHeader>

      <IonContent className="bg-slate-50">
        <LoadingOverlay isOpen={isSubmitting} message="در حال اعمال قیمت‌ها..." />

        <form onSubmit={handleSubmit} className="p-3 space-y-3 max-w-md mx-auto pb-8">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full px-3.5 py-3 text-xs rounded-2xl bg-white border border-slate-200 outline-none text-slate-800"
          >
            <option value="all">همه کالاها</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          <div className="grid grid-cols-3 p-1 bg-white rounded-2xl border border-slate-200 gap-1">
            {(
              [
                ['profit', 'سود روی خرید'],
                ['percentage', 'درصد روی قیمت'],
                ['fixed', 'مبلغ ثابت'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setType(id)}
                className={`py-2 text-[11px] font-bold rounded-xl ${type === id ? 'bg-violet-700 text-white' : 'text-slate-600'}`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-3 space-y-2">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
              {type === 'fixed' ? <Coins className="w-3.5 h-3.5" /> : <Percent className="w-3.5 h-3.5" />}
              {type === 'profit' ? 'درصد سود روی قیمت خرید' : type === 'percentage' ? 'چند درصد قیمت فعلی عوض شود' : 'مبلغ اضافه یا کم، تومان'}
            </label>
            <div className="relative">
              <input
                type="text"
                inputMode="decimal"
                value={value}
                onChange={(e) => setValue(type === 'fixed' ? e.target.value.replace(/[^0-9۰-۹-]/g, '') : keepPercent(e.target.value))}
                placeholder={type === 'profit' ? '۳.۲' : type === 'percentage' ? '۳.۲ یا -۲' : '۵۰۰۰'}
                dir="ltr"
                className="w-full px-3.5 py-3 text-2xl rounded-2xl bg-slate-50 border border-slate-200 outline-none text-slate-900 font-mono font-extrabold text-center"
              />
              {type !== 'fixed' && <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">٪</span>}
            </div>
            <p className="text-[10px] text-slate-400 leading-5">
              {type === 'profit'
                ? 'مثلاً ۳٫۲ یعنی قیمت تکی = خرید × ۱٫۰۳۲. سوپر و عمده همان نسبت قبلی‌شان با تکی را حفظ می‌کنند و از خرید پایین‌تر نمی‌روند.'
                : 'اعشار مجاز است. برای کاهش، منفی بگذار.'}
            </p>
          </div>

          <div className="space-y-1">
            <span className="text-[11px] font-bold text-slate-600">گرد کردن قیمت جدید</span>
            <div className="grid grid-cols-4 gap-1">
              {ROUNDS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRoundTo(r.id)}
                  className={`py-2 rounded-xl text-[11px] font-bold border ${
                    roundTo === r.id ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-400">دقیق یعنی همان تومان محاسبه‌شده. بقیه به نزدیک‌ترین ۱۰۰، هزار یا ده‌هزار گرد می‌شوند.</p>
          </div>

          {preview.length > 0 && (
            <>
              <div className="grid grid-cols-3 gap-1.5">
                <SumCard label="ارزش خرید موجودی" value={formatToman(sums.buy)} />
                <SumCard label="سود فعلی موجودی" value={formatToman(sums.now)} tone={sums.now} />
                <SumCard label="سود بعد از اعمال" value={formatToman(sums.next)} tone={sums.next} />
              </div>
              <p className="text-[10px] text-slate-400">جمع‌ها روی موجودی انبار است: قیمت هر واحد × تعداد. سود، اختلاف فروش تکی و خرید است.</p>

              <div className="space-y-1.5">
                {preview.map((item, i) => (
                  <article key={`${item.name}-${i}`} className="bg-white rounded-2xl border border-slate-100 px-3 py-2.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="text-xs font-extrabold text-slate-800">{item.name}</h3>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {num(item.stock, 2)} {item.unit}
                      </span>
                    </div>
                    {item.skipped ? (
                      <p className="text-[11px] text-amber-700 mt-1">{item.skipped}</p>
                    ) : (
                      <>
                        <p className="text-[11px] text-slate-500 mt-1">
                          خرید <b className="font-mono text-slate-700">{formatToman(item.buy)}</b>
                          <span className="mx-1">·</span>
                          سود تکی{' '}
                          <b className={`font-mono ${profitColor(item.profitBefore)}`}>
                            {formatToman(item.profitBefore)} ({percent(markup(item.before, item.buy), 2)})
                          </b>
                          <span className="mx-1">←</span>
                          <b className={`font-mono ${profitColor(item.profitAfter)}`}>
                            {formatToman(item.profitAfter)} ({percent(markup(item.after, item.buy), 2)})
                          </b>
                        </p>
                        <div className="mt-1.5 space-y-0.5 text-[11px] text-slate-600">
                          {(
                            [
                              ['تکی', item.before, item.after],
                              ['سوپر', item.beforeSupermarket, item.afterSupermarket],
                              ['عمده', item.beforeWholesale, item.afterWholesale],
                            ] as const
                          ).map(([label, before, after]) => (
                            <div key={label} className="flex justify-between gap-2 font-mono">
                              <span className="font-sans text-slate-400">{label}</span>
                              <span>
                                {formatToman(before)}
                                <span className="text-slate-300 mx-1">←</span>
                                <b className="text-slate-800">{formatToman(after)}</b>
                              </span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </article>
                ))}
              </div>
            </>
          )}

          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="علت، مثلاً سود ۳٫۲ درصد روی خرید"
            className="w-full px-3.5 py-2.5 text-xs rounded-2xl bg-white border border-slate-200 outline-none text-slate-800"
          />

          <button
            type="submit"
            disabled={isSubmitting || !ready}
            className="w-full py-3.5 px-4 rounded-2xl bg-violet-700 text-white font-bold text-xs disabled:opacity-40 flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            اعمال روی {sums.changing || 0} کالا
          </button>
        </form>
      </IonContent>
    </IonModal>
  );
};

const SumCard: React.FC<{ label: string; value: string; tone?: number }> = ({ label, value, tone }) => (
  <div className="bg-white rounded-2xl border border-slate-100 px-2 py-2 text-center">
    <div className="text-[9px] text-slate-400 leading-4">{label}</div>
    <div className={`text-[10px] font-extrabold font-mono mt-0.5 leading-4 ${tone === undefined ? 'text-slate-800' : profitColor(tone)}`}>{value}</div>
  </div>
);
