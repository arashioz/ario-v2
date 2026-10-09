import React, { useState, useEffect } from 'react';
import {
  IonModal,
  IonHeader,
  IonToolbar,
  IonContent,
} from '@ionic/react';
import {
  X,
  PackagePlus,
  Plus,
  Trash2,
  Calendar,
  Building,
  Save,
  Scale,
  Sparkles,
  Truck,
  Search,
} from 'lucide-react';
import { productsService } from '../../services/products.service';
import type { Product } from '../../services/products.service';
import { invoicesService } from '../../services/invoices.service';
import type { Invoice } from '../../services/invoices.service';
import { suppliersService, type SupplierListItem } from '../../services/suppliers.service';
import { useNotification } from '../../context/NotificationContext';
import { LoadingOverlay } from '../LoadingOverlay';
import { InvoiceDateModal } from '../pos/InvoiceDateModal';
import { formatJalali, todayYmd } from '../../lib/jalali';
import { formatToman, tons } from '../../lib/format';
import { MoneyTextInput } from '../ui/AmountInput';

interface NewPurchaseInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInvoiceCreated: (invoice: Invoice) => void;
}

interface PurchaseItemRow {
  productId: string;
  productName: string;
  quantity: number; // تعداد واحد اصلی (مثلاً کارتن یا بسته)
  unit: string;
  hasDualUnit: boolean;
  secondaryQuantity: number; // مقدار واحد فرعی (مثلاً کیلوگرم)
  secondaryUnit: string;
  unitRatio: number; // هر واحد اصلی = چند کیلوگرم
  unitBuyPrice: number; // قیمت خرید هر واحد اصلی
  totalPrice: number;
  received: boolean;
}

export const NewPurchaseInvoiceModal: React.FC<NewPurchaseInvoiceModalProps> = ({
  isOpen,
  onClose,
  onInvoiceCreated,
}) => {
  const { showNotification } = useNotification();

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);

  const [supplierName, setSupplierName] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [invoiceDate, setInvoiceDate] = useState<string>(todayYmd);
  const [isDateModalOpen, setIsDateModalOpen] = useState(false);
  // Purchases from the parent company are paid later from the supplier account.
  const [paymentMethod, setPaymentMethod] = useState<'pos' | 'cash' | 'transfer' | 'cheque' | 'credit'>('credit');
  const [discount, setDiscount] = useState<string>('0');
  const [freight, setFreight] = useState<string>('0');
  const [notes, setNotes] = useState('');

  const [items, setItems] = useState<PurchaseItemRow[]>([]);

  // Item form states
  const [selectedProductId, setSelectedProductId] = useState('');
  const [productQuery, setProductQuery] = useState('');
  const [customProductName, setCustomProductName] = useState('');
  const [itemQuantity, setItemQuantity] = useState<string>('1');
  const [itemUnit, setItemUnit] = useState<string>('بسته');
  const [itemHasDual, setItemHasDual] = useState<boolean>(true);
  const [itemRatio, setItemRatio] = useState<string>('5');
  const [itemSecondaryQty, setItemSecondaryQty] = useState<string>('5');
  const [itemBuyPrice, setItemBuyPrice] = useState<string>('0');

  const [suppliers, setSuppliers] = useState<SupplierListItem[]>([]);

  useEffect(() => {
    if (isOpen) {
      loadProducts();
      suppliersService.list().then(setSuppliers).catch(() => undefined);
    }
  }, [isOpen]);

  const loadProducts = async () => {
    try {
      setLoading(true);
      setLoadError(false);
      const prods = await productsService.getAll();
      setProducts(prods);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  const handleProductSelect = (prodId: string) => {
    setSelectedProductId(prodId);
    const p = products.find((x) => x._id === prodId);
    if (p) {
      if (!supplierName.trim() && p.supplierName) setSupplierName(p.supplierName);
      setCustomProductName(p.name);
      setItemUnit(p.unit || 'بسته');
      setItemHasDual(p.hasDualUnit || false);
      const ratio = p.unitRatio || p.weightPerUnitKg || 1;
      setItemRatio(ratio.toString());
      const q = Number(itemQuantity) || 1;
      setItemSecondaryQty((q * ratio).toString());
      setItemBuyPrice((p.buyPrice || 0).toString());
    }
  };

  // Auto-convert between primary qty and secondary qty based on ratio
  const handleQuantityChange = (newQtyStr: string) => {
    setItemQuantity(newQtyStr);
    const q = Number(newQtyStr) || 0;
    const r = Number(itemRatio) || 1;
    if (itemHasDual) {
      setItemSecondaryQty((q * r).toString());
    }
  };

  const handleSecondaryQtyChange = (newSecStr: string) => {
    setItemSecondaryQty(newSecStr);
    const sec = Number(newSecStr) || 0;
    const r = Number(itemRatio) || 1;
    if (r > 0) {
      const computedPkg = Math.round((sec / r) * 100) / 100;
      setItemQuantity(computedPkg.toString());
    }
  };

  const handleRatioChange = (newRatioStr: string) => {
    setItemRatio(newRatioStr);
    const r = Number(newRatioStr) || 1;
    const q = Number(itemQuantity) || 0;
    setItemSecondaryQty((q * r).toString());
  };

  const handleAddItem = () => {
    const p = products.find((x) => x._id === selectedProductId);
    const name = p ? p.name : customProductName.trim();
    if (!name) {
      showNotification({
        title: 'انتخاب کالا',
        message: 'لطفاً نام یا کالای ورودی را انتخاب کنید.',
        type: 'warning',
      });
      return;
    }

    const qty = Number(itemQuantity) || 1;
    const price = Number(itemBuyPrice) || 0;
    const ratio = Number(itemRatio) || 1;
    const secQty = itemHasDual ? (Number(itemSecondaryQty) || qty * ratio) : 0;
    const lineTotal = qty * price;

    setItems((prev) => [
      ...prev,
      {
        productId: p ? p._id : `custom-${Date.now()}`,
        productName: name,
        quantity: qty,
        unit: itemUnit,
        hasDualUnit: itemHasDual,
        secondaryQuantity: secQty,
        secondaryUnit: 'کیلوگرم',
        unitRatio: ratio,
        unitBuyPrice: price,
        totalPrice: lineTotal,
        received: true,
      },
    ]);

    // Reset item input
    setSelectedProductId('');
    setCustomProductName('');
    setItemQuantity('1');
    setItemSecondaryQty('5');
    setItemBuyPrice('0');
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const subtotal = items.reduce((sum, it) => sum + it.totalPrice, 0);
  const discountNum = Number(discount) || 0;
  const finalAmount = Math.max(0, subtotal - discountNum);
  const freightNum = Math.max(0, Number(freight) || 0);
  const totalWeightKg = items.reduce((sum, it) => sum + (it.hasDualUnit ? it.secondaryQuantity : 0), 0);
  const freightPerKg = totalWeightKg > 0 ? freightNum / totalWeightKg : 0;
  const discountFactor = subtotal > 0 ? finalAmount / subtotal : 1;

  const handleSubmit = async () => {
    if (!supplierName.trim()) {
      showNotification({
        title: 'نام تامین‌کننده',
        message: 'لطفاً نام تامین‌کننده / فروشنده کالا را وارد کنید.',
        type: 'warning',
      });
      return;
    }

    if (items.length === 0) {
      showNotification({
        title: 'لیست اقلام خالی است',
        message: 'حداقل یک قلم کالا به فاکتور خرید اضافه نمایید.',
        type: 'warning',
      });
      return;
    }

    try {
      setSubmitting(true);
      const invoiceData = {
        type: 'purchase' as const,
        saleType: 'wholesale' as const,
        customerName: supplierName.trim(),
        customerPhone: supplierPhone.trim(),
        invoiceDate,
        items: items.map((it) => ({
          productId: it.productId,
          productName: it.productName,
          quantity: it.quantity,
          unit: it.unit,
          secondaryQuantity: it.hasDualUnit ? it.secondaryQuantity : undefined,
          secondaryUnit: it.hasDualUnit ? 'کیلوگرم' : undefined,
          unitPrice: it.unitBuyPrice,
          totalPrice: it.totalPrice,
          weightKg: it.hasDualUnit ? it.secondaryQuantity : 0,
          received: it.received !== false,
        })),
        totalAmount: subtotal,
        discount: discountNum,
        finalAmount,
        totalWeightKg,
        paymentMethod,
        notes: notes.trim(),
        shippingPayer: freightNum > 0 ? ('me' as const) : ('none' as const),
        shippingCost: freightNum,
      };

      const res = await invoicesService.create(invoiceData);
      showNotification({
        title: 'فاکتور خرید ثبت شد',
        message: `فاکتور خرید ${res.invoiceNumber} ثبت و موجودی انبار به‌روزرسانی شد.`,
        type: 'success',
      });
      onInvoiceCreated(res);
      onClose();
    } catch (err: any) {
      const msg = err.response?.data?.message || 'خطا در ثبت فاکتور خرید';
      showNotification({
        title: 'خطا در ثبت',
        message: Array.isArray(msg) ? msg.join(' - ') : msg,
        type: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <IonModal isOpen={isOpen} onDidDismiss={onClose} className="new-purchase-modal">
      <IonHeader className="ion-no-border">
        <IonToolbar className="bg-white/95 backdrop-blur-md px-3 py-2 border-b border-sky-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <PackagePlus className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-800">ثبت فاکتور خرید جدید</h2>
                <span className="text-[10px] text-slate-400">ورود کالا به انبار با قابلیت تبدیل دو واحدی</span>
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
        <div className="p-3 space-y-3 max-w-lg mx-auto pb-6">
          {/* Supplier Info */}
          <div className="bg-white rounded-2xl p-3 border border-sky-100 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <Building className="w-4 h-4 text-emerald-600" />
                <span>مشخصات تامین‌کننده و تاریخ</span>
              </div>
              <button
                type="button"
                onClick={() => setIsDateModalOpen(true)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-sky-50 text-sky-700 text-[11px] font-medium border border-sky-200"
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>{formatJalali(invoiceDate)}</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[11px] font-medium text-slate-600 mb-1 block">
                  نام تامین‌کننده / کارخانه *
                </label>
                <input
                  type="text"
                  placeholder="مثال: شرکت پتروشیمی آریا"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  className="w-full h-10 px-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs focus:outline-none focus:border-emerald-500 transition"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-600 mb-1 block">
                  شماره تماس تامین‌کننده
                </label>
                <input
                  type="tel"
                  dir="ltr"
                  placeholder="0912..."
                  value={supplierPhone}
                  onChange={(e) => setSupplierPhone(e.target.value)}
                  className="w-full h-10 px-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-left focus:outline-none focus:border-emerald-500 transition"
                />
              </div>
            </div>
            {suppliers.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {suppliers.map((s) => (
                  <button
                    key={s.name}
                    type="button"
                    onClick={() => {
                      setSupplierName(s.name);
                      if (s.phone) setSupplierPhone(s.phone);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition ${
                      supplierName.trim() === s.name ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700'
                    }`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Add Item Box */}
          <div className="bg-white rounded-2xl p-3 border border-sky-100 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-xs font-semibold text-slate-700">افزودن کالا به فاکتور خرید</span>
              <span className="text-[10px] text-emerald-700 font-medium bg-emerald-50 px-2 py-0.5 rounded-lg flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                <span>تبدیل آنی بسته و کیلوگرم</span>
              </span>
            </div>

            {/* Product selection */}
            <div className="space-y-2">
              <label className="text-[11px] font-medium text-slate-600 mb-1 block">
                انتخاب از کالاهای موجود یا نام دلخواه:
              </label>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={productQuery}
                  onChange={(e) => setProductQuery(e.target.value)}
                  placeholder="جستجوی کالا…"
                  className="w-full h-10 pr-10 pl-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs focus:outline-none focus:border-emerald-500 transition"
                />
              </div>
              <select
                value={selectedProductId}
                onChange={(e) => handleProductSelect(e.target.value)}
                className="w-full h-10 px-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs focus:outline-none focus:border-emerald-500 transition"
              >
                <option value="">-- انتخاب از لیست کالاهای انبار --</option>
                {products.filter((p) => !productQuery.trim() || p.name.toLowerCase().includes(productQuery.trim().toLowerCase())).map((p) => {
                  const ratio = p.unitRatio || p.weightPerUnitKg || 1;
                  const units = Math.round((p.stock || 0) * 100) / 100;
                  const kg = Math.round((p.stock || 0) * ratio * 100) / 100;
                  return (
                    <option key={p._id} value={p._id}>
                      {p.name} (موجودی: {units.toLocaleString('fa-IR')} {p.unit}
                      {ratio !== 1 ? ` — ${kg.toLocaleString('fa-IR')} کیلو` : ''})
                    </option>
                  );
                })}
              </select>
              {loadError && (
                <button
                  type="button"
                  onClick={loadProducts}
                  className="mt-1.5 w-full text-[11px] text-rose-700 bg-rose-50 border border-rose-100 rounded-xl py-1.5"
                >
                  لیست کالاهای انبار دریافت نشد (ارتباط با سرور) — تلاش دوباره
                </button>
              )}
            </div>

            {!selectedProductId && (
              <div>
                <input
                  type="text"
                  placeholder="نام کالای جدید در صورت نبود در لیست..."
                  value={customProductName}
                  onChange={(e) => setCustomProductName(e.target.value)}
                  className="w-full h-10 px-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs focus:outline-none focus:border-emerald-500 transition"
                />
              </div>
            )}

            {/* Dual Unit Toggle */}
            <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-2.5 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs text-emerald-900 font-medium">
                <Scale className="w-4 h-4 text-emerald-600" />
                <span>محاسبه دو واحدی (بسته + کیلوگرم با ضریب تبدیل)</span>
              </div>
              <input
                type="checkbox"
                checked={itemHasDual}
                onChange={(e) => setItemHasDual(e.target.checked)}
                className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
              />
            </div>

            {/* Quantities & Conversion */}
            {itemHasDual ? (
              <div className="space-y-2.5 bg-slate-50 p-3 rounded-2xl border border-slate-200/80">
                <div className="grid grid-cols-3 gap-2 text-right">
                  <div>
                    <label className="text-[10px] font-medium text-slate-600 block mb-1">
                      تعداد واحد اصلی ({itemUnit})
                    </label>
                    <input
                      type="number"
                      min="0.1"
                      step="any"
                      value={itemQuantity}
                      onChange={(e) => handleQuantityChange(e.target.value)}
                      className="w-full h-9 px-2 text-center rounded-xl bg-white border border-slate-200 text-xs font-semibold focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-medium text-slate-600 block mb-1">
                      ضریب (هر {itemUnit} چند کیلو؟)
                    </label>
                    <input
                      type="number"
                      min="0.01"
                      step="any"
                      value={itemRatio}
                      onChange={(e) => handleRatioChange(e.target.value)}
                      className="w-full h-9 px-2 text-center rounded-xl bg-white border border-slate-200 text-xs font-semibold focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-medium text-emerald-800 block mb-1">
                      مجموع به کیلوگرم
                    </label>
                    <input
                      type="number"
                      min="0.1"
                      step="any"
                      value={itemSecondaryQty}
                      onChange={(e) => handleSecondaryQtyChange(e.target.value)}
                      className="w-full h-9 px-2 text-center rounded-xl bg-emerald-50 border border-emerald-300 text-xs font-bold text-emerald-800 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="text-[10px] text-slate-500 flex items-center justify-between pt-1">
                  <span>
                    💡 ورود هر یک از مقادیر بسته یا کیلوگرم، دیگری را خودکار محاسبه می‌کند.
                  </span>
                </div>
              </div>
            ) : (
              <div>
                <label className="text-[11px] font-medium text-slate-600 mb-1 block">تعداد ({itemUnit})</label>
                <input
                  type="number"
                  min="1"
                  value={itemQuantity}
                  onChange={(e) => setItemQuantity(e.target.value)}
                  className="w-full h-10 px-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-semibold focus:outline-none focus:border-emerald-500"
                />
              </div>
            )}

            {/* Price and Add button */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <label className="text-[11px] font-medium text-slate-600 mb-1 block">
                  قیمت خرید هر {itemUnit} (تومان)
                </label>
                <MoneyTextInput
                  value={itemBuyPrice}
                  onChange={setItemBuyPrice}
                  className="w-full h-10 px-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-bold focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="w-full h-10 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-medium text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20 transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>افزودن به اقلام</span>
                </button>
              </div>
            </div>
          </div>

          {/* Items List */}
          {items.length > 0 && (
            <div className="bg-white rounded-2xl p-3 border border-sky-100 shadow-sm space-y-2.5">
              <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                <span className="text-xs font-semibold text-slate-700">
                  اقلام فاکتور خرید ({items.length.toLocaleString('fa-IR')} قلم)
                </span>
                <span className="text-[10px] text-slate-400">
                  {items.filter((it) => it.received === false).length
                    ? `${items.filter((it) => it.received === false).length.toLocaleString('fa-IR')} قلم هنوز نرسیده`
                    : 'همه تحویل شده'}
                </span>
              </div>

              <div className="divide-y divide-slate-100">
                {items.map((it, idx) => (
                  <div key={idx} className="py-2.5 flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-semibold text-slate-800">{it.productName}</h4>
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                        <span>
                          {it.quantity} {it.unit}
                        </span>
                        {it.hasDualUnit && (
                          <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded font-medium">
                            {it.secondaryQuantity} کیلوگرم
                          </span>
                        )}
                        <span>فی: {formatToman(it.unitBuyPrice)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setItems((prev) => prev.map((row, i) => (i === idx ? { ...row, received: !row.received } : row)))}
                        className={`text-[10px] font-bold px-2 py-1 rounded-lg border whitespace-nowrap ${
                          it.received ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200'
                        }`}
                      >
                        {it.received ? 'تحویل شد' : 'تحویل نشده'}
                      </button>
                      <span className="text-xs font-bold text-slate-800">
                        {formatToman(it.totalPrice)}
                      </span>
                      <button
                        onClick={() => handleRemoveItem(idx)}
                        className="p-1 rounded-lg text-rose-500 hover:bg-rose-50 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Payment & Totals */}
          <div className="bg-white rounded-2xl p-3 border border-sky-100 shadow-sm space-y-3">
            <div className="flex items-center justify-between text-xs font-medium text-slate-600">
              <span>مجموع اقلام:</span>
              <span>{formatToman(subtotal)}</span>
            </div>

            {totalWeightKg > 0 && (
              <div className="flex items-center justify-between text-xs font-medium text-emerald-800 bg-emerald-50 p-2 rounded-xl">
                <span>مجموع تناژ فاکتور خرید:</span>
                <span className="font-bold">
                  {tons(totalWeightKg)} تن ({totalWeightKg.toLocaleString('fa-IR')} کیلوگرم)
                </span>
              </div>
            )}

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-600 font-medium">تخفیف تامین‌کننده (تومان):</span>
              <MoneyTextInput
                value={discount}
                onChange={setDiscount}
                className="w-32 h-8 px-2 text-center rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex items-center justify-between text-sm font-bold text-slate-800 pt-2 border-t border-slate-100">
              <span>مبلغ نهایی قابل پرداخت:</span>
              <span className="text-emerald-700 text-base">{formatToman(finalAmount)}</span>
            </div>

            <div className="rounded-2xl border border-sky-100 bg-sky-50/50 p-2.5 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-700 font-medium flex items-center gap-1">
                  <Truck className="w-3.5 h-3.5 text-sky-600" /> کرایه حمل و تخلیه (پرداختی شما):
                </span>
                <MoneyTextInput
                  value={freight}
                  onChange={setFreight}
                  className="w-32 h-8 px-2 text-center rounded-xl bg-white border border-slate-200 text-xs font-semibold focus:outline-none focus:border-sky-500"
                />
              </div>
              <p className="text-[10px] text-slate-500 leading-5">
                جزو بدهی تامین‌کننده نیست. به نسبت وزن روی بهای تمام‌شده هر کیلو سرشکن می‌شود و در هزینه‌ها (بدون کسر دوباره از سود) ثبت می‌شود.
              </p>
              {items.length > 0 && totalWeightKg > 0 && (freightNum > 0 || discountNum > 0) && (
                <div className="space-y-1 pt-1 border-t border-sky-100">
                  {items
                    .filter((it) => it.hasDualUnit && it.secondaryQuantity > 0)
                    .map((it, idx) => {
                      const pricePerKg = (it.totalPrice * discountFactor) / it.secondaryQuantity;
                      return (
                        <div key={idx} className="flex items-center justify-between text-[10px] text-slate-600">
                          <span className="truncate">{it.productName}</span>
                          <span className="font-mono shrink-0">
                            {Math.round(pricePerKg).toLocaleString('fa-IR')}
                            {freightPerKg > 0 && ` + ${Math.round(freightPerKg).toLocaleString('fa-IR')}`} ={' '}
                            <b className="text-sky-800">{Math.round(pricePerKg + freightPerKg).toLocaleString('fa-IR')}</b> هر کیلو
                          </span>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            {/* Payment Method */}
            <div className="pt-2">
              <label className="text-[11px] font-medium text-slate-600 mb-1.5 block">
                روش پرداخت به تامین‌کننده:
              </label>
              <div className="grid grid-cols-4 gap-1.5 text-xs">
                {[
                  { id: 'pos', label: 'پوز / کارت' },
                  { id: 'transfer', label: 'حواله پایا' },
                  { id: 'cheque', label: 'چک صیادی' },
                  { id: 'credit', label: 'نسیه' },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setPaymentMethod(m.id as any)}
                    className={`py-2 px-1 rounded-xl text-center font-medium transition ${
                      paymentMethod === m.id
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="text-[11px] font-medium text-slate-600 mb-1 block">توضیحات و شماره بارنامه:</label>
              <textarea
                rows={2}
                placeholder="توضیحات اختیاری، نام راننده یا شماره بارنامه..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full p-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs focus:outline-none focus:border-emerald-500 transition"
              />
            </div>

            {/* Submit Button */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || items.length === 0}
              className="w-full h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:opacity-50 text-white font-medium text-xs shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2 transition"
            >
              <Save className="w-4 h-4" />
              <span>ثبت فاکتور خرید و ورود به انبار</span>
            </button>
          </div>
        </div>

        <LoadingOverlay isOpen={submitting || loading} message="در حال پردازش فاکتور خرید..." />

        <InvoiceDateModal
          isOpen={isDateModalOpen}
          currentDate={invoiceDate}
          onClose={() => setIsDateModalOpen(false)}
          onSelectDate={(newDate) => setInvoiceDate(newDate)}
        />
      </IonContent>
    </IonModal>
  );
};
