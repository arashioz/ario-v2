import React, { useCallback, useEffect, useState } from 'react';
import { IonPage, IonContent, IonRefresher, IonRefresherContent } from '@ionic/react';
import type { RefresherEventDetail } from '@ionic/react';
import { ClipboardList, Truck } from 'lucide-react';
import { proformasService, PROFORMA_STATUS_LABELS, type Proforma, type ProformaStatus } from '../services/proformas.service';
import { SHIPPING_PAYER_LABELS, type Invoice } from '../services/invoices.service';
import { SALE_TYPE_LABELS } from '../services/settings.service';
import { Empty, ReportHeader, Segments } from '../components/reports/ReportUI';
import { ProformaSheet } from '../components/proformas/ProformaSheet';
import { InvoiceDetailModal } from '../components/invoices/InvoiceDetailModal';
import { invoicesService } from '../services/invoices.service';
import { formatJalaliIso } from '../lib/jalali';
import { formatToman, num, weight } from '../lib/format';

export const ProformasPage: React.FC = () => {
  const [status, setStatus] = useState<ProformaStatus>('pending');
  const [list, setList] = useState<Proforma[] | null>(null);
  const [selected, setSelected] = useState<Proforma | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setError('');
      setList(await proformasService.list(status));
    } catch {
      setError('دریافت پیش‌فاکتورها ناموفق بود');
    }
  }, [status]);

  useEffect(() => {
    setList(null);
    load();
  }, [load]);

  const refresh = async (e: CustomEvent<RefresherEventDetail>) => {
    await load();
    e.detail.complete();
  };

  const openInvoice = async (id?: string) => {
    if (id) setInvoice(await invoicesService.getById(id));
  };

  const pendingTotal = status === 'pending' ? (list ?? []).reduce((s, p) => s + p.finalAmount, 0) : 0;
  const pendingKg = status === 'pending' ? (list ?? []).reduce((s, p) => s + p.totalWeightKg, 0) : 0;

  return (
    <IonPage>
      <ReportHeader title="پیش‌فاکتورها" subtitle="سفارش‌های عمده و سوپرمارکت تا زمان ارسال بار" />
      <IonContent fullscreen className="bg-slate-50">
        <IonRefresher slot="fixed" onIonRefresh={refresh}>
          <IonRefresherContent />
        </IonRefresher>
        <div className="p-3 space-y-3 max-w-md mx-auto pb-8">
          <Segments<ProformaStatus>
            value={status}
            onChange={setStatus}
            items={[
              ['pending', 'در انتظار ارسال'],
              ['shipped', 'ارسال‌شده'],
              ['cancelled', 'لغو شده'],
            ]}
          />

          {status === 'pending' && list && list.length > 0 && (
            <div className="rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white p-3 shadow-md">
              <div className="flex items-center gap-2 text-[11px] text-amber-100">
                <Truck className="w-4 h-4" /> بار در انتظار ارسال
              </div>
              <div className="text-xl font-extrabold font-mono mt-1">{formatToman(pendingTotal)}</div>
              <div className="text-[11px] text-amber-100 mt-1">
                {num(list.length)} پیش‌فاکتور · {weight(pendingKg)}
              </div>
            </div>
          )}

          {error && <Empty>{error}</Empty>}
          {!list && !error && <Empty>در حال دریافت…</Empty>}
          {list && list.length === 0 && (
            <Empty>
              <ClipboardList className="w-8 h-8 mx-auto text-slate-300 mb-2" />
              {status === 'pending' ? 'پیش‌فاکتوری در انتظار ارسال نیست.' : `پیش‌فاکتور «${PROFORMA_STATUS_LABELS[status]}» ندارید.`}
            </Empty>
          )}

          {list?.map((p) => (
            <button
              key={p._id}
              onClick={() => setSelected(p)}
              className="w-full bg-white rounded-2xl p-3 border border-slate-100 shadow-sm text-right active:scale-[0.99] transition space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[13px] font-bold text-slate-800 truncate">{p.customerName}</div>
                  <div className="text-[10px] text-slate-400 font-mono mt-0.5" dir="ltr">
                    {p.number}
                  </div>
                </div>
                <div className="text-left shrink-0">
                  <div className="text-[13px] font-mono font-extrabold text-slate-800">{formatToman(p.finalAmount)}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{formatJalaliIso(p.orderDate)}</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 text-[10px]">
                <span className="px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 font-bold">{SALE_TYPE_LABELS[p.saleType]}</span>
                <span className="px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 font-bold">{weight(p.totalWeightKg)}</span>
                <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{num(p.items.length)} قلم</span>
                {p.shippingPayer !== 'none' && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-bold">
                    ارسال {SHIPPING_PAYER_LABELS[p.shippingPayer]} · {formatToman(p.shippingCost)}
                  </span>
                )}
                {p.status === 'shipped' && p.invoiceNumber && (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      openInvoice(p.invoiceId);
                    }}
                    className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold"
                  >
                    فاکتور {p.invoiceNumber}
                  </span>
                )}
              </div>
              {p.status === 'pending' && (
                <div className="flex items-center justify-center gap-1.5 py-2 rounded-2xl bg-emerald-50 text-emerald-700 text-[11px] font-bold">
                  <Truck className="w-3.5 h-3.5" /> ارسال شد؟ برای ثبت نهایی بزنید
                </div>
              )}
            </button>
          ))}
        </div>

        <ProformaSheet
          proforma={selected}
          onClose={() => setSelected(null)}
          onChanged={(p) => {
            setSelected(p.status === 'pending' ? p : null);
            load();
          }}
          onShipped={(inv) => {
            setSelected(null);
            setInvoice(inv);
            load();
          }}
        />
        <InvoiceDetailModal isOpen={!!invoice} invoice={invoice} onClose={() => setInvoice(null)} />
      </IonContent>
    </IonPage>
  );
};
