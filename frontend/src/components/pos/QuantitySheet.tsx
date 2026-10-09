import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, RotateCcw, Trash2 } from 'lucide-react';
import { Sheet } from '../ui/Sheet';
import { AmountInput } from '../ui/AmountInput';
import type { Product } from '../../services/products.service';
import { SALE_TYPE_LABELS, type SaleType } from '../../services/settings.service';
import { formatToman, num, parseDecimal, weight } from '../../lib/format';
import { kgPerUnit, r3, tierPrice, type CartLine } from './cart';

interface Props {
  product: Product | null;
  saleType: SaleType;
  existing?: CartLine;
  onClose: () => void;
  onConfirm: (line: CartLine) => void;
  onRemove: (productId: string) => void;
  /** Factory shipments are not limited by Ario stock. */
  ignoreStock?: boolean;
}

const faNum = (n: number) => (n ? n.toLocaleString('fa-IR', { maximumFractionDigits: 3, useGrouping: false }) : '');

/** Type the amount by count or by weight; price per package or per kilo. */
export const QuantitySheet: React.FC<Props> = ({ product, saleType, existing, onClose, onConfirm, onRemove, ignoreStock }) => {
  const sellBy = product?.sellBy || 'stock';
  const perUnit = product ? kgPerUnit(product) : 0;
  const altRatio = sellBy === 'other' ? product?.salePerStock || 0 : perUnit || 1;
  const altLabel = sellBy === 'other' ? product?.saleUnit || 'واحد' : 'کیلو';
  const lockAlt = sellBy === 'kg' || (sellBy === 'other' && altRatio > 0);
  const [by, setBy] = useState<'unit' | 'kg'>('unit');
  const [text, setText] = useState('');
  const [priceBy, setPriceBy] = useState<'unit' | 'kg'>('unit');
  const [price, setPrice] = useState(0);
  const [override, setOverride] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!product) return;
    const ratio = lockAlt ? altRatio : perUnit;
    const q = existing?.quantity ?? (lockAlt ? 1 / ratio : 1);
    setBy(lockAlt ? 'kg' : 'unit');
    setText(faNum(r3(lockAlt ? q * ratio : q)));
    setPriceBy(lockAlt ? 'kg' : 'unit');
    const list = existing?.unitPrice ?? tierPrice(product, saleType);
    setPrice(lockAlt ? Math.round(list / ratio) : list);
    setOverride(!!existing?.priceOverride);
    setTimeout(() => inputRef.current?.select(), 80);
  }, [product, existing, saleType, lockAlt, altRatio, perUnit]);

  if (!product) return null;

  const typed = parseDecimal(text);
  const ratio = by === 'kg' || priceBy === 'kg' ? (lockAlt ? altRatio : perUnit) : perUnit;
  const quantity = by === 'unit' ? typed : ratio ? typed / ratio : 0;
  const kg = by === 'kg' ? typed : typed * (lockAlt ? altRatio : perUnit);
  const unitPrice = priceBy === 'unit' ? price : Math.round(price * (lockAlt ? altRatio : perUnit));
  const total = Math.round(quantity * unitPrice);
  const listPrice = tierPrice(product, saleType);
  const overStock = !ignoreStock && quantity > product.stock;
  const fractional = Math.abs(quantity - Math.round(quantity)) > 0.001;

  const switchBy = (next: 'unit' | 'kg') => {
    if (next === by) return;
    setText(faNum(r3(next === 'kg' ? quantity * (lockAlt ? altRatio : perUnit) : quantity)));
    setBy(next);
  };

  const switchPriceBy = (next: 'unit' | 'kg') => {
    const step = lockAlt ? altRatio : perUnit;
    if (next === priceBy || !step) return;
    setPrice(next === 'kg' ? Math.round(unitPrice / step) : unitPrice);
    setPriceBy(next);
  };

  const bump = (delta: number) => setText(faNum(r3(Math.max(0, typed + delta))));

  const belowCost = !ignoreStock && (product.buyPrice || 0) > 0 && unitPrice > 0 && unitPrice < product.buyPrice;
  const confirm = () => {
    if (quantity <= 0 || belowCost) return;
    onConfirm({ product, quantity: r3(quantity), unitPrice, priceOverride: override && unitPrice !== listPrice });
  };

  const chips = by === 'unit' ? [1, 5, 10, 50] : [10, 50, 100, 500];

  return (
    <Sheet
      open
      onClose={onClose}
      title={product.name}
      subtitle={[
        `قیمت ${SALE_TYPE_LABELS[saleType]}: ${formatToman(listPrice)} هر ${product.unit}`,
        perUnit > 0 && perUnit !== 1 ? `${formatToman(Math.round(listPrice / perUnit))} هر کیلو` : '',
        ignoreStock
          ? 'از کارخانه — از موجودی آریو کم نمی‌شود'
          : `موجودی ${num(product.stock, 1)} ${product.unit}${perUnit > 0 && perUnit !== 1 ? ` (${weight(product.stock * perUnit)})` : ''}`,
      ]
        .filter(Boolean)
        .join(' · ')}
      footer={
        <div className="flex gap-2">
          {existing && (
            <button
              onClick={() => onRemove(product._id)}
              className="px-4 py-3 rounded-2xl bg-rose-50 text-rose-600 border border-rose-200 active:scale-95"
              aria-label="حذف از سبد"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={confirm}
            disabled={quantity <= 0 || belowCost}
            className="flex-1 py-3 rounded-2xl bg-sky-600 text-white text-sm font-bold disabled:opacity-40 active:scale-[0.98] transition"
          >
            {existing ? 'به‌روزرسانی سبد' : 'افزودن به سبد'} · {formatToman(total)}
          </button>
        </div>
      }
    >
      {perUnit > 0 && perUnit !== 1 && !lockAlt && (
        <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-slate-100">
          {(['unit', 'kg'] as const).map((m) => (
            <button
              key={m}
              onClick={() => switchBy(m)}
              className={`py-2 rounded-xl text-xs font-bold transition ${by === m ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-500'}`}
            >
              {m === 'unit' ? `تعداد ${product.unit}` : 'وزن (کیلوگرم)'}
            </button>
          ))}
        </div>
      )}

      <div>
        <div className="flex items-center gap-2">
          <button onClick={() => bump(-(by === 'unit' ? 1 : 10))} className="w-12 h-14 rounded-2xl bg-slate-100 text-xl font-bold text-slate-600 active:scale-95">
            −
          </button>
          <div className="relative flex-1">
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value.replace(/[^0-9۰-۹٠-٩.٫]/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && confirm()}
              inputMode="decimal"
              className="w-full h-14 text-center text-2xl font-mono font-extrabold rounded-2xl border border-sky-200 focus:border-sky-500 outline-none text-slate-800"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">{by === 'unit' ? product.unit : altLabel}</span>
          </div>
          <button onClick={() => bump(by === 'unit' ? 1 : 10)} className="w-12 h-14 rounded-2xl bg-sky-600 text-white text-xl font-bold active:scale-95">
            +
          </button>
        </div>
        <div className="flex gap-1.5 mt-2">
          {chips.map((c) => (
            <button key={c} onClick={() => setText(faNum(c))} className="flex-1 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] font-mono font-bold text-slate-600 active:scale-95">
              {num(c)}
            </button>
          ))}
        </div>
        {perUnit > 0 && perUnit !== 1 && (
          <p className="text-[11px] text-slate-500 mt-2 text-center">
            {by === 'unit' ? `معادل ${num(kg, 1)} ${altLabel}` : `معادل ${num(quantity, 3)} ${product.unit}`}
            {by === 'kg' && fractional && !lockAlt && <span className="text-amber-600"> (کسری از {product.unit})</span>}
          </p>
        )}
        {typed > 0 && (
          <p className="text-xs text-slate-700 mt-2 text-center font-bold">
            مبلغ این مقدار: {formatToman(total)}
          </p>
        )}
        {overStock && (
          <p className="text-[11px] text-rose-600 mt-1.5 flex items-center justify-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> بیشتر از موجودی انبار ({num(product.stock, 1)} {product.unit}
            {perUnit > 0 && perUnit !== 1 && ` · ${weight(product.stock * perUnit)}`})
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-700">قیمت</span>
          {perUnit > 0 && perUnit !== 1 && !lockAlt && (
            <div className="flex gap-1 p-0.5 rounded-xl bg-slate-100">
              {(['unit', 'kg'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => switchPriceBy(m)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${priceBy === m ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-500'}`}
                >
                  {m === 'unit' ? `هر ${product.unit}` : `هر ${altLabel}`}
                </button>
              ))}
            </div>
          )}
        </div>
        {belowCost && (
          <p className="text-[11px] text-rose-600 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            این قیمت از خرید ({formatToman(product.buyPrice)}) کمتر است و ثبت نمی‌شود.
          </p>
        )}
        <AmountInput
          value={price}
          onChange={(v) => {
            setPrice(v);
            setOverride(true);
          }}
        />
        <div className="flex items-center justify-between text-[11px] text-slate-500">
          <span>
            {priceBy === 'kg' && perUnit
              ? `هر ${product.unit} (${num(perUnit, 2)} کیلو): ${formatToman(unitPrice)}`
              : perUnit && perUnit !== 1
                ? `هر کیلو: ${formatToman(Math.round(unitPrice / perUnit))}`
                : ''}
          </span>
          {unitPrice !== listPrice && (
            <button
              onClick={() => {
                setPriceBy('unit');
                setPrice(listPrice);
                setOverride(false);
              }}
              className="flex items-center gap-1 text-sky-600 font-bold"
            >
              <RotateCcw className="w-3 h-3" /> قیمت لیست
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between text-sm font-bold text-slate-800 bg-sky-50 rounded-2xl px-4 py-3">
        <span>جمع این ردیف</span>
        <span className="font-mono text-sky-700">{formatToman(total)}</span>
      </div>
    </Sheet>
  );
};
