import React, { useState } from 'react';
import {
  IonModal,
  IonHeader,
  IonToolbar,
  IonContent,
} from '@ionic/react';
import {
  X,
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  ArrowRightLeft,
  Clock,
  Trash2,
  FileText,
} from 'lucide-react';
import { chequesService } from '../../services/cheques.service';
import type { Cheque } from '../../services/cheques.service';
import { useNotification } from '../../context/NotificationContext';
import { LoadingOverlay } from '../LoadingOverlay';
import { formatToman } from '../../lib/format';

interface ChequeDetailModalProps {
  isOpen: boolean;
  cheque: Cheque | null;
  onClose: () => void;
  onChequeUpdated: (updated: Cheque) => void;
  onChequeDeleted: (id: string) => void;
}

export const ChequeDetailModal: React.FC<ChequeDetailModalProps> = ({
  isOpen,
  cheque,
  onClose,
  onChequeUpdated,
  onChequeDeleted,
}) => {
  const { showNotification } = useNotification();
  const [loading, setLoading] = useState(false);
  const [statusNotes, setStatusNotes] = useState('');

  if (!cheque) return null;

  const getDaysRemaining = (dueDateIso: string) => {
    const due = new Date(dueDateIso).getTime();
    const today = new Date().setHours(0, 0, 0, 0);
    const diff = Math.ceil((due - today) / (1000 * 3600 * 24));
    return diff;
  };

  const daysLeft = getDaysRemaining(cheque.dueDate);

  const handleUpdateStatus = async (
    newStatus: 'pending' | 'passed' | 'bounced' | 'endorsed',
  ) => {
    try {
      setLoading(true);
      const updated = await chequesService.updateStatus(cheque._id, {
        status: newStatus,
        statusDate: new Date().toISOString(),
        statusNotes: statusNotes.trim() || undefined,
      });

      const statusLabels = {
        passed: 'وصول و پاس شد',
        bounced: 'برگشت خورد',
        endorsed: 'خرج شد و انتقال یافت',
        pending: 'به حالت در جریان بازگشت',
      };

      showNotification({
        title: 'وضعیت چک به‌روزرسانی شد',
        message: `چک به وضعیت «${statusLabels[newStatus]}» تغییر یافت.`,
        type: newStatus === 'passed' ? 'success' : newStatus === 'bounced' ? 'error' : 'info',
      });

      onChequeUpdated(updated);
      setStatusNotes('');
    } catch (err: any) {
      showNotification({
        title: 'خطا در تغییر وضعیت',
        message: 'امکان به‌روزرسانی وضعیت وجود ندارد.',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('آیا از حذف این چک صیادی مطمئن هستید؟')) return;

    try {
      setLoading(true);
      await chequesService.delete(cheque._id);
      showNotification({
        title: 'حذف چک',
        message: 'چک با موفقیت حذف شد.',
        type: 'info',
      });
      onChequeDeleted(cheque._id);
      onClose();
    } catch {
      showNotification({
        title: 'خطا در حذف',
        message: 'امکان حذف چک وجود ندارد.',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <IonModal isOpen={isOpen} onDidDismiss={onClose} className="cheque-detail-modal">
      <IonHeader className="ion-no-border">
        <IonToolbar className="bg-white/95 backdrop-blur-md px-3 py-2 border-b border-sky-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                  cheque.type === 'received'
                    ? 'bg-purple-100 text-purple-700'
                    : 'bg-amber-100 text-amber-700'
                }`}
              >
                <CreditCard className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-800">
                  {cheque.type === 'received' ? 'چک صیادی دریافتی' : 'چک صیادی پرداختی'}
                </h2>
                <span className="text-[10px] text-slate-400 font-mono" dir="ltr">
                  سریال: {cheque.chequeNumber}
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
        <div className="p-3 space-y-3 max-w-lg mx-auto pb-6">
          {/* Due Alert Badge */}
          {cheque.status === 'pending' && (
            <div
              className={`p-3 rounded-2xl flex items-center justify-between text-xs font-semibold ${
                daysLeft < 0
                  ? 'bg-rose-50 border border-rose-200 text-rose-800'
                  : daysLeft <= 3
                  ? 'bg-amber-50 border border-amber-200 text-amber-800'
                  : 'bg-sky-50 border border-sky-200 text-sky-800'
              }`}
            >
              <div className="flex items-center gap-1.5">
                {daysLeft <= 3 ? (
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                ) : (
                  <Clock className="w-4 h-4 text-sky-600" />
                )}
                <span>
                  {daysLeft < 0
                    ? `⚠️ سررسید گذشته (${Math.abs(daysLeft)} روز پیش)`
                    : daysLeft === 0
                    ? '⚡ موعد سررسید امروز است!'
                    : `⏳ ${daysLeft} روز تا سررسید چک باقی مانده است.`}
                </span>
              </div>
            </div>
          )}

          {/* Cheque Paper Visual Card */}
          <div className="bg-gradient-to-br from-white to-slate-50 rounded-2xl p-4 border border-purple-200/60 shadow-md space-y-3 text-right relative overflow-hidden">
            <div className="absolute top-0 right-0 left-0 h-1.5 bg-gradient-to-r from-purple-500 via-indigo-500 to-sky-500" />

            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div>
                <span className="text-xs text-slate-400 font-medium block">بانک صادرکننده:</span>
                <span className="text-base font-bold text-slate-800">
                  بانک {cheque.bankName} {cheque.branchName ? `(شعبه ${cheque.branchName})` : ''}
                </span>
              </div>

              <div className="text-left">
                <span className="text-[10px] text-slate-400 block">مبلغ چک:</span>
                <span className="text-lg font-bold font-mono text-purple-700 block">
                  {formatToman(cheque.amount)}
                </span>
              </div>
            </div>

            {/* Sayad 16-digit ID */}
            {cheque.sayadNumber && (
              <div className="bg-purple-50/80 p-2.5 rounded-2xl border border-purple-200 flex items-center justify-between text-xs">
                <span className="text-purple-800 font-medium">شناسه ۱۶ رقمی صیادی:</span>
                <span className="font-mono font-bold text-purple-900 tracking-wider" dir="ltr">
                  {cheque.sayadNumber}
                </span>
              </div>
            )}

            {/* Details Grid */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-white p-2.5 rounded-2xl border border-slate-100">
                <span className="text-slate-400 text-[11px] block mb-0.5">طرف حساب:</span>
                <span className="font-semibold text-slate-800 block">{cheque.partyName}</span>
                {cheque.partyPhone && (
                  <span className="text-[11px] text-slate-500 font-mono block mt-0.5" dir="ltr">
                    {cheque.partyPhone}
                  </span>
                )}
              </div>

              <div className="bg-white p-2.5 rounded-2xl border border-slate-100">
                <span className="text-slate-400 text-[11px] block mb-0.5">صاحب حساب / صادرکننده:</span>
                <span className="font-semibold text-slate-800 block">
                  {cheque.drawerName || cheque.partyName}
                </span>
              </div>

              <div className="bg-white p-2.5 rounded-2xl border border-slate-100">
                <span className="text-slate-400 text-[11px] block mb-0.5">تاریخ سررسید:</span>
                <span className="font-bold text-purple-800 font-mono block">
                  {new Date(cheque.dueDate).toLocaleDateString('fa-IR')}
                </span>
              </div>

              <div className="bg-white p-2.5 rounded-2xl border border-slate-100">
                <span className="text-slate-400 text-[11px] block mb-0.5">وضعیت فعلی:</span>
                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-lg inline-block ${
                    cheque.status === 'passed'
                      ? 'bg-emerald-100 text-emerald-800'
                      : cheque.status === 'bounced'
                      ? 'bg-rose-100 text-rose-800'
                      : cheque.status === 'endorsed'
                      ? 'bg-sky-100 text-sky-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {cheque.status === 'passed'
                    ? 'پاس شده (وصول)'
                    : cheque.status === 'bounced'
                    ? 'برگشت خورده'
                    : cheque.status === 'endorsed'
                    ? 'خرج شده'
                    : 'در جریان وصول'}
                </span>
              </div>
            </div>

            {cheque.invoiceNumber && (
              <div className="flex items-center gap-1.5 text-xs text-slate-500 pt-1">
                <FileText className="w-3.5 h-3.5" />
                <span>شماره فاکتور مرتبط: {cheque.invoiceNumber}</span>
              </div>
            )}

            {cheque.notes && (
              <div className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-2xl border border-slate-100">
                <span className="text-[10px] text-slate-400 block mb-0.5">توضیحات:</span>
                <span>{cheque.notes}</span>
              </div>
            )}
          </div>

          {/* Status Change Action Section */}
          <div className="bg-white rounded-2xl p-3 border border-sky-100 shadow-sm space-y-3">
            <span className="text-xs font-semibold text-slate-700 block border-b border-slate-100 pb-2">
              تغییر وضعیت چک
            </span>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleUpdateStatus('passed')}
                disabled={cheque.status === 'passed'}
                className="py-3 px-2 rounded-2xl bg-emerald-500 hover:bg-emerald-600 active:scale-95 disabled:opacity-40 text-white font-medium text-xs flex items-center justify-center gap-1.5 shadow-sm shadow-emerald-400 transition"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>وصول شد (پاس)</span>
              </button>

              <button
                type="button"
                onClick={() => handleUpdateStatus('bounced')}
                disabled={cheque.status === 'bounced'}
                className="py-3 px-2 rounded-2xl bg-rose-500 hover:bg-rose-600 active:scale-95 disabled:opacity-40 text-white font-medium text-xs flex items-center justify-center gap-1.5 shadow-sm shadow-rose-400 transition"
              >
                <AlertTriangle className="w-4 h-4" />
                <span>برگشت خورد</span>
              </button>

              <button
                type="button"
                onClick={() => handleUpdateStatus('endorsed')}
                disabled={cheque.status === 'endorsed'}
                className="py-3 px-2 rounded-2xl bg-sky-500 hover:bg-sky-600 active:scale-95 disabled:opacity-40 text-white font-medium text-xs flex items-center justify-center gap-1.5 shadow-sm shadow-sky-400 transition"
              >
                <ArrowRightLeft className="w-4 h-4" />
                <span>خرج شد (انتقال)</span>
              </button>

              <button
                type="button"
                onClick={() => handleUpdateStatus('pending')}
                disabled={cheque.status === 'pending'}
                className="py-3 px-2 rounded-2xl bg-slate-100 hover:bg-slate-200 active:scale-95 disabled:opacity-40 text-slate-700 font-medium text-xs flex items-center justify-center gap-1.5 transition"
              >
                <Clock className="w-4 h-4" />
                <span>در جریان وصول</span>
              </button>
            </div>

            <div>
              <input
                type="text"
                placeholder="یادداشت تغییر وضعیت (اختیاری)..."
                value={statusNotes}
                onChange={(e) => setStatusNotes(e.target.value)}
                className="w-full h-10 px-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs focus:outline-none focus:border-purple-500 transition"
              />
            </div>
          </div>

          {/* Delete Cheque Button */}
          <div className="pt-2">
            <button
              type="button"
              onClick={handleDelete}
              className="w-full py-2.5 rounded-2xl border border-rose-200 text-rose-600 hover:bg-rose-50 font-medium text-xs flex items-center justify-center gap-1.5 transition"
            >
              <Trash2 className="w-4 h-4" />
              <span>حذف این چک صیادی</span>
            </button>
          </div>
        </div>

        <LoadingOverlay isOpen={loading} message="در حال به‌روزرسانی وضعیت چک..." />
      </IonContent>
    </IonModal>
  );
};
