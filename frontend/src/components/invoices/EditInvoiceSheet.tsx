import React, { useEffect, useMemo, useState } from 'react';
import { Trash2, Plus, Minus } from 'lucide-react';
import { Sheet } from '../ui/Sheet';
import { AmountInput } from '../ui/AmountInput';
import { JalaliDateField } from '../ui/JalaliDatePicker';
import { dateToYmd } from '../../lib/jalali';
import { invoicesService, apiErrorMessage } from '../../services/invoices.service';
import type { Invoice, CreateInvoiceInput } from '../../services/invoices.service';
import { productsService } from '../../services/products.service';
import type { Product } from '../../services/products.service';
import { useNotification } from '../../context/NotificationContext';
import { useSettings } from '../../services/settings.service';
import { AccountPicker, defaultAccountId } from '../ui/AccountPicker';
import { formatToman } from '../../lib/format';

interface Row {
  productId: string;
  productName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  secondaryUnit?: string;
  ratio: number; // secondary units per primary unit (e.g. kg per package)
}

type PayMode = 'pos' | 'cash' | 'transfer' | 'credit';

const PAY_LABELS: Record<PayMode, string> = {
  pos: 'کارتخوان',
  cash: 'نقد',
  transfer: 'کارت‌به‌کارت',
  credit: 'نسیه',
};

interface Props {
  invoice: Invoice | null;
  onClose: () => void;
  onSaved: (updated: Invoice) => void;
}

export const EditInvoiceSheet: React.FC<Props> = ({ invoice, onClose, onSaved }) => {
  const { showNotification } = useNotification();
  const [rows, setRows] = useState<Row[]>([]);
  const [date, setDate] = useState('');
  const [discount, setDiscount] = useState(0);
  const [freight, setFreight] = useState(0);
  const [notes, setNotes] = useState('');
  const [payMode, setPayMode] = useState<PayMode>('pos');
  const [upfront, setUpfront] = useState(0);
  const [products, setProducts] = useState<Product[]>([]);
  const [saving, setSaving] = useState(false);
  const [accountId, setAccountId] = useState('');
  const { bankCards } = useSettings();

  useEffect(() => {
    if (!invoice) return;
    setAccountId(invoice.depositAccounts?.pos || invoice.depositAccounts?.transfer || defaultAccountId(bankCards));
    setRows(
      invoice.items.map((it) => ({
        productId: it.productId,
        productName: it.productName,
        unit: it.unit,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        secondaryUnit: it.secondaryUnit,
        ratio: it.quantity ? (it.secondaryQuantity || it.weightKg || 0) / it.quantity : 0,
      })),
    );
    setDate(dateToYmd(new Date(invoice.invoiceDate || invoice.createdAt)));
    setDiscount(invoice.discount || 0);
    setFreight(invoice.type === 'purchase' && invoice.shippingPayer === 'me' ? invoice.shippingCost || 0 : 0);
    setNotes(invoice.notes || '');
    const credit = invoice.creditAmount ?? invoice.remainingDebt ?? 0;
    if (credit > 0 || invoice.paymentMethod === 'credit' || invoice.paymentMethod === 'split') {
      setPayMode('credit');
      setUpfront(Math.max(0, invoice.finalAmount - credit));
    } else {
      setPayMode((['pos', 'cash', 'transfer'].includes(invoice.paymentMethod) ? invoice.paymentMethod : 'pos') as PayMode);
      setUpfront(0);
    }
    productsService.getProducts().then(setProducts).catch(() => undefined);
  }, [invoice]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = useMemo(() => rows.reduce((s, r) => s + Math.round(r.quantity * r.unitPrice), 0), [rows]);
  const finalAmount = Math.max(0, total - discount);

  if (!invoice) return null;
  const isSale = invoice.type === 'sale';
  const canCredit = isSale && !!invoice.customerId;
  const isCard = isSale && (payMode === 'pos' || payMode === 'transfer');

  const updateRow = (i: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const addProduct = (id: string) => {
    const p = products.find((x) => x._id === id);
    if (!p) return;
    const price = !isSale
      ? p.buyPrice
      : invoice.saleType === 'wholesale'
      ? p.priceWholesale || p.sellPrice
      : invoice.saleType === 'supermarket'
      ? p.priceSupermarket || p.sellPrice
      : p.priceRetail || p.sellPrice;
    setRows((prev) => [
      ...prev,
      {
        productId: p._id,
        productName: p.name,
        unit: p.unit,
        quantity: 1,
        unitPrice: price || 0,
        secondaryUnit: p.secondaryUnit,
        ratio: p.unitRatio || p.weightPerUnitKg || 0,
      },
    ]);
  };

  const save = async () => {
    if (rows.length === 0 || rows.some((r) => r.quantity <= 0)) {
      showNotification({ title: 'اقلام نامعتبر', message: 'حداقل یک قلم با مقدار بیشتر از صفر لازم است.', type: 'warning' });
      return;
    }
    if (isCard && bankCards.length > 0 && !accountId) {
      showNotification({ title: 'حساب واریز', message: 'مشخص کنید پول به کدام حساب واریز شده.', type: 'warning' });
      return;
    }
    const payload: CreateInvoiceInput = {
      type: invoice.type,
      saleType: invoice.saleType,
      customerId: invoice.customerId,
      customerName: invoice.customerName,
      customerPhone: invoice.customerPhone,
      invoiceDate: new Date(date).toISOString(),
      items: rows.map((r) => {
        const secondary = r.ratio ? Math.round(r.quantity * r.ratio * 1000) / 1000 : undefined;
        return {
          productId: r.productId,
          productName: r.productName,
          unit: r.unit,
          quantity: r.quantity,
          unitPrice: r.unitPrice,
          totalPrice: Math.round(r.quantity * r.unitPrice),
          secondaryQuantity: secondary,
          secondaryUnit: r.secondaryUnit,
          weightKg: r.secondaryUnit === 'کیلوگرم' ? secondary : undefined,
        };
      }),
      totalAmount: total,
      discount,
      finalAmount,
      paymentMethod: isSale ? payMode : invoice.paymentMethod,
      paidAmount: payMode === 'credit' ? Math.min(upfront, finalAmount) : undefined,
      ...(isSale ? { depositAccounts: isCard ? { [payMode]: accountId } : {} } : {}),
      notes,
      ...(isSale ? {} : { shippingPayer: freight > 0 ? ('me' as const) : ('none' as const), shippingCost: freight }),
    };

    try {
      setSaving(true);
      const updated = await invoicesService.update(invoice._id, payload);
      showNotification({ title: 'ذخیره شد', message: `فاکتور ${invoice.invoiceNumber} ویرایش شد.`, type: 'success' });
      onSaved(updated);
    } catch (err) {
      showNotification({ title: 'ذخیره نشد', message: apiErrorMessage(err, 'خطا در ویرایش فاکتور'), type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={`ویرایش فاکتور ${isSale ? 'فروش' : 'خرید'}`}
      subtitle={`${invoice.invoiceNumber} — ${invoice.customerName}`}
      footer={
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <span className="text-[10px] text-slate-400 block">مبلغ نهایی</span>
            <span className="font-mono text-base font-bold text-slate-800">{finalAmount.toLocaleString('fa-IR')}</span>
            <span className="text-[10px] text-slate-400 mr-1">تومان</span>
          </div>
          <button
            onClick={save}
            disabled={saving}
            className="px-6 py-3 rounded-2xl bg-sky-600 text-white text-sm font-bold disabled:opacity-40 active:scale-[0.98] transition"
          >
            {saving ? 'در حال ذخیره…' : 'ذخیره تغییرات'}
          </button>
        </div>
      }
    >
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="border border-slate-100 rounded-2xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">{r.productName}</span>
              <button onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))} className="p-1 text-slate-300 hover:text-rose-600">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-[10px] text-slate-400 block mb-1">تعداد ({r.unit})</span>
                <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden">
                  <button onClick={() => updateRow(i, { quantity: Math.max(0, r.quantity - 1) })} className="px-2.5 py-2 text-slate-500">
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={r.quantity || ''}
                    onChange={(e) => updateRow(i, { quantity: parseFloat(e.target.value) || 0 })}
                    className="w-full text-center font-mono text-sm font-bold py-2 focus:outline-none"
                  />
                  <button onClick={() => updateRow(i, { quantity: r.quantity + 1 })} className="px-2.5 py-2 text-slate-500">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
                {r.ratio > 0 && (
                  <span className="text-[10px] text-slate-400 mt-1 block font-mono">
                    = {(Math.round(r.quantity * r.ratio * 10) / 10).toLocaleString('fa-IR')} {r.secondaryUnit || 'کیلوگرم'}
                  </span>
                )}
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block mb-1">فی (تومان)</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={r.unitPrice ? r.unitPrice.toLocaleString('fa-IR') : ''}
                  onChange={(e) =>
                    updateRow(i, {
                      unitPrice:
                        parseInt(
                          e.target.value.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[^0-9]/g, ''),
                          10,
                        ) || 0,
                    })
                  }
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 font-mono text-sm font-bold focus:outline-none focus:border-sky-500"
                />
                <span className="text-[10px] text-slate-500 mt-1 block font-mono">
                  جمع: {Math.round(r.quantity * r.unitPrice).toLocaleString('fa-IR')}
                </span>
              </div>
            </div>
          </div>
        ))}

        <select
          value=""
          onChange={(e) => addProduct(e.target.value)}
          className="w-full px-4 py-2.5 rounded-2xl border border-dashed border-sky-300 text-xs text-sky-700 bg-sky-50/40"
        >
          <option value="">+ افزودن کالا</option>
          {products.map((p) => (
            <option key={p._id} value={p._id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[11px] text-slate-500 block mb-1">تاریخ فاکتور</label>
          <JalaliDateField value={date} onChange={setDate} title="تاریخ فاکتور" />
        </div>
        <div>
          <label className="text-[11px] text-slate-500 block mb-1">تخفیف</label>
          <AmountInput value={discount} onChange={setDiscount} />
        </div>
      </div>

      {!isSale && (
        <div>
          <label className="text-[11px] text-slate-500 block mb-1">کرایه حمل و تخلیه (پرداختی شما، جزو بهای تمام‌شده کالا)</label>
          <AmountInput value={freight} onChange={setFreight} />
        </div>
      )}

      {isSale && (
        <div className="space-y-2">
          <label className="text-[11px] text-slate-500 block">نحوه پرداخت</label>
          <div className="grid grid-cols-4 gap-1.5">
            {(Object.keys(PAY_LABELS) as PayMode[])
              .filter((m) => m !== 'credit' || canCredit)
              .map((m) => (
                <button
                  key={m}
                  onClick={() => setPayMode(m)}
                  className={`py-2 rounded-xl text-[11px] font-bold border transition ${
                    payMode === m
                      ? m === 'credit'
                        ? 'bg-rose-600 text-white border-rose-600'
                        : 'bg-sky-600 text-white border-sky-600'
                      : 'bg-white text-slate-600 border-slate-200'
                  }`}
                >
                  {PAY_LABELS[m]}
                </button>
              ))}
          </div>
          {isCard && <AccountPicker value={accountId} onChange={setAccountId} />}
          {payMode === 'credit' && (
            <div className="bg-rose-50/60 rounded-2xl p-3 space-y-2">
              <label className="text-[11px] text-slate-600 block">پرداخت نقدی همان روز (پیش‌پرداخت)</label>
              <AmountInput value={upfront} onChange={setUpfront} />
              <div className="flex justify-between text-xs text-rose-700">
                <span>نسیه روی حساب مشتری</span>
                <span className="font-mono font-bold">{formatToman(Math.max(0, finalAmount - upfront))}</span>
              </div>
            </div>
          )}
        </div>
      )}

      <textarea
        rows={2}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="یادداشت"
        className="w-full px-4 py-2.5 rounded-2xl border border-slate-200 text-xs focus:outline-none focus:border-sky-500"
      />
    </Sheet>
  );
};
