import React, { useState } from 'react';
import { IonModal, IonHeader, IonToolbar, IonContent } from '@ionic/react';
import {
  X,
  Layers,
  Percent,
  Coins,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { productsService } from '../../services/products.service';
import { useNotification } from '../../context/NotificationContext';
import { LoadingOverlay } from '../LoadingOverlay';
import { formatToman } from '../../lib/format';
import { MoneyTextInput } from '../ui/AmountInput';

interface BulkPriceModalProps {
  isOpen: boolean;
  categories: string[];
  onClose: () => void;
  onSuccess: () => void;
}

export const BulkPriceModal: React.FC<BulkPriceModalProps> = ({
  isOpen,
  categories,
  onClose,
  onSuccess,
}) => {
  const { showNotification } = useNotification();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [type, setType] = useState<'percentage' | 'fixed'>('percentage');
  const [value, setValue] = useState<string>('10');
  const [reason, setReason] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const numValue = Number(value);
    if (!numValue || isNaN(numValue)) {
      showNotification({
        title: 'خطای مقدار',
        message: 'لطفاً مقدار معتبر وارد نمایید',
        type: 'warning',
      });
      return;
    }

    const targetDesc =
      selectedCategory === 'all'
        ? 'تمامی محصولات فروشگاه'
        : `کالاهای دسته «${selectedCategory}»`;

    const changeDesc =
      type === 'percentage' ? `${numValue} درصد` : `${formatToman(numValue)}`;

    if (
      !window.confirm(
        `آیا مطمئن هستید که می‌خواهید قیمت پایه ${targetDesc} را به میزان ${changeDesc} تغییر دهید؟`
      )
    ) {
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await productsService.bulkUpdatePrices({
        category: selectedCategory === 'all' ? undefined : selectedCategory,
        type,
        value: numValue,
        reason: reason.trim() || undefined,
      });

      showNotification({
        title: 'به‌روزرسانی دسته‌جمعی موفق',
        message: res.message,
        type: 'success',
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      const errMsg = err.response?.data?.message || 'خطا در تغییر گروهی قیمت‌ها';
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
              <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center">
                <Layers className="w-4 h-4" />
              </div>
              <h2 className="text-sm font-extrabold text-slate-800">
                تغییر سراسری / گروهی قیمت کالاها
              </h2>
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
        <LoadingOverlay isOpen={isSubmitting} message="در حال محاسبه و اعمال قیمت‌های جدید..." />

        <form onSubmit={handleSubmit} className="p-3 space-y-3 max-w-md mx-auto pb-6">
          <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <span className="leading-relaxed">
              این ابزار قیمت پایه کالاهای انتخاب شده را به صورت خودکار تغییر داده و در سوابق ثبت می‌کند.
            </span>
          </div>

          {/* Category Selector */}
          <div className="space-y-1 text-right">
            <label className="text-xs font-bold text-slate-700 block">انتخاب دسته کالاها</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-3.5 py-3 text-xs rounded-2xl bg-white border border-sky-100 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition text-slate-800"
            >
              <option value="all">همه دسته‌بندی‌ها (تمام کالاهای فروشگاه)</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  دسته: {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Type Toggle: Percentage vs Fixed */}
          <div className="grid grid-cols-2 p-1 bg-white rounded-2xl border border-sky-100 shadow-sm">
            <button
              type="button"
              onClick={() => setType('percentage')}
              className={`py-2 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 ${
                type === 'percentage'
                  ? 'bg-purple-600 text-white shadow-sm shadow-purple-400/30'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Percent className="w-4 h-4" />
              <span>درصدی (٪)</span>
            </button>

            <button
              type="button"
              onClick={() => setType('fixed')}
              className={`py-2 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 ${
                type === 'fixed'
                  ? 'bg-purple-600 text-white shadow-sm shadow-purple-400/30'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Coins className="w-4 h-4" />
              <span>مبلغ ثابت (تومان)</span>
            </button>
          </div>

          {/* Value Input */}
          <div className="space-y-1 text-right">
            <label className="text-xs font-bold text-slate-700 block">
              {type === 'percentage' ? 'درصد تغییر (مثلا 10 یا -5)' : 'مبلغ افزایش یا کاهش به تومان'}
            </label>
            {type === 'fixed' ? (
              <MoneyTextInput
                value={value}
                onChange={setValue}
                allowNegative
                placeholder="مثلا ۵٬۰۰۰"
                className="w-full px-3.5 py-3 text-base rounded-2xl bg-white border border-sky-100 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition text-slate-800 font-mono font-bold"
              />
            ) : (
              <input
                type="text"
                inputMode="decimal"
                value={value}
                onChange={(e) => setValue(e.target.value.replace(/[^0-9۰-۹.-]/g, ''))}
                placeholder="مثلا ۱۰"
                dir="ltr"
                className="w-full px-3.5 py-3 text-base rounded-2xl bg-white border border-sky-100 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition text-slate-800 font-mono font-bold"
              />
            )}
          </div>

          {/* Reason Input */}
          <div className="space-y-1 text-right">
            <label className="text-xs font-bold text-slate-700 block">علت تغییر گروهی</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="مثلا: مصوبه جدید اتحادیه، افزایش ۱۰ درصدی کارخانجات..."
              className="w-full px-3.5 py-2.5 text-xs rounded-2xl bg-white border border-sky-100 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition text-slate-800"
            />
          </div>

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 px-4 rounded-2xl bg-purple-600 hover:bg-purple-700 active:scale-98 text-white font-bold text-xs shadow-md shadow-purple-500/25 transition flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>اعمال تغییر گروهی روی کالاها</span>
            </button>
          </div>
        </form>
      </IonContent>
    </IonModal>
  );
};
