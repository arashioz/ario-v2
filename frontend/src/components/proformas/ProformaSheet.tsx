import React, { useEffect, useState } from 'react';
import { Ban, Check, Share2, Truck } from 'lucide-react';
import { Sheet } from '../ui/Sheet';
import { customersService } from '../../services/customers.service';
import { proformasService, PROFORMA_STATUS_LABELS, type Proforma } from '../../services/proformas.service';
import { apiErrorMessage, invoicesService, SHIPPING_PAYER_LABELS, type Invoice } from '../../services/invoices.service';
import { SALE_TYPE_LABELS } from '../../services/settings.service';
import { useNotification } from '../../context/NotificationContext';
import { formatJalaliIso as formatJalali } from '../../lib/jalali';
import { formatToman, num, weight } from '../../lib/format';
import {
  PaymentTermsForm,
  emptyTerms,
  termsError,
  termsFinal,
  termsFromSaved,
  termsPayload,
  type PaymentTerms,
} from '../pos/PaymentTermsForm';
import { useSettings } from '../../services/settings.service';
import { AmountInput } from '../ui/AmountInput';
import { openSms, proformaSms } from '../../lib/sms';

interface Props {
  proforma: Proforma | null;
  onClose: () => void;
  onChanged: (p: Proforma) => void;
  onShipped: (invoice: Invoice, p: Proforma) => void;
}

export const ProformaSheet: React.FC<Props> = ({ proforma, onClose, onChanged, onShipped }) => {
  const { showNotification } = useNotification();
  const settings = useSettings();
  const [terms, setTerms] = useState<PaymentTerms>(emptyTerms());
  const [busy, setBusy] = useState<'save' | 'ship' | 'cancel' | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [fromFactory, setFromFactory] = useState(false);
  const [branch, setBranch] = useState('');
  const [branches, setBranches] = useState<string[]>([]);
  const [prices, setPrices] = useState<Record<string, { unit: number; cost: number }>>({});

  useEffect(() => {
    if (proforma) {
      setTerms(termsFromSaved(proforma));
      setConfirmCancel(false);
      setFromFactory(proforma.fulfillment === 'factory');
      setBranch(proforma.branchName || '');
      setBranches([]);
      if (proforma.customerId && proforma.status === 'pending') {
        customersService
          .getCustomer(proforma.customerId)
          .then((c) => {
            const list = (c.branches || []).map((b) => b.trim()).filter(Boolean);
            setBranches(list);
            setBranch((current) => (list.length === 1 ? list[0] : list.includes(current) ? current : proforma.branchName || ''));
          })
          .catch(() => setBranches([]));
      }
      setPrices(
        Object.fromEntries(proforma.items.map((i) => [i.productId, { unit: i.unitPrice, cost: i.factoryUnitCost || 0 }])),
      );
    }
  }, [proforma]);

  if (!proforma) return null;
  const pending = proforma.status === 'pending';
  const factoryOn = !!settings.factorySalesEnabled || fromFactory;
  const goods = proforma.items.reduce((s, i) => s + Math.round(i.quantity * (prices[i.productId]?.unit ?? i.unitPrice)), 0);
  const final = termsFinal(pending ? goods : proforma.totalAmount, terms);
  const branchError = pending && branches.length > 0 && !branches.includes(branch) ? 'شعبه را انتخاب کنید' : '';
  const error = branchError || termsError(final, terms, true, settings.bankCards);

  const payload = () => ({
    ...termsPayload(final, terms),
    fulfillment: (fromFactory ? 'factory' : 'shop') as 'factory' | 'shop',
    branchName: branches.includes(branch) ? branch : proforma.branchName || '',
    items: proforma.items.map((i) => ({
      productId: i.productId,
      unitPrice: Math.round(prices[i.productId]?.unit ?? i.unitPrice),
      factoryUnitCost: Math.round(prices[i.productId]?.cost || 0),
    })),
  });

  const save = async () => {
    try {
      setBusy('save');
      const p = await proformasService.update(proforma._id, payload());
      showNotification({ title: 'ذخیره شد', message: `شرایط پیش‌فاکتور ${p.number} به‌روز شد.`, type: 'success' });
      onChanged(p);
    } catch (err) {
      showNotification({ title: 'خطا', message: apiErrorMessage(err, 'ذخیره انجام نشد'), type: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const ship = async () => {
    try {
      setBusy('ship');
      const { invoice, proforma: p } = await proformasService.ship(proforma._id, payload());
      showNotification({
        title: 'بار ارسال شد',
        message:
          fromFactory
            ? `پیش‌فاکتور ${p.number} به فاکتور ${invoice.invoiceNumber} تبدیل شد. از موجودی آریو کم نشد.`
            : `پیش‌فاکتور ${p.number} به فاکتور ${invoice.invoiceNumber} تبدیل و از انبار کسر شد.`,
        type: 'success',
      });
      onShipped(invoice, p);
    } catch (err) {
      showNotification({ title: 'ثبت نهایی انجام نشد', message: apiErrorMessage(err, 'خطا در ارسال'), type: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const cancel = async () => {
    try {
      setBusy('cancel');
      const p = await proformasService.cancel(proforma._id);
      showNotification({ title: 'لغو شد', message: `پیش‌فاکتور ${p.number} لغو شد.`, type: 'info' });
      onChanged(p);
    } catch (err) {
      showNotification({ title: 'خطا', message: apiErrorMessage(err, 'لغو انجام نشد'), type: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const share = async () => {
    const text = proformaSms(proforma, settings);
    showNotification({ title: 'متن پیش‌فاکتور کپی شد', message: 'برنامه پیامک گوشی باز می‌شود.', type: 'info' });
    await openSms(proforma.customerPhone, text);
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={`پیش‌فاکتور ${proforma.number}`}
      subtitle={`${proforma.customerName} · ${SALE_TYPE_LABELS[proforma.saleType]} · ${formatJalali(proforma.orderDate)}`}
      footer={
        pending ? (
          <div className="space-y-2">
            {error && <p className="text-[11px] text-rose-600 text-center">{error}</p>}
            <button
              onClick={ship}
              disabled={!!error || !!busy}
              className="w-full py-3.5 rounded-2xl bg-emerald-600 text-white text-sm font-bold disabled:opacity-40 flex items-center justify-center gap-2 active:scale-[0.98]"
            >
              <Truck className="w-4 h-4" />
              {busy === 'ship' ? 'در حال ثبت نهایی…' : `ارسال شد — ثبت نهایی (${formatToman(final)})`}
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={save} disabled={!!error || !!busy} className="py-2.5 rounded-2xl bg-slate-100 text-slate-700 text-xs font-bold disabled:opacity-40">
                {busy === 'save' ? '…' : 'ذخیره تغییرات'}
              </button>
              {confirmCancel ? (
                <button onClick={cancel} disabled={!!busy} className="py-2.5 rounded-2xl bg-rose-600 text-white text-xs font-bold">
                  {busy === 'cancel' ? '…' : 'بله، لغو شود'}
                </button>
              ) : (
                <button onClick={() => setConfirmCancel(true)} className="py-2.5 rounded-2xl bg-rose-50 text-rose-600 border border-rose-200 text-xs font-bold flex items-center justify-center gap-1">
                  <Ban className="w-3.5 h-3.5" /> لغو پیش‌فاکتور
                </button>
              )}
            </div>
          </div>
        ) : undefined
      }
    >
      <div className="flex items-center justify-between">
        <span
          className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
            pending ? 'bg-amber-100 text-amber-800' : proforma.status === 'shipped' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
          }`}
        >
          {PROFORMA_STATUS_LABELS[proforma.status]}
          {proforma.status === 'shipped' && proforma.invoiceNumber ? ` · ${proforma.invoiceNumber}` : ''}
        </span>
        <button onClick={share} className="text-[11px] font-bold text-sky-600 flex items-center gap-1">
          <Share2 className="w-3.5 h-3.5" /> پیامک به مشتری
        </button>
      </div>

      {(pending ? branches.length > 0 : !!proforma.branchName) && (
        <div className="space-y-1.5">
          <div className="text-[11px] font-bold text-slate-500">شعبه</div>
          {pending ? (
            <div className="flex flex-wrap gap-1.5">
              {branches.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setBranch(name)}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border ${branch === name ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-slate-600 border-slate-200'}`}
                >
                  {name}
                </button>
              ))}
            </div>
          ) : (
            <div className="text-xs font-bold text-slate-800">{proforma.branchName}</div>
          )}
        </div>
      )}
      {pending && factoryOn && (
        <button
          type="button"
          onClick={() => {
            if (!settings.factorySalesEnabled) return;
            if (fromFactory) {
              setFromFactory(false);
              return;
            }
            setFromFactory(true);
            if (!proforma) return;
            void invoicesService.lastPurchasePrices(proforma.items.map((i) => i.productId)).then((last) => {
              setPrices((prev) => {
                const next = { ...prev };
                for (const item of proforma.items) {
                  const current = next[item.productId]?.cost || 0;
                  const price = Math.round(last[item.productId] || 0);
                  if (current > 0 || price <= 0) continue;
                  next[item.productId] = { unit: next[item.productId]?.unit ?? item.unitPrice, cost: price };
                }
                return next;
              });
            });
          }}
          className={`w-full flex items-center justify-between rounded-2xl border px-3 py-2.5 ${fromFactory ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}
        >
          <span className="text-xs font-bold text-slate-800">ارسال از کارخانه</span>
          <span className={`w-5 h-5 rounded-md border flex items-center justify-center ${fromFactory ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white border-slate-300'}`}>
            {fromFactory && <Check className="w-3.5 h-3.5" />}
          </span>
        </button>
      )}
      {pending && fromFactory && (
        <p className="text-[10px] text-amber-800 leading-5 -mt-2">
          با ارسال، از موجودی آریو کم نمی‌شود. قیمت خرید از آخرین فاکتور خرید همین کالا آمده. اگر لازم است همین‌جا عوضش کنید.
        </p>
      )}

      <div className="rounded-2xl border border-slate-200 divide-y divide-slate-100">
        {proforma.items.map((i) => {
          const unit = prices[i.productId]?.unit ?? i.unitPrice;
          const cost = prices[i.productId]?.cost || 0;
          return (
            <div key={i.productId} className="px-3 py-2.5 text-xs space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="font-bold text-slate-800">{i.productName}</div>
                  <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                    {num(i.quantity, 2)} {i.unit}
                    {i.weightKg ? ` · ${weight(i.weightKg)}` : ''}
                  </div>
                </div>
                <span className="font-mono font-bold text-slate-700">{formatToman(Math.round(i.quantity * unit))}</span>
              </div>
              {pending ? (
                <>
                  <span className="text-[10px] text-slate-500 block">قیمت فروش هر {i.unit}</span>
                  <AmountInput
                    value={unit}
                    onChange={(v) => setPrices((prev) => ({ ...prev, [i.productId]: { unit: v, cost: prev[i.productId]?.cost || 0 } }))}
                  />
                  {fromFactory && (
                    <>
                      <span className="text-[10px] text-slate-500 block">قیمت کارخانه هر {i.unit}</span>
                      <AmountInput
                        value={cost}
                        onChange={(v) => setPrices((prev) => ({ ...prev, [i.productId]: { unit: prev[i.productId]?.unit ?? i.unitPrice, cost: v } }))}
                      />
                    </>
                  )}
                </>
              ) : (
                <div className="text-[10px] text-slate-400 font-mono">{formatToman(i.unitPrice)} هر {i.unit}</div>
              )}
            </div>
          );
        })}
        <div className="flex items-center justify-between px-3 py-2.5 text-xs bg-slate-50">
          <span className="text-slate-500">جمع اقلام · {weight(proforma.totalWeightKg)}</span>
          <span className="font-mono font-bold text-slate-800">{formatToman(pending ? goods : proforma.totalAmount)}</span>
        </div>
      </div>

      {pending ? (
        <PaymentTermsForm
          terms={terms}
          onChange={(patch) => setTerms((t) => ({ ...t, ...patch }))}
          subtotal={goods}
          showShipping
          hasCustomer
        />
      ) : (
        <div className="rounded-2xl bg-slate-50 p-3 text-xs space-y-1.5">
          <div className="flex justify-between">
            <span className="text-slate-500">هزینه ارسال</span>
            <span>
              {SHIPPING_PAYER_LABELS[proforma.shippingPayer]}
              {proforma.shippingCost ? ` · ${formatToman(proforma.shippingCost)}` : ''}
            </span>
          </div>
          <div className="flex justify-between font-bold">
            <span>مبلغ نهایی</span>
            <span className="font-mono">{formatToman(proforma.finalAmount)}</span>
          </div>
          {proforma.shippedAt && (
            <div className="flex justify-between text-slate-500">
              <span>تاریخ ارسال</span>
              <span>{formatJalali(proforma.shippedAt)}</span>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
};
