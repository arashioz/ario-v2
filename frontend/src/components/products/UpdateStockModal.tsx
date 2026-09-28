import React, { useState } from 'react';
import { IonModal, IonHeader, IonToolbar, IonContent } from '@ionic/react';
import {
  X,
  Boxes,
  PlusCircle,
  MinusCircle,
  CheckCircle2,
} from 'lucide-react';
import { productsService } from '../../services/products.service';
import type { Product } from '../../services/products.service';
import { useNotification } from '../../context/NotificationContext';
import { LoadingOverlay } from '../LoadingOverlay';
import { kgPerUnit, stockKg } from '../pos/cart';
import { num, weight } from '../../lib/format';
import { StockAmount } from './ProductPriceInfo';

interface UpdateStockModalProps {
  isOpen: boolean;
  product: Product | null;
  onClose: () => void;
  onStockUpdated: (updatedProduct: Product) => void;
}

export const UpdateStockModal: React.FC<UpdateStockModalProps> = ({
  isOpen,
  product,
  onClose,
  onStockUpdated,
}) => {
  const { showNotification } = useNotification();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [operation, setOperation] = useState<'increase' | 'decrease'>('increase');
  const [quantity, setQuantity] = useState<string>('');
  const [by, setBy] = useState<'unit' | 'kg'>('unit');
  const [reason, setReason] = useState('');

  if (!product) return null;

  const k = kgPerUnit(product);
  const hasKg = k > 0 && k !== 1;
  const currentStock = product.stock || 0;
  const typed = quantity ? Number(quantity) : 0;
  const numQty = by === 'kg' && hasKg ? Math.round((typed / k) * 1e6) / 1e6 : typed;
  const projectedStock =
    operation === 'increase' ? currentStock + numQty : Math.max(0, currentStock - numQty);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!numQty || numQty <= 0) {
      showNotification({
        title: 'خطای تعداد',
        message: 'لطفاً مقدار معتبر وارد نمایید',
        type: 'warning',
      });
      return;
    }

    if (operation === 'decrease' && numQty > currentStock) {
      showNotification({
        title: 'خطای موجودی',
        message: 'مقدار خروج از انبار نمی‌تواند بیشتر از موجودی فعلی باشد',
        type: 'warning',
      });
      return;
    }

    const delta = operation === 'increase' ? numQty : -numQty;

    setIsSubmitting(true);
    try {
      const updated = await productsService.updateStock(product._id, {
        quantityChange: delta,
        reason: reason.trim() || undefined,
      });

      showNotification({
        title: 'موجودی انبار به‌روزرسانی شد',
        message: `موجودی جدید «${product.name}» به ${num(updated.stock, 2)} ${updated.unit}${
          hasKg ? ` (${weight(stockKg(updated))})` : ''
        } رسید.`,
        type: 'success',
      });

      onStockUpdated(updated);
      setQuantity('');
      setReason('');
      onClose();
    } catch (err: any) {
      const errMsg = err.response?.data?.message || 'خطا در اصلاح موجودی انبار';
      showNotification({
        title: 'خطا',
        message: Array.isArray(errMsg) ? errMsg.join(' - ') : errMsg,
        type: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <IonModal isOpen={isOpen} onDidDismiss={onClose}>
      <IonHeader className="ion-no-border">
        <IonToolbar className="bg-white px-3 py-2 border-b border-sky-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center">
                <Boxes className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-extrabold text-slate-800">اصلاح موجودی انبار</h2>
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
        <LoadingOverlay isOpen={isSubmitting} message="در حال ثبت در کاردکس انبار..." />

        <form onSubmit={handleSubmit} className="p-3 space-y-3 max-w-md mx-auto pb-6">
          {/* Current Stock info */}
          <div className="bg-white rounded-2xl p-3 border border-sky-100 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-400 block">موجودی فعلی در انبار:</span>
              <StockAmount product={product} className="text-lg text-slate-800 mt-0.5 block" />
            </div>

            <div className="text-left text-xs text-slate-400">
              <span>حداقل هشدار:</span>
              <span className="font-bold text-slate-600 mr-1">{product.minStockAlert} {product.unit}</span>
            </div>
          </div>

          {/* Operation Toggle */}
          <div className="grid grid-cols-2 p-1 bg-white rounded-2xl border border-sky-100 shadow-sm">
            <button
              type="button"
              onClick={() => setOperation('increase')}
              className={`py-2 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 ${
                operation === 'increase'
                  ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-400/30'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <PlusCircle className="w-4 h-4" />
              <span>ورود بار به انبار (+)</span>
            </button>

            <button
              type="button"
              onClick={() => setOperation('decrease')}
              className={`py-2 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 ${
                operation === 'decrease'
                  ? 'bg-rose-500 text-white shadow-sm shadow-rose-400/30'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <MinusCircle className="w-4 h-4" />
              <span>کسری / خروج / ضایعات (-)</span>
            </button>
          </div>

          {/* Quantity Input */}
          {hasKg && (
            <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-slate-100">
              {(['unit', 'kg'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setBy(m);
                    setQuantity('');
                  }}
                  className={`py-2 rounded-xl text-xs font-bold transition ${
                    by === m ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  {m === 'unit' ? `تعداد ${product.unit}` : 'وزن (کیلوگرم)'}
                </button>
              ))}
            </div>
          )}

          <div className="space-y-1 text-right">
            <label className="text-xs font-bold text-slate-700 block">
              {by === 'kg' && hasKg ? 'مقدار به کیلوگرم' : `تعداد به (${product.unit})`}{' '}
              <span className="text-rose-500">*</span>
            </label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="مثلا: 10"
              dir="ltr"
              className="w-full px-3.5 py-3 text-base rounded-2xl bg-white border border-sky-100 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition text-slate-800 font-mono font-bold"
            />
            {hasKg && typed > 0 && (
              <span className="text-[11px] text-slate-500 block">
                {by === 'kg' ? `معادل ${num(numQty, 2)} ${product.unit}` : `معادل ${weight(typed * k)}`}
              </span>
            )}
          </div>

          {/* Quick Quantity Chips */}
          <div className="flex flex-wrap gap-1.5">
            {[1, 5, 10, 20, 50].map((quickVal) => (
              <button
                key={quickVal}
                type="button"
                onClick={() => setQuantity(quickVal.toString())}
                className="px-3 py-1 rounded-xl bg-white border border-slate-200 hover:border-sky-300 text-slate-600 text-xs font-medium transition"
              >
                +{quickVal}
              </button>
            ))}
          </div>

          {/* Reason Input */}
          <div className="space-y-1 text-right">
            <label className="text-xs font-bold text-slate-700 block">بابت / توضیحات انبار</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="مثلا: فاکتور خرید شرکت، انبارگردانی، ضایعات..."
              className="w-full px-3.5 py-2.5 text-xs rounded-2xl bg-white border border-sky-100 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition text-slate-800"
            />
          </div>

          {/* Projected Stock Preview */}
          <div className="bg-sky-50/70 rounded-2xl p-3 border border-sky-200/60 flex items-center justify-between text-xs">
            <span className="text-slate-600 font-medium">موجودی پس از تغییر:</span>
            <StockAmount product={product} stock={projectedStock} className="text-sm text-sky-800 text-left" />
          </div>

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className={`w-full py-3.5 px-4 rounded-2xl active:scale-98 text-white font-bold text-xs shadow-md transition flex items-center justify-center gap-2 ${
                operation === 'increase'
                  ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/25'
                  : 'bg-rose-600 hover:bg-rose-700 shadow-rose-500/25'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {operation === 'increase' ? 'ثبت ورود بار به انبار' : 'ثبت خروج از انبار'}
              </span>
            </button>
          </div>
        </form>
      </IonContent>
    </IonModal>
  );
};
