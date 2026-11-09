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
  const priceWrapRef = useRef<HTMLDivElement>(null);

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
  }, [product, existing, saleType, lockAlt, altRatio, perUnit]);

  // Open with the keyboard already up on the amount field (mobile browsers ignore a focus fired
  // before the portal settles, hence the short tick). Enter on it jumps to the price field.
  const focusedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!product) {
      focusedFor.current = null;
      return;
    }
    if (focusedFor.current === product._id) return;
    focusedFor.current = product._id;
    const tick = setTimeout(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus({ preventScroll: true });
      input.select();
    }, 60);
    return () => {
      if (typeof clearTimeout === 'function') clearTimeout(tick);
    };
  }, [product]);

  // Focus the price field once the sheet is past the amount; keeps the keyboard open between them.
  const focusPrice = () => {
    const input = priceWrapRef.current?.querySelector('input');
    input?.focus({ preventScroll: true });
    input?.select();
  };

  // Tapping anywhere outside the amount field closes the keyboard; tapping the field opens it again.
  // A tap that hands focus over to the price field keeps the keyboard up instead.
  useEffect(() => {
    if (!product || typeof window === 'undefined') return;
    const onDown = (e: PointerEvent) => {
      const input = inputRef.current;
      if (!input || document.activeElement !== input) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || priceWrapRef.current?.contains(target))) return;
      input.blur();
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [product]);

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

  const belowCost = !ignoreStock && (product.buyPrice || 0) > 0 && unitPrice < product.buyPrice;
  const confirm = () => {
    if (quantity <= 0) return;
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
            disabled={quantity <= 0}
            className="flex-1 py-2.5 rounded-2xl bg-sky-600 text-white text-sm font-bold disabled:opacity-40 active:scale-[0.98] transition"
          >
            {existing ? 'به‌روزرسانی سبد' : 'افزودن به سبد'} · {formatToman(total)}
          </button>
        </div>
      }
    >
      <div className="space-y-2">
      {/* مقدار — same box shape as the price box below */}
      <section className="rounded-2xl border border-slate-200 p-2.5 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold text-slate-700">
            {by === 'unit' ? `تعداد (${product.unit})` : `وزن (${altLabel})`}
          </span>
          {perUnit > 0 && perUnit !== 1 && !lockAlt && (
            <div className="flex gap-0.5 p-0.5 rounded-lg bg-slate-100">
              {(['unit', 'kg'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => switchBy(m)}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${by === m ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-500'}`}
                >
                  {m === 'unit' ? product.unit : altLabel}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button onClick={() => bump(-(by === 'unit' ? 1 : 10))} className="w-10 h-10 shrink-0 rounded-xl bg-slate-100 text-lg font-bold text-slate-600 active:scale-95">
            −
          </button>
          <div className="relative flex-1">
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value.replace(/[^0-9۰-۹٠-٩.٫]/g, ''))}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                focusPrice();
              }}
              onFocus={(e) => e.target.select()}
              inputMode="decimal"
              enterKeyHint="next"
              className="w-full h-10 text-center text-lg font-mono font-extrabold rounded-xl border border-sky-200 focus:border-sky-500 outline-none text-slate-800"
            />
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">{by === 'unit' ? product.unit : altLabel}</span>
          </div>
          <button onClick={() => bump(by === 'unit' ? 1 : 10)} className="w-10 h-10 shrink-0 rounded-xl bg-sky-600 text-white text-lg font-bold active:scale-95">
            +
          </button>
        </div>

        <div className="flex gap-1">
          {chips.map((c) => (
            <button key={c} onClick={() => bump(c)} className="flex-1 py-1 rounded-lg bg-slate-50 border border-slate-200 text-[10px] font-mono font-bold text-slate-600 active:scale-95">
              {num(c)}
            </button>
          ))}
        </div>
        {(perUnit > 0 && perUnit !== 1 || typed > 0 || overStock) && (
          <div className="text-center space-y-0.5">
            {perUnit > 0 && perUnit !== 1 && (
              <p className="text-[10px] text-slate-500">
                {by === 'unit' ? `معادل ${num(kg, 1)} ${altLabel}` : `معادل ${num(quantity, 3)} ${product.unit}`}
                {by === 'kg' && fractional && !lockAlt && <span className="text-amber-600"> (کسری از {product.unit})</span>}
              </p>
            )}
            {typed > 0 && (
              <p className="text-[11px] text-slate-700 font-bold">
                مبلغ این مقدار: <span className="font-mono text-sky-700">{formatToman(total)}</span>
              </p>
            )}
            {overStock && (
              <p className="text-[10px] text-rose-600 flex items-center justify-center gap-1">
                <AlertTriangle className="w-3 h-3" /> بیشتر از موجودی ({num(product.stock, 1)} {product.unit}
                {perUnit > 0 && perUnit !== 1 && ` · ${weight(product.stock * perUnit)}`})
              </p>
            )}
          </div>
        )}
      </section>

      {/* قیمت — same box shape as the amount box above */}
      <section className="rounded-2xl border border-slate-200 p-2.5 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold text-slate-700">قیمت</span>
          {perUnit > 0 && perUnit !== 1 && !lockAlt && (
            <div className="flex gap-0.5 p-0.5 rounded-lg bg-slate-100">
              {(['unit', 'kg'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => switchPriceBy(m)}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${priceBy === m ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-500'}`}
                >
                  {m === 'unit' ? `هر ${product.unit}` : `هر ${altLabel}`}
                </button>
              ))}
            </div>
          )}
        </div>
        {belowCost && (
          <p className="text-[10px] text-rose-600 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            کمتر از خرید ({formatToman(product.buyPrice)}). تأیید فروش با ضرر گرفته می‌شود.
          </p>
        )}
        <div ref={priceWrapRef}>
          <AmountInput
            value={price}
            enterKeyHint="done"
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              confirm();
            }}
            onChange={(v) => {
              setPrice(v);
              setOverride(true);
            }}
          />
        </div>
        <div className="flex items-center justify-between text-[10px] text-slate-500">
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
              className="flex items-center gap-0.5 text-sky-600 font-bold"
            >
              <RotateCcw className="w-3 h-3" /> قیمت لیست
            </button>
          )}
        </div>
      </section>
      </div>
    </Sheet>
  );
};
