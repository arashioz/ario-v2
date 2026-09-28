import React, { useState, useEffect } from 'react';
import { IonModal, IonHeader, IonToolbar, IonContent } from '@ionic/react';
import {
  X,
  Tag,
  TrendingUp,
  History,
  CheckCircle2,
} from 'lucide-react';
import { productsService } from '../../services/products.service';
import type { Product } from '../../services/products.service';
import { useNotification } from '../../context/NotificationContext';
import { LoadingOverlay } from '../LoadingOverlay';
import { formatToman, num, parseSignedDecimal, parseToman, percent, toman } from '../../lib/format';
import { kgPerUnit, pricePerKg, tierPrice } from '../pos/cart';
import { PriceTiers, StockAmount } from './ProductPriceInfo';

interface UpdatePriceModalProps {
  isOpen: boolean;
  product: Product | null;
  onClose: () => void;
  onPriceUpdated: (updatedProduct: Product) => void;
}

const ROUNDS = [
  { id: 1, label: 'دقیق' },
  { id: 100, label: '۱۰۰' },
  { id: 1000, label: '۱٬۰۰۰' },
  { id: 10000, label: '۱۰٬۰۰۰' },
] as const;

const roundMoney = (n: number, step: number) => {
  const s = step > 1 ? step : 1;
  return Math.round(n / s) * s;
};

/** Package price input paired with a per-kg input; typing in either updates the other. */
const DualPriceInput: React.FC<{
  label: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  unit: string;
  kgPerUnit: number;
  primary?: boolean;
}> = ({ label, value, onChange, unit, kgPerUnit: k, primary }) => {
  const [kgText, setKgText] = useState<string | null>(null);
  const pkg = value ? Number(value) : 0;
  const kgPlain = kgText ?? (pkg && k ? String(Math.round(pkg / k)) : '');
  const showMoney = (raw: string) => (raw && Number(raw) ? Number(raw).toLocaleString('fa-IR') : '');
  const inputCls = `w-full px-3 py-2.5 rounded-2xl bg-white border outline-none transition text-slate-800 font-mono focus:border-sky-400 focus:ring-2 focus:ring-sky-100 ${
    primary ? 'text-base font-bold border-sky-100' : 'text-sm border-slate-200'
  }`;

  return (
    <div className="space-y-1.5 text-right">
      <label className="text-xs font-bold text-slate-700 block">{label}</label>
      <div className={`grid gap-2 ${k > 0 && k !== 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <div>
          <span className="text-[10px] text-slate-400 block mb-1">هر {unit}</span>
          <input
            type="text"
            inputMode="numeric"
            value={showMoney(value)}
            onChange={(e) => onChange(parseToman(e.target.value) ? String(parseToman(e.target.value)) : '')}
            dir="ltr"
            className={inputCls}
          />
        </div>
        {k > 0 && k !== 1 && (
          <div>
            <span className="text-[10px] text-slate-400 block mb-1">هر کیلو</span>
            <input
              type="text"
              inputMode="numeric"
              value={showMoney(kgPlain)}
              onChange={(e) => {
                const perKg = parseToman(e.target.value);
                setKgText(perKg ? String(perKg) : '');
                onChange(perKg ? String(Math.round(perKg * k)) : '');
              }}
              onBlur={() => setKgText(null)}
              dir="ltr"
              className={inputCls}
            />
          </div>
        )}
      </div>
      {pkg > 0 && (
        <span className="text-[11px] text-sky-700 font-bold block">
          {formatToman(pkg)} هر {unit}
          {k > 0 && k !== 1 && <span className="text-slate-500 font-normal"> · {formatToman(Math.round(pkg / k))} هر کیلو</span>}
        </span>
      )}
    </div>
  );
};

export const UpdatePriceModal: React.FC<UpdatePriceModalProps> = ({
  isOpen,
  product,
  onClose,
  onPriceUpdated,
}) => {
  const { showNotification } = useNotification();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [newSellPrice, setNewSellPrice] = useState<string>('');
  const [newSupermarket, setNewSupermarket] = useState<string>('');
  const [newWholesale, setNewWholesale] = useState<string>('');
  const [newBuyPrice, setNewBuyPrice] = useState<string>('');
  const [reason, setReason] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [pctText, setPctText] = useState('6');
  const [pctBase, setPctBase] = useState<'buy' | 'current'>('buy');
  const [roundStep, setRoundStep] = useState<(typeof ROUNDS)[number]['id']>(1000);

  useEffect(() => {
    if (product && isOpen) {
      setNewSellPrice(String(tierPrice(product, 'retail')));
      setNewSupermarket(String(tierPrice(product, 'supermarket')));
      setNewWholesale(String(tierPrice(product, 'wholesale')));
      setNewBuyPrice(product.buyPrice ? product.buyPrice.toString() : '');
      setReason('');
      setShowHistory(false);
      setPctText('6');
      setPctBase('buy');
      setRoundStep(1000);
    }
  }, [product, isOpen]);

  if (!product) return null;

  const k = kgPerUnit(product);
  const currentSell = tierPrice(product, 'retail');
  const currentBuy = product.buyPrice || 0;

  const parsedNewSell = newSellPrice ? Number(newSellPrice) : 0;
  const parsedNewBuy = newBuyPrice ? Number(newBuyPrice) : currentBuy;
  const parsedSuper = newSupermarket ? Number(newSupermarket) : parsedNewSell;
  const parsedWhole = newWholesale ? Number(newWholesale) : parsedNewSell;
  const sellTiers = [parsedNewSell, parsedSuper, parsedWhole].filter((n) => n > 0);
  const lowestSell = sellTiers.length ? Math.min(...sellTiers) : 0;
  const loss = parsedNewBuy > 0 && lowestSell > 0 && lowestSell < parsedNewBuy;

  const priceDiff = parsedNewSell - currentSell;
  const percentDiff = currentSell > 0 ? ((priceDiff / currentSell) * 100).toFixed(1) : '0';

  const grossProfit = parsedNewSell - parsedNewBuy;
  const profitMarginPercent = parsedNewSell > 0 ? ((grossProfit / parsedNewSell) * 100).toFixed(1) : '0';

  const applyPercent = (pct: number, base: 'buy' | 'current' = pctBase, step: number = roundStep) => {
    const onBuy = base === 'buy' && parsedNewBuy > 0;
    if (onBuy) {
      const retail = Math.max(roundMoney(parsedNewBuy * (1 + pct / 100), step), parsedNewBuy);
      const curRetail = currentSell || retail;
      const superRatio = curRetail > 0 ? tierPrice(product, 'supermarket') / curRetail : 1;
      const wholeRatio = curRetail > 0 ? tierPrice(product, 'wholesale') / curRetail : 1;
      setNewSellPrice(String(retail));
      setNewSupermarket(String(Math.max(roundMoney(retail * superRatio, step), parsedNewBuy)));
      setNewWholesale(String(Math.max(roundMoney(retail * wholeRatio, step), parsedNewBuy)));
      setReason(`سود ${pct}٪ روی قیمت خرید`);
      return;
    }
    const f = 1 + pct / 100;
    setNewSellPrice(String(Math.max(0, roundMoney(currentSell * f, step))));
    setNewSupermarket(String(Math.max(0, roundMoney(tierPrice(product, 'supermarket') * f, step))));
    setNewWholesale(String(Math.max(0, roundMoney(tierPrice(product, 'wholesale') * f, step))));
    setReason(`${pct > 0 ? 'افزایش' : 'کاهش'} ${Math.abs(pct)} درصدی قیمت`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (parsedNewSell <= 0) {
      showNotification({
        title: 'خطای قیمت',
        message: 'قیمت فروش باید بیشتر از صفر باشد',
        type: 'warning',
      });
      return;
    }

    if (loss) {
      showNotification({
        title: 'زیر قیمت خرید',
        message: 'هیچ‌کدام از قیمت‌های فروش نباید از قیمت خرید کمتر باشد.',
        type: 'warning',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const updated = await productsService.updatePrice(product._id, {
        newSellPrice: parsedNewSell,
        priceSupermarket: newSupermarket ? Number(newSupermarket) : undefined,
        priceWholesale: newWholesale ? Number(newWholesale) : undefined,
        newBuyPrice: newBuyPrice ? parsedNewBuy : undefined,
        reason: reason.trim() || undefined,
      });

      showNotification({
        title: 'قیمت به‌روزرسانی شد',
        message: `قیمت جدید ${product.name} معادل ${formatToman(parsedNewSell)} ثبت گردید.`,
        type: 'success',
      });

      onPriceUpdated(updated);
      onClose();
    } catch (err: any) {
      const errMsg = err.response?.data?.message || 'خطا در به‌روزرسانی قیمت';
      showNotification({
        title: 'خطا',
        message: Array.isArray(errMsg) ? errMsg.join(' - ') : errMsg,
        type: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (isoString: string) => {
    try {
      return new Intl.DateTimeFormat('fa-IR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(isoString));
    } catch {
      return isoString;
    }
  };

  return (
    <IonModal isOpen={isOpen} onDidDismiss={onClose}>
      <IonHeader className="ion-no-border">
        <IonToolbar className="bg-white px-3 py-2 border-b border-sky-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center">
                <Tag className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-800">تغییر قیمت محصول</h2>
                <span className="text-[10px] text-slate-400 block line-clamp-1">{product.name}</span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </IonToolbar>
      </IonHeader>

      <IonContent className="bg-slate-50">
        <LoadingOverlay isOpen={isSubmitting} message="در حال ثبت قیمت جدید..." />

        <form onSubmit={handleSubmit} className="p-3 space-y-3 max-w-md mx-auto pb-6">
          {/* Current Info Card */}
          <div className="bg-white rounded-2xl p-3 border border-sky-100 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600">قیمت‌های فعلی</span>
              {k > 0 && k !== 1 && (
                <span className="text-[10px] text-slate-400">
                  هر {product.unit} {num(k, 2)} کیلوگرم
                </span>
              )}
            </div>
            <PriceTiers product={product} />

            {currentBuy > 0 && (
              <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-100">
                <span>قیمت خرید:</span>
                <span className="font-mono">
                  {formatToman(currentBuy)}
                  {k > 0 && k !== 1 && ` · هر کیلو ${formatToman(pricePerKg(currentBuy, product))}`}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between text-[11px] text-sky-700 bg-sky-50/70 p-2 rounded-xl">
              <span>موجودی فعلی انبار:</span>
              <StockAmount product={product} className="text-left" />
            </div>
          </div>

          <DualPriceInput
            primary
            label={
              <>
                قیمت تکی / مصرف‌کننده (تومان) <span className="text-rose-500">*</span>
              </>
            }
            value={newSellPrice}
            onChange={setNewSellPrice}
            unit={product.unit}
            kgPerUnit={k}
          />

          <div className="bg-white rounded-2xl border border-slate-200 p-3 space-y-2">
            <span className="text-xs font-bold text-slate-700 block">درصد دستی، با اعشار</span>
            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl">
              {(
                [
                  ['buy', 'سود روی خرید'],
                  ['current', 'روی قیمت فعلی'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPctBase(id)}
                  className={`py-1.5 rounded-lg text-[11px] font-bold ${pctBase === id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="decimal"
                value={pctText}
                onChange={(e) =>
                  setPctText(
                    e.target.value
                      .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
                      .replace(/[٫,]/g, '.')
                      .replace(/[^0-9.-]/g, ''),
                  )
                }
                placeholder="۳.۲"
                dir="ltr"
                className="flex-1 px-3 py-2.5 text-lg font-mono font-extrabold text-center rounded-2xl bg-slate-50 border border-slate-200 outline-none"
              />
              <button
                type="button"
                onClick={() => applyPercent(parseSignedDecimal(pctText))}
                className="px-4 rounded-2xl bg-emerald-600 text-white text-xs font-bold"
              >
                اعمال ٪
              </button>
            </div>
            <div className="grid grid-cols-4 gap-1">
              {ROUNDS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    setRoundStep(r.id);
                    if (pctText && pctText !== '-' && pctText !== '.') applyPercent(parseSignedDecimal(pctText), pctBase, r.id);
                  }}
                  className={`py-1.5 rounded-xl text-[10px] font-bold border ${
                    roundStep === r.id ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              {[3, 3.2, 5, 6, 10].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => {
                    setPctText(String(pct));
                    applyPercent(pct);
                  }}
                  className="flex-1 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 text-[11px] font-bold"
                >
                  {pct}٪
                </button>
              ))}
            </div>
            {parsedNewBuy > 0 && parsedNewSell > 0 && (
              <p className="text-[11px] text-slate-600 leading-5">
                خرید {formatToman(parsedNewBuy)} · سود هر {product.unit}{' '}
                <b className="font-mono text-emerald-700">
                  {formatToman(grossProfit)} ({percent(parsedNewBuy > 0 ? (grossProfit / parsedNewBuy) * 100 : 0, 2)})
                </b>
              </p>
            )}
          </div>

          <DualPriceInput
            label="قیمت سوپرمارکت (تومان)"
            value={newSupermarket}
            onChange={setNewSupermarket}
            unit={product.unit}
            kgPerUnit={k}
          />

          <DualPriceInput
            label="قیمت عمده (تومان)"
            value={newWholesale}
            onChange={setNewWholesale}
            unit={product.unit}
            kgPerUnit={k}
          />

          <DualPriceInput
            label="قیمت خرید جدید (اختیاری)"
            value={newBuyPrice}
            onChange={setNewBuyPrice}
            unit={product.unit}
            kgPerUnit={k}
          />

          {/* Profit & Margin Comparison Box */}
          <div className="bg-sky-50/70 rounded-2xl p-3 border border-sky-200/60 space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-600">تغییر قیمت تکی نسبت به قبل:</span>
              <span
                className={`font-mono font-bold flex items-center gap-1 ${
                  priceDiff > 0
                    ? 'text-emerald-600'
                    : priceDiff < 0
                    ? 'text-rose-600'
                    : 'text-slate-600'
                }`}
              >
                {priceDiff > 0 ? '+' : ''}
                {formatToman(priceDiff)} ({percentDiff}%)
              </span>
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-sky-100">
              <span className="text-slate-600 flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5 text-sky-500" />
                سود ناخالص هر {product.unit}:
              </span>
              <span
                className={`font-mono font-bold ${
                  grossProfit >= 0 ? 'text-emerald-700' : 'text-rose-600'
                }`}
              >
                {formatToman(grossProfit)} ({profitMarginPercent}%)
              </span>
            </div>

            {k > 0 && k !== 1 && (
              <div className="flex items-center justify-between">
                <span className="text-slate-600">سود ناخالص هر کیلو:</span>
                <span className={`font-mono font-bold ${grossProfit >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                  {formatToman(pricePerKg(grossProfit, product))}
                </span>
              </div>
            )}
            {loss && (
              <p className="text-[11px] text-rose-700 bg-rose-50 rounded-xl px-2.5 py-1.5">
                یکی از قیمت‌های فروش از قیمت خرید کمتر است و ثبت نمی‌شود.
              </p>
            )}
          </div>

          {/* Reason Input */}
          <div className="space-y-1 text-right">
            <label className="text-xs font-bold text-slate-700 block">علت تغییر قیمت</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="مثلا: گرانی شرکت پخش، اعمال تخفیف هفتگی، مصوبه جدید..."
              className="w-full px-3.5 py-2.5 text-xs rounded-2xl bg-white border border-sky-100 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition text-slate-800"
            />
          </div>

          {loss && (
            <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-100 rounded-2xl px-3 py-2 leading-5">
              این قیمت از خرید کمتر است و ثبت نمی‌شود. قیمت فروش باید حداقل به اندازه خرید باشد.
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting || loss}
            className="w-full py-3.5 px-4 rounded-2xl bg-sky-600 hover:bg-sky-700 active:scale-[0.98] text-white font-bold text-sm shadow-md shadow-sky-400/25 transition flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>ثبت نهایی تغییر قیمت</span>
          </button>

          {/* Toggle Price History */}
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setShowHistory(!showHistory)}
              className="w-full py-2.5 px-3 rounded-2xl bg-white border border-slate-200 text-slate-600 text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-slate-50 transition"
            >
              <History className="w-4 h-4 text-sky-600" />
              <span>
                {showHistory
                  ? 'مخفی‌سازی تاریخچه تغییرات'
                  : `مشاهده سوابق و تاریخچه تغییر قیمت (${product.priceHistory?.length || 0})`}
              </span>
            </button>

            {showHistory && (
              <div className="mt-3 space-y-2">
                {product.priceHistory && product.priceHistory.length > 0 ? (
                  product.priceHistory.map((item, idx) => (
                    <div
                      key={idx}
                      className="bg-white rounded-2xl p-3 border border-slate-100 shadow-xs text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-slate-800">
                          {toman(item.oldPrice)} ⬅ {formatToman(item.newPrice)}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {formatDate(item.date)}
                        </span>
                      </div>
                      {k > 0 && k !== 1 && (
                        <div className="text-[10px] text-slate-400 font-mono">
                          هر کیلو: {toman(pricePerKg(item.oldPrice, product))} ⬅ {formatToman(pricePerKg(item.newPrice, product))}
                        </div>
                      )}
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span>علت: {item.reason || 'تغییر قیمت پایه'}</span>
                        <span className="text-[10px] text-slate-400">ثبت: {item.changedByName}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-center text-xs text-slate-400 py-3">تاریخچه‌ای ثبت نشده است.</p>
                )}
              </div>
            )}
          </div>
        </form>
      </IonContent>
    </IonModal>
  );
};
