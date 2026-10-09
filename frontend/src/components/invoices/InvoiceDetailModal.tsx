import React, { useEffect, useState } from 'react';
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
  Calendar,
  User,
  Scale,
  CheckCircle2,
  Clock,
  Building,
  Pencil,
  Trash2,
  Wallet,
  Flame,
  Truck,
} from 'lucide-react';
import { useSettings } from '../../services/settings.service';
import type { Invoice } from '../../services/invoices.service';
import { useNotification } from '../../context/NotificationContext';
import { EditInvoiceSheet } from './EditInvoiceSheet';
import { DeleteInvoiceSheet } from './DeleteInvoiceSheet';
import { InvoicePaymentSheet } from './InvoicePaymentSheet';
import { InvoiceProfitCard } from './InvoiceProfitCard';
import { PurchasePriceSheet } from '../pricing/PurchasePriceSheet';
import { accountTitle } from '../ui/AccountPicker';
import { customersService } from '../../services/customers.service';
import { invoiceSms, openSms } from '../../lib/sms';
import { formatToman, tons } from '../../lib/format';

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
  const { showNotification } = useNotification();
  const settings = useSettings();
  const [invoice, setInvoice] = useState<Invoice | null>(invoiceProp);
  const [sheet, setSheet] = useState<'edit' | 'delete' | 'pay' | 'price' | null>(null);

  useEffect(() => {
    setInvoice(invoiceProp);
    setSheet(null);
  }, [invoiceProp]);

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
    const balance = isSale && invoice.customerId
      ? await customersService.getCustomer(invoice.customerId).then((c) => c.balance).catch(() => undefined)
      : undefined;
    const text = invoiceSms(invoice, settings, balance);
    showNotification({
      title: 'متن فاکتور کپی شد',
      message: 'متن فاکتور در کلیپ‌بورد کپی شد و پیامک گوشی باز می‌شود.',
      type: 'success',
    });
    await openSms(invoice.customerPhone, text);
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

      <IonContent className="bg-slate-50">
        <div className="p-3 space-y-3 max-w-md mx-auto pb-6 print:p-0 print:m-0">
          {invoice.fulfillment === 'factory' && (
            <div className="rounded-2xl bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-900 leading-5">
              این فاکتور از کارخانه ارسال شده است. از موجودی دفتر کم نشده و در سود و موجودی انبار دفتر حساب نمی‌شود.
            </div>
          )}
          {isSale && invoice.remainingDebt > 0 && invoice.dueDate && (
            <div className={`rounded-2xl px-3 py-2 text-[11px] leading-5 border ${new Date(invoice.dueDate).getTime() < Date.now() ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
              سررسید {new Date(invoice.dueDate).toLocaleDateString('fa-IR')}
              {new Date(invoice.dueDate).getTime() < Date.now() ? ' — تاخیر در پرداخت' : ''}
              {(invoice.creditApplied || 0) > 0 ? ` · بستانکاری قبلی ${formatToman(invoice.creditApplied || 0)} روی همین فاکتور اعمال شده` : ''}
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
          <div className="bg-white rounded-2xl p-4 border border-sky-100 shadow-sm space-y-3 text-right">
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
                {invoice.proformaNumber && (
                  <span className="text-[9px] text-amber-700 block mt-1" dir="ltr">
                    {invoice.proformaNumber}
                  </span>
                )}
              </div>
            </div>

            {/* Customer & Date Info */}
            <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50/70 p-3 rounded-2xl border border-slate-100">
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-slate-400 text-[11px]">
                  <User className="w-3.5 h-3.5" />
                  <span>{isSale ? 'خریدار:' : 'تأمین‌کننده:'}</span>
                </div>
                <span className="font-semibold text-slate-800 block">{invoice.customerName}</span>
                {invoice.customerPhone && (
                  <span className="text-[11px] text-slate-500 font-mono block" dir="ltr">
                    {invoice.customerPhone}
                  </span>
                )}
              </div>

              <div className="space-y-1 text-left">
                <div className="flex items-center justify-end gap-1 text-slate-400 text-[11px]">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>تاریخ فاکتور:</span>
                </div>
                <span className="font-medium text-slate-700 block">{invoiceDateString}</span>
                <span className="text-[10px] text-slate-400 block">ثبت: {invoice.createdByName}</span>
              </div>
            </div>

            {/* Line Items Table (ریز اقلام) */}
            <div className="space-y-2">
              <span className="text-xs font-medium text-slate-700 block">ریز اقلام فاکتور:</span>
              <div className="divide-y divide-slate-100 border border-slate-100 rounded-2xl overflow-hidden">
                {invoice.items.map((item, index) => (
                  <div key={index} className="p-3 bg-white space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-800">
                        {index + 1}. {item.productName}
                      </span>
                      <span className="text-xs font-semibold text-slate-900 font-mono">
                        {formatToman(item.totalPrice)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>
                        مقدار: {item.quantity} {item.unit}
                        {item.secondaryQuantity ? ` (${item.secondaryQuantity} ${item.secondaryUnit})` : ''}
                      </span>
                      <span>فی: {formatToman(item.unitPrice)}</span>
                    </div>
                  </div>
                ))}
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
