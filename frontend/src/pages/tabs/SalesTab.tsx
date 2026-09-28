import React, { useState } from 'react';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonContent,
} from '@ionic/react';
import { useNotification } from '../../context/NotificationContext';
import {
  Plus,
  FileText,
  Download,
  Share2,
  Calendar,
  CheckCircle,
  Clock,
} from 'lucide-react';

interface MockInvoice {
  id: string;
  invoiceNumber: string;
  type: 'sale' | 'purchase';
  partyName: string;
  amount: number;
  date: string;
  status: 'paid' | 'pending';
}

export const SalesTab: React.FC = () => {
  const { showNotification } = useNotification();
  const [activeTab, setActiveTab] = useState<'sale' | 'purchase'>('sale');

  const invoices: MockInvoice[] = [
    {
      id: '1',
      invoiceNumber: 'INV-1024',
      type: 'sale',
      partyName: 'فروشگاه پارس',
      amount: 14500000,
      date: '۱۴۰۳/۰۷/۰۵',
      status: 'pending',
    },
    {
      id: '2',
      invoiceNumber: 'INV-1023',
      type: 'sale',
      partyName: 'هایپرمارکت امید',
      amount: 8200000,
      date: '۱۴۰۳/۰۷/۰۵',
      status: 'paid',
    },
    {
      id: '3',
      invoiceNumber: 'PUR-501',
      type: 'purchase',
      partyName: 'شرکت پخش البرز (تأمین‌کننده)',
      amount: 45000000,
      date: '۱۴۰۳/۰۷/۰۴',
      status: 'paid',
    },
    {
      id: '4',
      invoiceNumber: 'INV-1022',
      type: 'sale',
      partyName: 'سوپرمارکت شقایق',
      amount: 3400000,
      date: '۱۴۰۳/۰۷/۰۳',
      status: 'paid',
    },
  ];

  const currentList = invoices.filter((inv) => inv.type === activeTab);

  const handleDownloadPdf = (inv: MockInvoice) => {
    showNotification({
      title: 'دانلود فایل فاکتور',
      message: `فایل PDF فاکتور ${inv.invoiceNumber} در مرحله بعدی فعال خواهد شد.`,
      type: 'info',
    });
  };

  const handleSendSms = (inv: MockInvoice) => {
    showNotification({
      title: 'ارسال پیامک فاکتور',
      message: `لینک فاکتور ${inv.invoiceNumber} به همراه جزئیات برای ${inv.partyName} پیامک شد.`,
      type: 'success',
    });
  };

  return (
    <IonPage>
      <IonHeader className="ion-no-border">
        <IonToolbar className="bg-white/80 backdrop-blur-md px-4 py-2 border-b border-sky-100">
          <div className="flex items-center justify-between">
            <h1 className="text-sm font-extrabold text-slate-800">مدیریت فاکتورها</h1>
            <button
              onClick={() =>
                showNotification({
                  title: 'ثبت فاکتور جدید',
                  message: 'فرم صدور فاکتور در مرحله بعدی توسعه داده خواهد شد.',
                  type: 'info',
                })
              }
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-sky-500 hover:bg-sky-600 text-white text-xs font-bold shadow-md shadow-sky-400/20 active:scale-95 transition"
            >
              <Plus className="w-4 h-4" />
              <span>فاکتور جدید</span>
            </button>
          </div>
        </IonToolbar>
      </IonHeader>

      <IonContent fullscreen className="bg-slate-50">
        <div className="p-3.5 space-y-4 max-w-md mx-auto pb-8">
          {/* Segment Selector */}
          <div className="grid grid-cols-2 p-1 bg-white rounded-2xl border border-sky-100 shadow-sm">
            <button
              onClick={() => setActiveTab('sale')}
              className={`py-2 text-xs font-bold rounded-xl transition ${
                activeTab === 'sale'
                  ? 'bg-sky-500 text-white shadow-sm shadow-sky-400/30'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              فاکتور فروش (مشتریان)
            </button>
            <button
              onClick={() => setActiveTab('purchase')}
              className={`py-2 text-xs font-bold rounded-xl transition ${
                activeTab === 'purchase'
                  ? 'bg-sky-500 text-white shadow-sm shadow-sky-400/30'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              فاکتور خرید (تأمین‌کنندگان)
            </button>
          </div>

          {/* Invoices List */}
          <div className="space-y-3">
            {currentList.map((inv) => (
              <div
                key={inv.id}
                className="bg-white rounded-2xl p-4 border border-sky-100 shadow-sm space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-sky-700">
                          {inv.invoiceNumber}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            inv.status === 'paid'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1'
                              : 'bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1'
                          }`}
                        >
                          {inv.status === 'paid' ? (
                            <>
                              <CheckCircle className="w-3 h-3" />
                              <span>پرداخت شده</span>
                            </>
                          ) : (
                            <>
                              <Clock className="w-3 h-3" />
                              <span>در انتظار تسویه</span>
                            </>
                          )}
                        </span>
                      </div>
                      <h4 className="text-xs font-bold text-slate-800 mt-1">{inv.partyName}</h4>
                    </div>
                  </div>

                  <div className="text-left">
                    <div className="text-sm font-black text-slate-800">
                      {inv.amount.toLocaleString('fa-IR')}
                    </div>
                    <span className="text-[10px] text-slate-400">تومان</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2.5 border-t border-slate-100 text-xs">
                  <div className="flex items-center gap-1 text-slate-400 text-[11px]">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{inv.date}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleSendSms(inv)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-sky-50 text-sky-700 hover:bg-sky-100 text-xs font-semibold transition"
                      title="ارسال فاکتور با SMS"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span>پیامک</span>
                    </button>
                    <button
                      onClick={() => handleDownloadPdf(inv)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-50 text-slate-700 hover:bg-slate-100 text-xs font-semibold transition border border-slate-200"
                      title="خروجی PDF"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>PDF</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </IonContent>
    </IonPage>
  );
};
