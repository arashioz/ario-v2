import React, { useRef, useState } from 'react';
import { Camera, ImageOff, Loader2 } from 'lucide-react';
import type { Product } from '../../services/products.service';
import { productImageUrl, productsService } from '../../services/products.service';
import { kgPerUnit, pricePerKg, stockKg, tierPrice } from '../pos/cart';
import { formatToman, num, weight } from '../../lib/format';
import { resizeImage } from '../../lib/image';
import { useNotification } from '../../context/NotificationContext';

const TIERS = [
  ['retail', 'تکی'],
  ['supermarket', 'سوپرمارکت'],
  ['wholesale', 'عمده'],
] as const;

/** Every sale tier as both package price and per-kg price. `by` picks which column is the main one. */
export const PriceTiers: React.FC<{ product: Product; by?: 'unit' | 'kg' }> = ({ product, by = 'unit' }) => {
  const hasKg = kgPerUnit(product) > 0 && product.unit !== 'کیلوگرم';
  const kilo = by === 'kg' && hasKg;
  return (
    <table className="w-full text-[11px]">
      <thead>
        <tr className="text-slate-400">
          <th className="text-right font-normal pb-1">قیمت</th>
          <th className={`text-left font-normal pb-1 ${kilo ? '' : 'font-bold text-slate-500'}`}>هر {product.unit}</th>
          {hasKg && <th className={`text-left font-normal pb-1 ${kilo ? 'font-bold text-slate-500' : ''}`}>هر کیلو</th>}
        </tr>
      </thead>
      <tbody>
        {TIERS.map(([key, label]) => {
          const price = tierPrice(product, key);
          const perKg = pricePerKg(price, product);
          return (
            <tr key={key} className="border-t border-slate-100">
              <td className="py-1 text-slate-500">{label}</td>
              <td className={`py-1 text-left font-mono ${kilo ? 'text-slate-400' : 'font-bold text-sky-800'}`}>{formatToman(price)}</td>
              {hasKg && (
                <td className={`py-1 text-left font-mono ${kilo ? 'font-bold text-emerald-800' : 'font-semibold text-slate-600'}`}>
                  {formatToman(perKg)}
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};

/** Stock in packages and, when the package weight is known, in kilograms. */
export const StockAmount: React.FC<{ product: Product; stock?: number; className?: string }> = ({
  product,
  stock,
  className = '',
}) => {
  const units = stock ?? product.stock;
  const kg = kgPerUnit(product) > 0 ? stockKg({ ...product, stock: units }) : 0;
  return (
    <span className={className}>
      <span className="font-mono font-bold">
        {num(units, 2)} {product.unit}
      </span>
      {kg > 0 && product.unit !== 'کیلوگرم' && (
        <span className="block text-[10px] font-normal text-slate-500 font-mono">{weight(kg)}</span>
      )}
    </span>
  );
};

/** Square product photo; tap to pick a new one from camera or gallery. */
export const ProductPhoto: React.FC<{
  product: Product;
  size?: string;
  editable?: boolean;
  onChanged?: (p: Product) => void;
}> = ({ product, size = 'w-16 h-16', editable = false, onChanged }) => {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const { showNotification } = useNotification();
  const src = productImageUrl(product.image);

  const upload = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const updated = await productsService.uploadImage(product._id, await resizeImage(file));
      onChanged?.(updated);
    } catch (err: any) {
      showNotification({
        title: 'آپلود تصویر ناموفق بود',
        message: err?.response?.data?.message || 'دوباره تلاش کنید',
        type: 'error',
      });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <>
      <button
        type="button"
        disabled={!editable || busy}
        onClick={() => input.current?.click()}
        className={`${size} relative shrink-0 rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center`}
        title={editable ? 'تغییر تصویر' : undefined}
      >
        {src ? (
          <img src={src} alt={product.name} loading="lazy" className="w-full h-full object-cover" />
        ) : editable ? (
          <Camera className="w-5 h-5 text-slate-400" />
        ) : (
          <ImageOff className="w-5 h-5 text-slate-300" />
        )}
        {editable && !busy && (
          <span className="absolute inset-x-0 bottom-0 bg-slate-900/70 text-white text-[9px] font-bold py-0.5 text-center">عکس</span>
        )}
        {busy && (
          <span className="absolute inset-0 bg-white/70 flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-sky-600 animate-spin" />
          </span>
        )}
      </button>
      {editable && (
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => upload(e.target.files?.[0])}
        />
      )}
    </>
  );
};
