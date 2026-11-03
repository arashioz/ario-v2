import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IonModal,
  IonHeader,
  IonToolbar,
  IonContent,
} from '@ionic/react';
import {
  X,
  FileText,
  MessageSquare,
  Printer,
  Copy,
  MessageCircle,
  Calendar,
  User,
  Scale,
  CheckCircle2,
  Clock,
  Building,
  Factory,
  Pencil,
  Trash2,
  Wallet,
  Flame,
  Truck,
} from 'lucide-react';
import { useSettings } from '../../services/settings.service';
import { invoicesService, type Invoice } from '../../services/invoices.service';
import { useNotification } from '../../context/NotificationContext';
import { EditInvoiceSheet } from './EditInvoiceSheet';
import { DeleteInvoiceSheet } from './DeleteInvoiceSheet';
import { InvoicePaymentSheet } from './InvoicePaymentSheet';
import { InvoiceProfitCard } from './InvoiceProfitCard';
import { PurchasePriceSheet } from '../pricing/PurchasePriceSheet';
import { accountTitle } from '../ui/AccountPicker';
import { customersService, PAYMENT_METHOD_LABELS } from '../../services/customers.service';
import { invoiceSms, openSms, whatsappUrl } from '../../lib/sms';
import { copyText } from '../../lib/permissions';
import { formatToman, num, tons } from '../../lib/format';
import { dateToYmd, formatJalali } from '../../lib/jalali';
import { JalaliDateSheet } from '../ui/JalaliDatePicker';

const personOf = (invoice: Invoice) => {
  if (invoice.type !== 'purchase' || invoice.fulfillment !== 'factory') return invoice.customerName;
  if (invoice.endCustomerName) return invoice.endCustomerName;
  const named = String(invoice.notes || '').match(/برای\s+([^،.]+)/)?.[1]?.trim() || '';
  return named && !named.startsWith('فاکتور') ? named : invoice.customerName;
};

interface InvoiceDetailModalProps {
  isOpen: boolean;
  invoice: Invoice | null;
  onClose: () => void;
  /** Called after edit/payment (with the updated invoice) or delete (with null). */
  onChanged?: (updated: Invoice | null) => void;
}

export const InvoiceDetailModal: React.FC<InvoiceDetailModalProps> = ({
  isOpen,
  invoice: invoiceProp,
  onClose,
  onChanged,
}) => {
  const navigate = useNavigate();
  const { showNotification } = useNotification();
  const settings = useSettings();
  const [invoice, setInvoice] = useState<Invoice | null>(invoiceProp);
  const [sheet, setSheet] = useState<'edit' | 'delete' | 'pay' | 'price' | null>(null);
  const [payments, setPayments] = useState<{ id: string; amount: number; date: string; method?: string }[]>([]);
  const [showFactoryCost, setShowFactoryCost] = useState(false);
  const [dateKind, setDateKind] = useState<'proforma' | 'registered' | 'ship' | 'paid' | null>(null);

  useEffect(() => {
    setInvoice(invoiceProp);
    setSheet(null);
  }, [invoiceProp]);

  useEffect(() => {
    if (!invoiceProp?._id) return;
    if (!invoiceProp?.customerId || invoiceProp.type !== 'sale') {
      setPayments([]);
      return;
    }
    customersService
      .getCustomerTransactions(invoiceProp.customerId)
      .then((txs) => {
        const rows: { id: string; amount: number; date: string; method?: string }[] = [];
        for (const tx of txs) {
          if (tx.type !== 'payment') continue;
          for (const a of tx.allocations || []) {
            if (a.invoiceId === invoiceProp._id) {
              rows.push({ id: `${tx._id}-${a.invoiceId}`, amount: a.amount, date: tx.date, method: tx.paymentMethod });
            }
          }
        }
        setPayments(rows);
      })
      .catch(() => setPayments([]));
  }, [invoiceProp]);

  const saveDate = async (ymd: string) => {
    if (!invoice || !dateKind) return;
    const patch =
      dateKind === 'proforma' ? { proformaDate: ymd }
      : dateKind === 'registered' ? { registeredAt: ymd }
      : dateKind === 'ship' ? { shippedAt: ymd }
      : { paidAt: ymd };
    try {
      const updated = await invoicesService.setDates(invoice._id, patch);
      setInvoice(updated);
      onChanged?.(updated);
    } catch {
      showNotification({ title: 'تاریخ ذخیره نشد', message: 'دوباره تلاش کنید.', type: 'error' });
    } finally {
      setDateKind(null);
    }
  };

  if (!invoice) return null;

  const isSale = invoice.type === 'sale';

  const handleUpdated = (updated: Invoice) => {
    setInvoice(updated);
    setSheet(null);
    onChanged?.(updated);
  };

  const saleTypeLabel =
    invoice.saleType === 'wholesale'
      ? 'عمده بنکداری'
      : invoice.saleType === 'supermarket'
      ? 'سوپرمارکت'
      : 'تک‌فروشی';

  const paymentMethodLabel = (method: string) => {
    switch (method) {
      case 'pos':
        return 'کارتخوان (POS)';
      case 'cash':
        return 'نقدی';
      case 'transfer':
        return 'کارت‌به‌کارت / حواله';
      case 'cheque':
        return 'چک صیادی';
      case 'credit':
        return 'نسیه / دفتری';
      case 'split':
        return 'پرداخت ترکیبی';
      default:
        return method;
    }
  };

  const invoiceDateString = new Date(invoice.invoiceDate || invoice.createdAt).toLocaleDateString(
    'fa-IR',
    { year: 'numeric', month: 'long', day: 'numeric' },
  );

  const handleCopyAndSms = async () => {
    const text = await invoiceText();
    showNotification({
      title: 'متن فاکتور کپی شد',
      message: 'متن فاکتور در کلیپ‌بورد کپی شد و پیامک گوشی باز می‌شود.',
      type: 'success',
    });
    await openSms(invoice.customerPhone, text);
  };

  /** Full invoice text (same template as SMS). Balance is fetched for sales so the text is accurate. */
  const invoiceText = async () => {
    const balance = isSale && invoice.customerId
      ? await customersService.getCustomer(invoice.customerId).then((c) => c.balance).catch(() => undefined)
      : undefined;
    return invoiceSms(invoice, settings, balance);
  };

  const handleCopyText = async () => {
    const text = await invoiceText();
    const ok = await copyText(text);
    showNotification(
      ok
        ? { title: 'فاکتور کپی شد', message: 'متن فاکتور در کلیپ‌بورد است.', type: 'success' }
        : { title: 'کپی انجام نشد', message: 'دسترسی کپی را در تنظیمات مرورگر یا گوشی اجازه دهید.', type: 'error' },
    );
  };

  const handleWhatsApp = async () => {
    const text = await invoiceText();
    window.open(whatsappUrl(invoice.customerPhone, text), '_blank', 'noopener');
  };

  const deposits = (['pos', 'transfer'] as const)
    .filter((m) => invoice.depositAccounts?.[m])
    .map((m) => ({ method: m, title: accountTitle(settings.bankCards, invoice.depositAccounts?.[m]) }));

  const handlePrint = () => {
    window.print();
  };

  return (
    <IonModal isOpen={isOpen} onDidDismiss={onClose} className="invoice-detail-modal">
      <IonHeader className="ion-no-border">
        <IonToolbar className="bg-white/95 backdrop-blur-md px-3 py-2 border-b border-sky-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center">
                <FileText className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-800">ریز فاکتور {isSale ? 'فروش' : 'خرید'}</h2>
                <span className="text-[10px] text-slate-400 font-mono block" dir="ltr">
                  {invoice.invoiceNumber}
                </span>
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

      <IonContent className={invoice.fulfillment === 'factory' ? 'bg-[#fbf7f0]' : 'bg-slate-50'}>
        <div className={`p-3 space-y-3 max-w-md mx-auto pb-6 print:p-0 print:m-0 print:max-w-none ${invoice.fulfillment === 'factory' ? 'bg-[#fbf7f0]' : ''}`}>
          {invoice.fulfillment === 'factory' && (
            <div className="flex items-center justify-between gap-2 print:hidden">
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-900/80">
                <Factory className="w-3.5 h-3.5" />
                کارخانه
              </span>
              {isSale && (
                <button type="button" onClick={() => setShowFactoryCost((v) => !v)} className="text-[10px] font-bold text-slate-500 underline underline-offset-2">
                  {showFactoryCost ? 'بستن قیمت کارخانه' : 'قیمت خرید و فروش'}
                </button>
              )}
            </div>
          )}
          {isSale && payments.length > 0 && (
            <div className="rounded-2xl bg-white border border-emerald-100 px-3 py-2 space-y-1.5">
              <span className="text-[11px] font-bold text-emerald-800">پرداخت‌های همین فاکتور</span>
              {payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between text-[11px] text-slate-700">
                  <span>
                    {new Date(p.date).toLocaleDateString('fa-IR')}
                    {p.method ? ` · ${PAYMENT_METHOD_LABELS[p.method as keyof typeof PAYMENT_METHOD_LABELS] || ''}` : ''}
                  </span>
                  <span className="font-mono font-bold text-emerald-700">{formatToman(p.amount)}</span>
                </div>
              ))}
            </div>
          )}
          {isSale && (invoice.creditSurplus || 0) > 0 && (
            <div className="rounded-2xl bg-sky-50 border border-sky-200 px-3 py-2 text-[11px] text-sky-900 leading-5">
              بستانکاری همین فاکتور {formatToman(invoice.creditSurplus || 0)} است و روی بدهی فاکتورهای دیگر اعمال نمی‌شود.
            </div>
          )}
          {isSale && invoice.remainingDebt > 0 && invoice.dueDate && (
            <div className={`rounded-2xl px-3 py-2 text-[11px] leading-5 border ${new Date(invoice.dueDate).getTime() < Date.now() ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
              سررسید {new Date(invoice.dueDate).toLocaleDateString('fa-IR')}
              {new Date(invoice.dueDate).getTime() < Date.now() ? ' — تاخیر در پرداخت' : ''}
            </div>
          )}
          {isSale && invoice.remainingDebt > 0 && (
            <button
              onClick={() => setSheet('pay')}
              className="w-full py-3 rounded-2xl bg-emerald-600 text-white text-sm font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition print:hidden"
            >
              <Wallet className="w-4 h-4" />
              ثبت پرداخت این فاکتور
              <span className="font-mono text-emerald-100 text-xs">
                (مانده {formatToman(invoice.remainingDebt)})
              </span>
            </button>
          )}

          <div className="grid grid-cols-2 gap-2 print:hidden">
            <button
              onClick={handleCopyText}
              className="py-2.5 rounded-2xl bg-white border border-slate-200 flex items-center justify-center gap-2 text-[11px] font-bold text-sky-700 active:scale-95 transition"
            >
              <Copy className="w-4 h-4" />
              کپی فاکتور
            </button>
            <button
              onClick={handleWhatsApp}
              className="py-2.5 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center gap-2 text-[11px] font-bold text-emerald-700 active:scale-95 transition"
            >
              <MessageCircle className="w-4 h-4" />
              ارسال در واتساپ
            </button>
          </div>

          <div className="grid grid-cols-4 gap-2 print:hidden">
            {[
              { label: 'ویرایش', icon: Pencil, onClick: () => setSheet('edit'), cls: 'text-sky-700' },
              { label: 'پیامک', icon: MessageSquare, onClick: handleCopyAndSms, cls: 'text-slate-700' },
              { label: 'چاپ', icon: Printer, onClick: handlePrint, cls: 'text-slate-700' },
              { label: 'حذف', icon: Trash2, onClick: () => setSheet('delete'), cls: 'text-rose-600' },
            ].map((a) => (
              <button
                key={a.label}
                onClick={a.onClick}
                className={`py-2.5 rounded-2xl bg-white border border-slate-200 flex flex-col items-center gap-1 text-[11px] font-bold active:scale-95 transition ${a.cls}`}
              >
                <a.icon className="w-4 h-4" />
                {a.label}
              </button>
            ))}
          </div>

          {/* Invoice Paper Card */}
          <div className="invoice-print-sheet bg-white rounded-2xl p-4 border border-sky-100 shadow-sm space-y-3 text-right">
            {/* Store & Invoice Header */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-1.5">
                  <Building className="w-4 h-4 text-sky-600" />
                  <span className="text-sm font-semibold text-slate-800">{settings.shopName || 'بنکداری و پخش آریو'}</span>
                </div>
                <span className="text-[10px] text-slate-400 block mt-0.5" dir={settings.shopPhone ? 'ltr' : undefined}>
                  {settings.shopPhone || 'سیستم فاکتور رسمی و فروشگاهی'}
                </span>
              </div>

              <div className="text-left">
                <span className="text-xs font-mono font-semibold text-sky-700 block" dir="ltr">
                  {invoice.invoiceNumber}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-50 text-sky-800 font-medium inline-block mt-0.5">
                  {saleTypeLabel}
                </span>
                {invoice.fulfillment === 'factory' && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100/90 text-amber-900 font-semibold mt-0.5 mr-1">
                    <Factory className="w-3 h-3" />
                    کارخانه
                  </span>
                )}
                {invoice.proformaNumber && (
                  <span className="text-[9px] text-amber-700 block mt-1" dir="ltr">
                    {invoice.proformaNumber}
                  </span>
                )}
              </div>
            </div>

            {/* Customer & Date Info */}
            <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50/70 p-3 rounded-2xl border border-slate-100">
              <button
                type="button"
                disabled={!isSale || !invoice.customerId}
                onClick={() => {
                  onClose();
                  navigate(`/tabs/customers?customerId=${encodeURIComponent(invoice.customerId!)}`);
                }}
                className="space-y-1 text-right rounded-xl enabled:hover:bg-sky-50 enabled:cursor-pointer disabled:opacity-100"
              >
                <div className="flex items-center gap-1 text-slate-400 text-[11px]">
                  <User className="w-3.5 h-3.5" />
                  <span>مشتری:</span>
                </div>
                <span className="font-semibold text-slate-800 block">{personOf(invoice)}</span>
                {invoice.branchName && <span className="text-[11px] text-sky-700 block">شعبه {invoice.branchName}</span>}
                {invoice.customerPhone && (
                  <span className="text-[11px] text-slate-500 font-mono block" dir="ltr">
                    {invoice.customerPhone}
                  </span>
                )}
                {isSale && invoice.customerId && <span className="block text-[10px] text-sky-600">مشاهده حساب مشتری ←</span>}
              </button>

              <div className="grid grid-cols-2 gap-2 text-left">
                <button type="button" onClick={() => setDateKind('proforma')} className="rounded-xl bg-slate-50 px-2 py-1.5">
                  <span className="flex items-center justify-end gap-1 text-slate-400 text-[10px]"><Calendar className="w-3 h-3" />پیش‌فاکتور</span>
                  <span className="font-medium text-slate-700 block text-[12px]">{invoice.proformaDate ? formatJalali(dateToYmd(new Date(invoice.proformaDate))) : invoiceDateString}</span>
                </button>
                <button type="button" onClick={() => setDateKind('registered')} className="rounded-xl bg-slate-50 px-2 py-1.5">
                  <span className="text-[10px] text-slate-400">ثبت</span>
                  <span className="font-medium text-slate-700 block text-[12px]">{formatJalali(dateToYmd(new Date(invoice.registeredAt || invoice.createdAt)))}</span>
                </button>
                <button type="button" onClick={() => setDateKind('ship')} className="rounded-xl bg-slate-50 px-2 py-1.5">
                  <span className="text-[10px] text-slate-400">ارسال</span>
                  <span className="font-medium text-slate-700 block text-[12px]">{invoice.shippedAt ? formatJalali(dateToYmd(new Date(invoice.shippedAt))) : '—'}</span>
                </button>
                <button type="button" onClick={() => setDateKind('paid')} className="rounded-xl bg-slate-50 px-2 py-1.5">
                  <span className="text-[10px] text-slate-400">پرداخت</span>
                  <span className="font-medium text-slate-700 block text-[12px]">{invoice.paidAt ? formatJalali(dateToYmd(new Date(invoice.paidAt))) : payments[0] ? formatJalali(dateToYmd(new Date(payments[0].date))) : '—'}</span>
                </button>
              </div>
            </div>

            {invoice.orderBundle && invoice.orderBundle.invoices.length > 1 && (
              <div className="rounded-2xl border border-violet-200 bg-violet-50/70 p-3 space-y-2 print:hidden">
                <div className="text-[11px] font-bold text-violet-900">سفارش ترکیبی — هر شرکت فاکتور جدا دارد</div>
                {invoice.orderBundle.invoices.map((part) => (
                  <div key={part.invoiceId} className="rounded-xl bg-white px-2.5 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-slate-800">{part.supplierCompany}</span>
                      <span className="text-[10px] font-mono text-slate-400" dir="ltr">{part.invoiceNumber}</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1 leading-5">
                      {part.items.map((it) => `${it.category ? `${it.category}: ` : ''}${it.productName} ×${num(it.quantity, 2)}`).join(' · ')}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Line Items Table (ریز اقلام) */}
            <div className="space-y-2">
              <span className="text-xs font-medium text-slate-700 block">ریز اقلام فاکتور:</span>
              <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                <table className="invoice-print-table w-full text-[11px]">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="text-right font-bold px-2 py-2">ردیف</th>
                      <th className="text-right font-bold px-2 py-2">کالا</th>
                      <th className="text-right font-bold px-2 py-2">مقدار</th>
                      <th className="text-right font-bold px-2 py-2">فی</th>
                      <th className="text-right font-bold px-2 py-2">وزن</th>
                      <th className="text-left font-bold px-2 py-2">مبلغ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.items.map((item, index) => {
                      const lineKg =
                        item.weightKg && item.weightKg > 0
                          ? item.weightKg
                          : item.secondaryUnit === 'کیلوگرم' && item.secondaryQuantity
                            ? item.secondaryQuantity
                            : item.unit === 'کیلوگرم'
                              ? item.quantity
                              : 0;
                      const perKg = lineKg > 0 ? Math.round(item.totalPrice / lineKg) : 0;
                      return (
                        <tr key={index} className="border-t border-slate-100">
                          <td className="px-2 py-2 font-mono text-slate-400">{num(index + 1)}</td>
                          <td className="px-2 py-2 font-bold text-slate-800">
                            {item.productName}
                            {!isSale && (
                              <span className={`mr-1 text-[9px] font-bold px-1 py-0.5 rounded ${item.received === false ? 'bg-amber-100 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>
                                {item.received === false ? 'نرسیده' : 'تحویل'}
                              </span>
                            )}
                            {perKg > 0 && item.unit !== 'کیلوگرم' && (
                              <div className="text-[10px] font-normal font-mono text-slate-400">کیلویی {formatToman(perKg)}</div>
                            )}
                          </td>
                          <td className="px-2 py-2 whitespace-nowrap">
                            {num(item.quantity, 2)} {item.unit}
                            {item.secondaryQuantity ? ` (${num(item.secondaryQuantity, 1)} ${item.secondaryUnit})` : ''}
                          </td>
                          <td className="px-2 py-2 font-mono whitespace-nowrap">
                            {formatToman(item.unitPrice)}
                            {showFactoryCost && (item.factoryUnitCost || 0) > 0 && (
                              <div className="text-[10px] font-normal text-amber-800">خرید {formatToman(item.factoryUnitCost || 0)}</div>
                            )}
                          </td>
                          <td className="px-2 py-2 font-mono whitespace-nowrap">{lineKg ? `${num(lineKg, 1)} کیلو` : '—'}</td>
                          <td className="px-2 py-2 font-mono font-bold text-left whitespace-nowrap">{formatToman(item.totalPrice)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Total Weight Tonnage & Summary */}
            <div className="p-3 rounded-2xl bg-sky-50/70 border border-sky-100 flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 text-sky-800 font-medium">
                <Scale className="w-4 h-4 text-sky-600" />
                <span>مجموع تناژ / وزن بار:</span>
              </div>
              <span className="font-semibold text-sky-900 font-mono">
                {invoice.totalWeightKg.toLocaleString('fa-IR')} کیلوگرم ({tons(invoice.totalWeightKg)} تن)
              </span>
            </div>

            {/* Price Calculations */}
            <div className="space-y-1.5 pt-2 border-t border-slate-100 text-xs">
              <div className="flex items-center justify-between text-slate-500">
                <span>جمع اقلام:</span>
                <span className="font-mono">{formatToman(invoice.totalAmount)}</span>
              </div>

              {invoice.discount > 0 && (
                <div className="flex items-center justify-between text-rose-600">
                  <span>تخفیف:</span>
                  <span className="font-mono">- {formatToman(invoice.discount)}</span>
                </div>
              )}

              {invoice.shippingPayer === 'customer' && invoice.shippingCost ? (
                <div className="flex items-center justify-between text-amber-700">
                  <span className="flex items-center gap-1"><Truck className="w-3.5 h-3.5" /> هزینه ارسال (با مشتری):</span>
                  <span className="font-mono">+ {formatToman(invoice.shippingCost)}</span>
                </div>
              ) : null}

              <div className="flex items-center justify-between text-sm font-semibold text-slate-900 pt-1 border-t border-slate-100">
                <span>مبلغ نهایی فاکتور:</span>
                <span className="font-mono text-sky-700">{formatToman(invoice.finalAmount)}</span>
              </div>

              {invoice.shippingPayer === 'me' && invoice.shippingCost ? (
                <div className="flex items-center justify-between text-[11px] text-slate-500 print:hidden">
                  <span className="flex items-center gap-1">
                    <Truck className="w-3.5 h-3.5" /> {isSale ? 'هزینه ارسال با من (در هزینه‌ها):' : 'کرایه حمل و تخلیه (در بهای تمام‌شده کالا):'}
                  </span>
                  <span className="font-mono">{formatToman(invoice.shippingCost)}</span>
                </div>
              ) : null}
            </div>

            {/* Payment Breakdown & Status */}
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-700">نحوه تسویه:</span>
                <span className="font-semibold text-sky-800">
                  {paymentMethodLabel(invoice.paymentMethod)}
                </span>
              </div>

              {invoice.paymentMethod === 'split' && invoice.splitDetails && (
                <div className="grid grid-cols-2 gap-2 pt-1 text-[11px] text-slate-600">
                  {invoice.splitDetails.pos ? <div>کارتخوان: {formatToman(invoice.splitDetails.pos)}</div> : null}
                  {invoice.splitDetails.cash ? <div>نقدی: {formatToman(invoice.splitDetails.cash)}</div> : null}
                  {invoice.splitDetails.transfer ? <div>حواله/پایا: {formatToman(invoice.splitDetails.transfer)}</div> : null}
                  {invoice.splitDetails.cheque ? <div>چک: {formatToman(invoice.splitDetails.cheque)}</div> : null}
                  {invoice.splitDetails.credit ? <div className="text-rose-600 font-medium">نسیه: {formatToman(invoice.splitDetails.credit)}</div> : null}
                </div>
              )}

              {deposits.map((d) => (
                <div key={d.method} className="flex items-center justify-between text-[11px] text-slate-600">
                  <span>{d.method === 'pos' ? 'کارتخوان' : 'کارت‌به‌کارت'} واریز به:</span>
                  <span className="font-bold text-sky-800">{d.title}</span>
                </div>
              ))}

              <div className="flex items-center justify-between pt-1 border-t border-slate-200">
                <span>وضعیت تسویه:</span>
                <span
                  className={`inline-flex items-center gap-1 font-semibold ${
                    invoice.isPaid ? 'text-emerald-600' : 'text-rose-600'
                  }`}
                >
                  {invoice.isPaid ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>تسویه کامل</span>
                    </>
                  ) : (
                    <>
                      <Clock className="w-3.5 h-3.5" />
                      <span>مانده نسیه: {formatToman(invoice.remainingDebt)}</span>
                    </>
                  )}
                </span>
              </div>
            </div>

            {invoice.notes && (
              <p className="text-[11px] text-slate-400 italic">یادداشت: {invoice.notes}</p>
            )}
            {isSale && settings.invoiceFooter && (
              <p className="text-[11px] text-slate-500 text-center border-t border-dashed border-slate-200 pt-3">{settings.invoiceFooter}</p>
            )}
          </div>
          {isSale && <InvoiceProfitCard invoiceId={invoice._id} version={invoice.updatedAt} />}
          {invoice.type === 'purchase' && (
            <button
              onClick={() => setSheet('price')}
              className="print:hidden w-full flex items-center gap-3 p-3 rounded-2xl bg-orange-50 border border-orange-200 text-right active:scale-[0.99] transition"
            >
              <div className="w-9 h-9 rounded-2xl bg-orange-500 text-white flex items-center justify-center shrink-0">
                <Flame className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-orange-900">تورم این خرید و قیمت فروش جدید</div>
                <div className="text-[10px] text-orange-700 mt-0.5">تغییر قیمت خرید، سود تورمی انبار و قیمت پیشنهادی با دکمه اعمال</div>
              </div>
            </button>
          )}
        </div>
      </IonContent>

      <EditInvoiceSheet invoice={sheet === 'edit' ? invoice : null} onClose={() => setSheet(null)} onSaved={handleUpdated} />
      <InvoicePaymentSheet invoice={sheet === 'pay' ? invoice : null} onClose={() => setSheet(null)} onPaid={handleUpdated} />
      <PurchasePriceSheet invoiceId={sheet === 'price' ? invoice._id : null} onClose={() => setSheet(null)} />
      <JalaliDateSheet
        open={!!dateKind}
        value={dateToYmd(new Date(
          dateKind === 'ship' ? invoice.shippedAt || invoice.invoiceDate
          : dateKind === 'paid' ? invoice.paidAt || payments[0]?.date || invoice.invoiceDate
          : dateKind === 'registered' ? invoice.registeredAt || invoice.createdAt
          : invoice.proformaDate || invoice.invoiceDate,
        ))}
        title={dateKind === 'ship' ? 'تاریخ ارسال' : dateKind === 'paid' ? 'تاریخ پرداخت' : dateKind === 'registered' ? 'تاریخ ثبت' : 'تاریخ پیش‌فاکتور'}
        onClose={() => setDateKind(null)}
        onSelect={(ymd) => void saveDate(ymd)}
      />
      <DeleteInvoiceSheet
        invoice={sheet === 'delete' ? invoice : null}
        onClose={() => setSheet(null)}
        onDeleted={() => {
          setSheet(null);
          onChanged?.(null);
          onClose();
        }}
      />
    </IonModal>
  );
};
