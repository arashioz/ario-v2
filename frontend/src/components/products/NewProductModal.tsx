import React, { useState, useEffect, useRef } from 'react';
import {
  IonModal,
  IonHeader,
  IonToolbar,
  IonContent,
} from '@ionic/react';
import {
  X,
  Package,
  Barcode,
  Save,
  Wand2,
  Scale,
  DollarSign,
  Camera,
} from 'lucide-react';
import { productImageUrl, productsService } from '../../services/products.service';
import { resizeImage } from '../../lib/image';
import { formatToman, weight } from '../../lib/format';
import type { Product, CreateProductInput } from '../../services/products.service';
import { suppliersService } from '../../services/suppliers.service';
import { useNotification } from '../../context/NotificationContext';
import { LoadingOverlay } from '../LoadingOverlay';
import { MoneyTextInput } from '../ui/AmountInput';

interface NewProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProductSaved: (product: Product) => void;
  editProduct?: Product | null;
  categories?: string[];
}

export const NewProductModal: React.FC<NewProductModalProps> = ({
  isOpen,
  onClose,
  onProductSaved,
  editProduct,
  categories = ['خواربار و حبوبات', 'نایلون و پلاستیک', 'شوینده و بهداشتی', 'لبنیات', 'نوشیدنی'],
}) => {
  const { showNotification } = useNotification();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [name, setName] = useState('');
  const [barcode, setBarcode] = useState('');
  const [category, setCategory] = useState(categories[0] || 'عمومی');
  const [unit, setUnit] = useState('بسته');
  const [subcategory, setSubcategory] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [supplierNames, setSupplierNames] = useState<string[]>([]);
  const [subcategories, setSubcategories] = useState<string[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    suppliersService
      .list()
      .then((l) => setSupplierNames(l.map((s) => s.name)))
      .catch(() => undefined);
    productsService
      .getAll()
      .then((ps) => setSubcategories([...new Set(ps.map((p) => p.subcategory || '').filter(Boolean))]))
      .catch(() => undefined);
  }, [isOpen]);

  // Dual unit support
  const [hasDualUnit, setHasDualUnit] = useState(false);
  const [secondaryUnit, setSecondaryUnit] = useState('کیلوگرم');
  const [unitRatio, setUnitRatio] = useState('3'); // e.g. 1 package = 3 kg

  // Prices
  const [buyPrice, setBuyPrice] = useState('');
  const [sellPrice, setSellPrice] = useState(''); // تکی
  const [priceSupermarket, setPriceSupermarket] = useState(''); // سوپرمارکت
  const [priceWholesale, setPriceWholesale] = useState(''); // عمده

  const [stock, setStock] = useState('0');
  const [minStockAlert, setMinStockAlert] = useState('5');
  const [description, setDescription] = useState('');

  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [removePhoto, setRemovePhoto] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!photo) {
      setPhotoPreview('');
      return;
    }
    const url = URL.createObjectURL(photo);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const shownPhoto = photoPreview || (!removePhoto ? productImageUrl(editProduct?.image) : '');

  const formKg =
    hasDualUnit && secondaryUnit === 'کیلوگرم' ? Number(unitRatio) || 0 : unit === 'کیلوگرم' ? 1 : 0;
  const kgHint = (v: string) =>
    formKg > 0 && formKg !== 1 && Number(v) > 0 ? (
      <span className="text-[10px] text-slate-400 block font-mono">هر کیلو {formatToman(Math.round(Number(v) / formKg))}</span>
    ) : null;

  useEffect(() => {
    if (isOpen) {
      setPhoto(null);
      setRemovePhoto(false);
    }
    if (editProduct && isOpen) {
      setName(editProduct.name);
      setBarcode(editProduct.barcode || '');
      setCategory(editProduct.category || categories[0] || 'عمومی');
      setSubcategory(editProduct.subcategory || '');
      setSupplierName(editProduct.supplierName || '');
      setUnit(editProduct.unit || 'بسته');
      setHasDualUnit(!!editProduct.hasDualUnit);
      setSecondaryUnit(editProduct.secondaryUnit || 'کیلوگرم');
      setUnitRatio(editProduct.unitRatio ? editProduct.unitRatio.toString() : '3');
      setBuyPrice(editProduct.buyPrice ? editProduct.buyPrice.toString() : '');
      setSellPrice(editProduct.sellPrice.toString());
      setPriceSupermarket(editProduct.priceSupermarket ? editProduct.priceSupermarket.toString() : '');
      setPriceWholesale(editProduct.priceWholesale ? editProduct.priceWholesale.toString() : '');
      setStock(editProduct.stock.toString());
      setMinStockAlert(editProduct.minStockAlert ? editProduct.minStockAlert.toString() : '5');
      setDescription(editProduct.description || '');
    } else if (isOpen) {
      setName('');
      setBarcode('');
      setCategory(categories[0] || 'عمومی');
      setSubcategory('');
      setSupplierName('');
      setUnit('بسته');
      setHasDualUnit(false);
      setSecondaryUnit('کیلوگرم');
      setUnitRatio('3');
      setBuyPrice('');
      setSellPrice('');
      setPriceSupermarket('');
      setPriceWholesale('');
      setStock('0');
      setMinStockAlert('5');
      setDescription('');
    }
  }, [editProduct, isOpen, categories]);

  const generateBarcode = () => {
    const randomCode = '626' + Math.floor(1000000000 + Math.random() * 9000000000).toString();
    setBarcode(randomCode);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      showNotification({
        title: 'خطای ورودی',
        message: 'لطفاً نام کالا را وارد نمایید',
        type: 'warning',
      });
      return;
    }

    if (!sellPrice || Number(sellPrice) < 0) {
      showNotification({
        title: 'خطای ورودی',
        message: 'قیمت فروش تکی باید عدد معتبر باشد',
        type: 'warning',
      });
      return;
    }

    const payload: CreateProductInput = {
      name: name.trim(),
      barcode: barcode.trim() || undefined,
      category: category.trim() || 'عمومی',
      subcategory: subcategory.trim(),
      supplierName: supplierName.trim(),
      unit: unit.trim() || 'بسته',
      hasDualUnit,
      secondaryUnit: hasDualUnit ? secondaryUnit.trim() : undefined,
      unitRatio: hasDualUnit && unitRatio ? Number(unitRatio) : 1,
      weightPerUnitKg: hasDualUnit && secondaryUnit === 'کیلوگرم' ? Number(unitRatio) : (unit === 'کیلوگرم' ? 1 : 0),
      buyPrice: buyPrice ? Number(buyPrice) : 0,
      sellPrice: Number(sellPrice),
      priceRetail: Number(sellPrice),
      priceSupermarket: priceSupermarket ? Number(priceSupermarket) : Number(sellPrice),
      priceWholesale: priceWholesale ? Number(priceWholesale) : Number(sellPrice),
      stock: stock ? Number(stock) : 0,
      minStockAlert: minStockAlert ? Number(minStockAlert) : 5,
      description: description.trim() || undefined,
    };

    setIsSubmitting(true);
    try {
      let saved: Product;
      if (editProduct) {
        saved = await productsService.update(editProduct._id, payload);
        showNotification({
          title: 'به‌روزرسانی موفق',
          message: `اطلاعات کالای «${saved.name}» ویرایش گردید.`,
          type: 'success',
        });
      } else {
        saved = await productsService.create(payload);
        showNotification({
          title: 'ثبت کالای جدید',
          message: `کالای «${saved.name}» به انبار آریو اضافه شد.`,
          type: 'success',
        });
      }

      try {
        if (photo) saved = await productsService.uploadImage(saved._id, await resizeImage(photo));
        else if (removePhoto && editProduct?.image) saved = await productsService.removeImage(saved._id);
      } catch (err: any) {
        showNotification({
          title: 'کالا ذخیره شد ولی تصویر نه',
          message: err?.response?.data?.message || 'آپلود تصویر ناموفق بود؛ دوباره تلاش کنید.',
          type: 'warning',
        });
      }

      onProductSaved(saved);
      onClose();
    } catch (err: any) {
      const errMsg = err.response?.data?.message || 'خطا در ذخیره‌سازی کالا';
      showNotification({
        title: 'خطای عملیات',
        message: Array.isArray(errMsg) ? errMsg.join(' - ') : errMsg,
        type: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <IonModal isOpen={isOpen} onDidDismiss={onClose} className="product-modal">
      <IonHeader className="ion-no-border">
        <IonToolbar className="bg-white/95 backdrop-blur-md px-3 py-2 border-b border-sky-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center">
                <Package className="w-4 h-4" />
              </div>
              <h2 className="text-sm font-semibold text-slate-800">
                {editProduct ? 'ویرایش مشخصات کالا' : 'تعریف کالای جدید بنکداری'}
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
        <LoadingOverlay isOpen={isSubmitting} message="در حال ذخیره اطلاعات کالا..." />

        <form onSubmit={handleSubmit} className="p-3 space-y-3 max-w-md mx-auto pb-6">
          <div className="flex items-center gap-3 bg-white p-3 rounded-2xl border border-sky-100">
            <button
              type="button"
              onClick={() => photoInput.current?.click()}
              className="w-20 h-20 shrink-0 rounded-2xl overflow-hidden bg-slate-100 border border-dashed border-slate-300 flex items-center justify-center"
            >
              {shownPhoto ? (
                <img src={shownPhoto} alt="" className="w-full h-full object-cover" />
              ) : (
                <Camera className="w-6 h-6 text-slate-400" />
              )}
            </button>
            <div className="flex-1 space-y-1.5">
              <span className="text-xs font-medium text-slate-700 block">عکس کالا</span>
              <span className="text-[10px] text-slate-400 block">در کاتالوگ آنلاین و صفحه فروش نمایش داده می‌شود</span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => photoInput.current?.click()}
                  className="px-3 py-1.5 rounded-xl bg-sky-50 text-sky-700 border border-sky-200 text-[11px] font-bold"
                >
                  {shownPhoto ? 'تغییر عکس' : 'انتخاب عکس'}
                </button>
                {shownPhoto && (
                  <button
                    type="button"
                    onClick={() => {
                      setPhoto(null);
                      setRemovePhoto(true);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-rose-50 text-rose-600 border border-rose-200 text-[11px] font-bold"
                  >
                    حذف
                  </button>
                )}
              </div>
            </div>
            <input
              ref={photoInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setPhoto(f);
                  setRemovePhoto(false);
                }
                e.target.value = '';
              }}
            />
          </div>

          {/* Product Name */}
          <div className="space-y-1 text-right">
            <label className="text-xs font-medium text-slate-700 block">
              نام کالا <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: نایلون عریض درجه یک طرح ۵، برنج طارم..."
              className="w-full px-3.5 py-2.5 text-xs rounded-2xl bg-white border border-sky-100 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition text-slate-800"
            />
          </div>

          {/* Barcode & Category */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1 text-right">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-700 flex items-center gap-1">
                  <Barcode className="w-3.5 h-3.5 text-sky-500" />
                  <span>بارکد</span>
                </label>
                <button
                  type="button"
                  onClick={generateBarcode}
                  className="text-[10px] text-sky-600 font-medium hover:underline flex items-center gap-0.5"
                >
                  <Wand2 className="w-3 h-3" />
                  تولید تصادفی
                </button>
              </div>
              <input
                type="text"
                dir="ltr"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="626..."
                className="w-full px-3.5 py-2.5 text-xs rounded-2xl bg-white border border-sky-100 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition text-slate-800 font-mono"
              />
            </div>

            <div className="space-y-1 text-right">
              <label className="text-xs font-medium text-slate-700 block">دسته‌بندی</label>
              <input
                type="text"
                list="category-options"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="انتخاب یا تایپ دسته"
                className="w-full px-3.5 py-2.5 text-xs rounded-2xl bg-white border border-sky-100 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition text-slate-800"
              />
              <datalist id="category-options">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1 text-right">
              <label className="text-xs font-medium text-slate-700 block">زیردسته</label>
              <input
                type="text"
                list="subcategory-options"
                value={subcategory}
                onChange={(e) => setSubcategory(e.target.value)}
                placeholder="مثال: کارتنی، کیسه"
                className="w-full px-3.5 py-2.5 text-xs rounded-2xl bg-white border border-sky-100 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition text-slate-800"
              />
              <datalist id="subcategory-options">
                {subcategories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1 text-right">
              <label className="text-xs font-medium text-slate-700 block">شرکت تأمین‌کننده</label>
              <input
                type="text"
                list="supplier-options"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder="از کدام شرکت می‌خرید"
                className="w-full px-3.5 py-2.5 text-xs rounded-2xl bg-white border border-sky-100 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition text-slate-800"
              />
              <datalist id="supplier-options">
                {supplierNames.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
          </div>

          {/* Unit & Dual-Unit Section */}
          <div className="bg-white p-3 rounded-2xl border border-sky-100 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Scale className="w-4 h-4 text-sky-600" />
                <span className="text-xs font-medium text-slate-700">واحد سنجش و تبدیل وزن</span>
              </div>

              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasDualUnit}
                  onChange={(e) => setHasDualUnit(e.target.checked)}
                  className="rounded text-sky-600 focus:ring-sky-500 w-4 h-4"
                />
                <span className="text-xs text-sky-700 font-medium">دو واحدی (بسته + کیلوگرم)</span>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1 text-right">
                <label className="text-[11px] text-slate-500">واحد اصلی شمارش (انبار)</label>
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 outline-none text-slate-800"
                >
                  <option value="بسته">بسته</option>
                  <option value="عدد">عدد</option>
                  <option value="کارتن">کارتن</option>
                  <option value="کیسه">کیسه</option>
                  <option value="طاقه">طاقه</option>
                  <option value="کیلوگرم">کیلوگرم</option>
                  <option value="قوطی">قوطی</option>
                </select>
              </div>

              {hasDualUnit ? (
                <div className="space-y-1 text-right">
                  <label className="text-[11px] text-slate-500">واحد فرعی (وزن/متراژ)</label>
                  <select
                    value={secondaryUnit}
                    onChange={(e) => setSecondaryUnit(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 outline-none text-slate-800"
                  >
                    <option value="کیلوگرم">کیلوگرم</option>
                    <option value="گرم">گرم</option>
                    <option value="متر">متر</option>
                  </select>
                </div>
              ) : (
                <div className="space-y-1 text-right">
                  <label className="text-[11px] text-slate-400">حداقل هشدار موجودی</label>
                  <input
                    type="number"
                    value={minStockAlert}
                    onChange={(e) => setMinStockAlert(e.target.value)}
                    placeholder="5"
                    className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 outline-none text-slate-800 font-mono"
                  />
                </div>
              )}
            </div>

            {hasDualUnit && (
              <div className="p-2.5 rounded-xl bg-sky-50/70 border border-sky-200/60 flex items-center justify-between text-xs text-sky-900">
                <span className="font-normal text-[11px]">ضریب تبدیل: هر ۱ {unit} برابر است با:</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    step="0.1"
                    value={unitRatio}
                    onChange={(e) => setUnitRatio(e.target.value)}
                    className="w-16 px-2 py-1 bg-white rounded-lg border border-sky-300 text-center font-mono font-medium text-xs outline-none"
                  />
                  <span className="text-[11px]">{secondaryUnit}</span>
                </div>
              </div>
            )}
          </div>

          {/* Pricing Tiers: Retail, Supermarket, Wholesale */}
          <div className="bg-white p-3 rounded-2xl border border-sky-100 space-y-3">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-medium text-slate-700">قیمت‌گذاری بنکداری (۳ رده قیمتی)</span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1 text-right">
                <label className="text-[11px] text-slate-600 block">
                  قیمت تکی <span className="text-rose-500">*</span>
                </label>
                <MoneyTextInput
                  value={sellPrice}
                  onChange={setSellPrice}
                  placeholder="۰"
                  className="w-full px-2.5 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 outline-none font-mono text-slate-800"
                />
                {kgHint(sellPrice)}
              </div>

              <div className="space-y-1 text-right">
                <label className="text-[11px] text-sky-700 block font-medium">سوپرمارکت</label>
                <MoneyTextInput
                  value={priceSupermarket}
                  onChange={setPriceSupermarket}
                  placeholder={sellPrice ? Number(sellPrice).toLocaleString('fa-IR') : '۰'}
                  className="w-full px-2.5 py-2 text-xs rounded-xl bg-sky-50/50 border border-sky-200 outline-none font-mono text-slate-800"
                />
                {kgHint(priceSupermarket || sellPrice)}
              </div>

              <div className="space-y-1 text-right">
                <label className="text-[11px] text-purple-700 block font-medium">عمده / بنکداری</label>
                <MoneyTextInput
                  value={priceWholesale}
                  onChange={setPriceWholesale}
                  placeholder={sellPrice ? Number(sellPrice).toLocaleString('fa-IR') : '۰'}
                  className="w-full px-2.5 py-2 text-xs rounded-xl bg-purple-50/50 border border-purple-200 outline-none font-mono text-slate-800"
                />
                {kgHint(priceWholesale || sellPrice)}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="space-y-1 text-right">
                <label className="text-[11px] text-slate-500">قیمت خرید (سرمایه)</label>
                <MoneyTextInput
                  value={buyPrice}
                  onChange={setBuyPrice}
                  placeholder="۰"
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 outline-none font-mono text-slate-800"
                />
                {kgHint(buyPrice)}
              </div>

              <div className="space-y-1 text-right">
                <label className="text-[11px] text-slate-500">موجودی انبار ({unit})</label>
                <input
                  type="number"
                  value={stock}
                  onChange={(e) => setStock(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 outline-none font-mono text-slate-800"
                />
                {formKg > 0 && formKg !== 1 && Number(stock) > 0 && (
                  <span className="text-[10px] text-slate-400 block">معادل {weight(Number(stock) * formKg)}</span>
                )}
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1 text-right">
            <label className="text-xs font-medium text-slate-700 block">توضیحات تکمیلی</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="مشخصات فیزیکی، بسته‌بندی، شرکت تولیدکننده..."
              className="w-full px-3.5 py-2 text-xs rounded-2xl bg-white border border-sky-100 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition text-slate-800 resize-none"
            />
          </div>

          {/* Submit */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 px-4 rounded-2xl bg-sky-600 hover:bg-sky-700 active:scale-98 text-white font-semibold text-xs shadow-md shadow-sky-500/25 transition flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" />
              <span>{editProduct ? 'ذخیره تغییرات کالا' : 'افزودن به کاتالوگ فروشگاه'}</span>
            </button>
          </div>
        </form>
      </IonContent>
    </IonModal>
  );
};
