import React, { useEffect, useMemo, useState } from 'react';
import { Trash2, Plus, Minus } from 'lucide-react';
import { Sheet } from '../ui/Sheet';
import { AmountInput } from '../ui/AmountInput';
import { JalaliDateField } from '../ui/JalaliDatePicker';
import { dateToYmd } from '../../lib/jalali';
import { suppliersService, type SupplierListItem } from '../../services/suppliers.service';
import { invoicesService, apiErrorMessage } from '../../services/invoices.service';
import type { Invoice, CreateInvoiceInput } from '../../services/invoices.service';
import { productsService } from '../../services/products.service';
import type { Product } from '../../services/products.service';
import { useNotification } from '../../context/NotificationContext';
import { useSettings } from '../../services/settings.service';
import { AccountPicker, defaultAccountId } from '../ui/AccountPicker';
import { formatToman, parseDecimal } from '../../lib/format';

interface Row {
  productId: string;
  productName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  secondaryUnit?: string;
  ratio: number; // secondary units per primary unit (e.g. kg per package)
  /** Locked to the alternate sale unit (kilo or a custom unit). */
  lockAlt: boolean;
  altLabel: string;
  qtyBy: 'unit' | 'kg';
  priceBy: 'unit' | 'kg';
  qtyText?: string;
  received: boolean;
  factoryUnitCost: number;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

const saleAlt = (p?: Product | null) => {
  const sellBy = p?.sellBy || 'stock';
  const kgRatio = p?.weightPerUnitKg || (p?.hasDualUnit ? p.unitRatio || 0 : 0);
  if (sellBy === 'kg') return { lock: true, ratio: kgRatio || 1, label: 'کیلوگرم' };
  if (sellBy === 'other' && (p?.salePerStock || 0) > 0) return { lock: true, ratio: p!.salePerStock!, label: p?.saleUnit || 'واحد' };
  return { lock: false, ratio: kgRatio, label: 'کیلوگرم' };
};

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
  const [fromCompany, setFromCompany] = useState(false);
  const [supplierName, setSupplierName] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [suppliers, setSuppliers] = useState<SupplierListItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [saving, setSaving] = useState(false);
  const [accountId, setAccountId] = useState('');
  const settings = useSettings();
  const { bankCards } = settings;

  useEffect(() => {
    if (!invoice) return;
    setAccountId(invoice.depositAccounts?.pos || invoice.depositAccounts?.transfer || defaultAccountId(bankCards));
    setRows(
      invoice.items.map((it) => {
        const ratio = it.quantity ? (it.secondaryQuantity || it.weightKg || 0) / it.quantity : 0;
        return {
          productId: it.productId,
          productName: it.productName,
          unit: it.unit,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          secondaryUnit: it.secondaryUnit,
          ratio,
          lockAlt: false,
          altLabel: 'کیلوگرم',
          qtyBy: 'unit' as const,
          priceBy: 'unit' as const,
          received: it.received !== false,
          factoryUnitCost: it.factoryUnitCost || 0,
        };
      }),
    );
    setDate(dateToYmd(new Date(invoice.invoiceDate || invoice.createdAt)));
    setDiscount(invoice.discount || 0);
    setFreight(invoice.type === 'purchase' && invoice.shippingPayer === 'me' ? invoice.shippingCost || 0 : 0);
    setNotes(invoice.notes || '');
    setFromCompany(invoice.type === 'sale' && invoice.fulfillment === 'factory');
    setSupplierName(invoice.type === 'purchase' ? invoice.customerName || '' : '');
    setSupplierPhone(invoice.type === 'purchase' ? invoice.customerPhone || '' : '');
    if (invoice.type === 'purchase') suppliersService.list().then(setSuppliers).catch(() => undefined);
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

  useEffect(() => {
    if (!products.length || invoice?.type === 'purchase') return;
    setRows((prev) =>
      prev.map((r) => {
        const p = products.find((x) => x._id === r.productId);
        const alt = saleAlt(p);
        const ratio = alt.ratio || r.ratio;
        if (!p && r.ratio > 0) return r;
        return {
          ...r,
          ratio,
          secondaryUnit: alt.lock ? alt.label : p?.secondaryUnit || r.secondaryUnit || 'کیلوگرم',
          lockAlt: alt.lock,
          altLabel: alt.label,
          qtyBy: alt.lock ? 'kg' : r.qtyBy,
          priceBy: alt.lock ? 'kg' : r.priceBy,
          factoryUnitCost: r.factoryUnitCost > 0 ? r.factoryUnitCost : invoice?.fulfillment === 'factory' ? p?.buyPrice || 0 : r.factoryUnitCost,
        };
      }),
    );
  }, [products]);

  const total = useMemo(() => rows.reduce((s, r) => s + Math.round(r.quantity * r.unitPrice), 0), [rows]);
  const finalAmount = Math.max(0, total - discount);

  if (!invoice) return null;
  const isSale = invoice.type === 'sale';
  const canCredit = isSale && !!invoice.customerId;
  const isCard = isSale && payMode === 'transfer';

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
    const alt = saleAlt(p);
    const ratio = alt.ratio;
    const byAlt = alt.lock && ratio > 0;
    setRows((prev) => [
      ...prev,
      {
        productId: p._id,
        productName: p.name,
        unit: p.unit,
        quantity: byAlt ? 1 / ratio : 1,
        unitPrice: price || 0,
        secondaryUnit: byAlt ? alt.label : p.secondaryUnit || (ratio ? 'کیلوگرم' : undefined),
        ratio,
        lockAlt: alt.lock,
        altLabel: alt.label,
        qtyBy: byAlt ? 'kg' : 'unit',
        priceBy: byAlt ? 'kg' : 'unit',
        qtyText: byAlt ? '1' : undefined,
        received: true,
        factoryUnitCost: p.buyPrice || 0,
      },
    ]);
  };

  const shownQty = (r: Row) => (r.qtyBy === 'kg' && r.ratio > 0 ? r3(r.quantity * r.ratio) : r.quantity);
  const shownPrice = (r: Row) => (r.priceBy === 'kg' && r.ratio > 0 ? Math.round(r.unitPrice / r.ratio) : r.unitPrice);
  const setQtyText = (i: number, r: Row, raw: string) => {
    const n = parseDecimal(raw);
    updateRow(i, { qtyText: raw, quantity: r.qtyBy === 'kg' && r.ratio > 0 ? n / r.ratio : n });
  };
  const setQty = (i: number, r: Row, typed: number) =>
    updateRow(i, { qtyText: undefined, quantity: r.qtyBy === 'kg' && r.ratio > 0 ? typed / r.ratio : typed });
  const setPrice = (i: number, r: Row, typed: number) =>
    updateRow(i, { unitPrice: r.priceBy === 'kg' && r.ratio > 0 ? Math.round(typed * r.ratio) : typed });
  const canWeigh = (r: Row) => r.ratio > 0 && r.ratio !== 1;

  const save = async () => {
    if (!isSale && !supplierName.trim()) {
      showNotification({ title: 'تأمین‌کننده', message: 'نام تأمین‌کننده را وارد کنید.', type: 'warning' });
      return;
    }
    if (rows.length === 0 || rows.some((r) => r.quantity <= 0)) {
      showNotification({ title: 'اقلام نامعتبر', message: 'حداقل یک قلم با مقدار بیشتر از صفر لازم است.', type: 'warning' });
      return;
    }
    if (isCard && bankCards.length > 0 && !accountId) {
      showNotification({ title: 'حساب واریز', message: 'مشخص کنید پول به کدام حساب واریز شده.', type: 'warning' });
      return;
    }
    const parsedDate = new Date(`${date}T12:00:00`);
    if (!date || Number.isNaN(parsedDate.getTime())) {
      showNotification({ title: 'تاریخ نامعتبر', message: 'تاریخ فاکتور را دوباره انتخاب کنید.', type: 'warning' });
      return;
    }
    const payload: CreateInvoiceInput = {
      type: invoice.type,
      saleType: invoice.saleType,
      customerId: invoice.customerId,
      customerName: isSale ? invoice.customerName : supplierName.trim(),
      customerPhone: isSale ? invoice.customerPhone : supplierPhone.trim(),
      invoiceDate: parsedDate.toISOString(),
      fulfillment: isSale ? (fromCompany ? 'factory' : 'shop') : invoice.fulfillment || 'shop',
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
          ...(isSale && fromCompany ? { factoryUnitCost: Math.round(r.factoryUnitCost || 0) } : {}),
          ...(isSale ? {} : { received: r.received !== false }),
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
      {!isSale && (
        <div className="space-y-2">
          <label className="text-[11px] text-slate-500 block">تأمین‌کننده</label>
          <input
            type="text"
            value={supplierName}
            onChange={(e) => setSupplierName(e.target.value)}
            placeholder="نام شرکت یا کارخانه"
            className="w-full h-10 px-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs focus:outline-none focus:border-emerald-500"
          />
          <input
            type="tel"
            dir="ltr"
            value={supplierPhone}
            onChange={(e) => setSupplierPhone(e.target.value)}
            placeholder="شماره تماس"
            className="w-full h-10 px-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-left focus:outline-none focus:border-emerald-500"
          />
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
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${
                    supplierName.trim() === s.name ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700'
                  }`}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="border border-slate-100 rounded-2xl p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-800">{r.productName}</span>
              {!isSale && (
                <button
                  type="button"
                  onClick={() => updateRow(i, { received: !r.received })}
                  className={`text-[10px] font-bold px-2 py-1 rounded-lg border ${
                    r.received ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200'
                  }`}
                >
                  {r.received ? 'تحویل شد' : 'تحویل نشده'}
                </button>
              )}
              <button onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))} className="p-1 text-slate-300 hover:text-rose-600">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            {r.lockAlt && canWeigh(r) && (
              <p className="text-[10px] text-amber-700">این کالا فقط با {r.altLabel} فروخته می‌شود.</p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-slate-400">
                    {r.qtyBy === 'kg' ? (r.lockAlt ? r.altLabel : 'وزن (کیلوگرم)') : `تعداد (${r.unit})`}
                  </span>
                  {canWeigh(r) && !r.lockAlt && (
                    <button
                      type="button"
                      onClick={() => updateRow(i, { qtyBy: r.qtyBy === 'kg' ? 'unit' : 'kg', qtyText: undefined })}
                      className="text-[10px] font-bold text-sky-700"
                    >
                      {r.qtyBy === 'kg' ? r.unit : r.altLabel}
                    </button>
                  )}
                </div>
                <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setQty(i, r, Math.max(0, shownQty(r) - 1))}
                    className="px-2.5 py-2 text-slate-500"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={r.qtyText ?? (shownQty(r) ? String(shownQty(r)) : '')}
                    onChange={(e) => setQtyText(i, r, e.target.value)}
                    className="w-full text-center font-mono text-sm font-bold py-2 focus:outline-none"
                  />
                  <button onClick={() => setQty(i, r, shownQty(r) + 1)} className="px-2.5 py-2 text-slate-500">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
                {canWeigh(r) && (
                  <span className="text-[10px] text-slate-400 mt-1 block font-mono">
                    {r.qtyBy === 'kg'
                      ? `معادل ${r3(r.quantity).toLocaleString('fa-IR')} ${r.unit}`
                      : `معادل ${r3(r.quantity * r.ratio).toLocaleString('fa-IR')} ${r.altLabel}`}
                  </span>
                )}
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-slate-400">فی ({r.priceBy === 'kg' ? `هر ${r.altLabel}` : `هر ${r.unit}`})</span>
                  {canWeigh(r) && !r.lockAlt && (
                    <button
                      type="button"
                      onClick={() => updateRow(i, { priceBy: r.priceBy === 'kg' ? 'unit' : 'kg' })}
                      className="text-[10px] font-bold text-sky-700"
                    >
                      {r.priceBy === 'kg' ? r.unit : r.altLabel}
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  value={shownPrice(r) ? shownPrice(r).toLocaleString('fa-IR') : ''}
                  onChange={(e) =>
                    setPrice(
                      i,
                      r,
                      parseInt(
                        e.target.value.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[^0-9]/g, ''),
                        10,
                      ) || 0,
                    )
                  }
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 font-mono text-sm font-bold focus:outline-none focus:border-sky-500"
                />
                <span className="text-[10px] text-slate-700 mt-1 block font-mono font-bold">
                  جمع: {formatToman(Math.round(r.quantity * r.unitPrice))}
                </span>
              </div>
            </div>
            {isSale && fromCompany && (
              <div>
                <span className="text-[10px] text-amber-700 block mb-1">قیمت کارخانه (هر {r.unit}) — روی فاکتور مشتری نمی‌آید</span>
                <AmountInput value={r.factoryUnitCost || 0} onChange={(v) => updateRow(i, { factoryUnitCost: v })} />
              </div>
            )}
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

      {isSale && (settings.factorySalesEnabled || fromCompany) && (
        <div className="space-y-2">
          <label className="text-[11px] text-slate-500 block">این بار از کجا رفته</label>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => setFromCompany(false)}
              className={`py-2 rounded-xl text-[11px] font-bold border ${!fromCompany ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-slate-600 border-slate-200'}`}
            >
              از موجودی آریو
            </button>
            <button
              type="button"
              disabled={!settings.factorySalesEnabled && !fromCompany}
              onClick={() => {
                setFromCompany(true);
                setRows((prev) =>
                  prev.map((r) =>
                    r.factoryUnitCost > 0
                      ? r
                      : { ...r, factoryUnitCost: products.find((p) => p._id === r.productId)?.buyPrice || 0 },
                  ),
                );
              }}
              className={`py-2 rounded-xl text-[11px] font-bold border disabled:opacity-40 ${fromCompany ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-slate-600 border-slate-200'}`}
            >
              از کارخانه
            </button>
          </div>
          <p className="text-[10px] text-slate-400 leading-5">
            {fromCompany
              ? 'از موجودی آریو کم نمی‌شود. قیمت کارخانه بدهی شرکت مادر است و سود فاکتور با آن، مخفی، حساب می‌شود.'
              : 'از انبار آریو کم می‌شود. اگر بار مستقیم از کارخانه رفته، «از کارخانه» را بزنید.'}
          </p>
        </div>
      )}
      {!isSale && invoice.factorySaleId && (
        <p className="text-[11px] text-amber-800 leading-5 bg-amber-50 border border-amber-200 rounded-2xl px-3 py-2">
          این خریدِ شرکت مادر برای یک فروش مستقیم از کارخانه است و به موجودی آریو اضافه نمی‌شود. مقدار کالا از فاکتور مشتری می‌آید؛ قیمت را اینجا عوض کنید تا سود همان فاکتور به‌روز شود.
        </p>
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
              <label className="text-[11px] text-slate-600 block">فقط پول گرفته‌شده همان روز فاکتور</label>
              <p className="text-[10px] text-slate-400 leading-4">پرداخت‌های بعدی را اینجا ننویسید؛ همان‌ها در گردش حساب همین فاکتور می‌مانند و یک بار از بدهی کم می‌شوند.</p>
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
