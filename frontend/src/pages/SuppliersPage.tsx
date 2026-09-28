import React, { useCallback, useEffect, useState } from 'react';
import { IonPage, IonContent, IonRefresher, IonRefresherContent } from '@ionic/react';
import type { RefresherEventDetail } from '@ionic/react';
import { useNavigate } from 'react-router-dom';
import { Building2, ChevronLeft, CreditCard, FileSpreadsheet, Plus } from 'lucide-react';
import { suppliersService, type SupplierListItem } from '../services/suppliers.service';
import { Empty, ReportHeader } from '../components/reports/ReportUI';
import { CompanySheet } from '../components/suppliers/CompanySheet';
import { useNotification } from '../context/NotificationContext';
import Toman from '../components/ui/Toman';
import { dateToYmd, formatJalali } from '../lib/jalali';
import { formatToman, num, weight } from '../lib/format';

export const SuppliersPage: React.FC = () => {
  const navigate = useNavigate();
  const { showNotification } = useNotification();
  const [list, setList] = useState<SupplierListItem[] | null>(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [exportingName, setExportingName] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError('');
      setList(await suppliersService.list());
    } catch {
      setError('دریافت لیست شرکت‌ها ناموفق بود');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = async (e: CustomEvent<RefresherEventDetail>) => {
    await load();
    e.detail.complete();
  };

  const handleExport = async (e: React.MouseEvent, companyName?: string) => {
    e.stopPropagation();
    try {
      setExportingName(companyName || 'parent');
      await suppliersService.exportReconciliation(companyName);
      showNotification({
        title: 'خروجی اکسل مغایرت‌گیری',
        message: 'فایل اکسل با موفقیت دریافت شد.',
        type: 'success',
      });
    } catch {
      showNotification({
        title: 'خطا',
        message: 'دریافت خروجی اکسل ناموفق بود.',
        type: 'error',
      });
    } finally {
      setExportingName(null);
    }
  };

  const open = (name: string) => navigate(`/supplier-account?name=${encodeURIComponent(name)}`);
  const totalDebt = (list ?? []).reduce((s, c) => s + c.debt, 0);

  return (
    <IonPage>
      <ReportHeader
        title="شرکت‌های تأمین‌کننده"
        subtitle="حساب، بدهی و محصولات هر شرکت"
        right={
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1 px-3 py-2 rounded-2xl bg-sky-600 text-white text-[11px] font-bold active:scale-95 shrink-0"
          >
            <Plus className="w-4 h-4" /> شرکت جدید
          </button>
        }
      />
      <IonContent fullscreen className="bg-slate-50">
        <IonRefresher slot="fixed" onIonRefresh={refresh}>
          <IonRefresherContent />
        </IonRefresher>
        <div className="p-3 space-y-3 max-w-md mx-auto pb-8">
          {list && list.length > 0 && (
            <div className="rounded-2xl p-3.5 text-white bg-gradient-to-br from-rose-600 to-fuchsia-700 shadow-lg space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[11px] text-rose-100">جمع بدهی به همه شرکت‌ها</div>
                  <div className="text-2xl font-extrabold mt-0.5">
                    <Toman value={totalDebt} unitClassName="text-xs font-normal text-rose-100" />
                  </div>
                  <div className="text-[10px] text-rose-100 mt-0.5">{num(list.length)} شرکت فعال</div>
                </div>

                <button
                  type="button"
                  onClick={(e) => handleExport(e)}
                  disabled={exportingName !== null}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/20 hover:bg-white/30 text-white text-[11px] font-bold active:scale-95 transition backdrop-blur-xs disabled:opacity-50 shrink-0 border border-white/25 shadow-xs"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>{exportingName === 'parent' ? 'دریافت…' : 'اکسل شرکت مادر'}</span>
                </button>
              </div>
            </div>
          )}

          {error && <Empty>{error}</Empty>}
          {!list && !error && <Empty>در حال دریافت…</Empty>}

          {list?.map((c) => (
            <button
              key={c.name}
              onClick={() => open(c.name)}
              className="w-full bg-white rounded-2xl p-3 border border-slate-100 shadow-sm text-right active:scale-[0.99] transition"
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${c.isParent ? 'bg-rose-100 text-rose-600' : 'bg-sky-100 text-sky-600'}`}>
                  <Building2 className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px] font-bold text-slate-800 truncate">{c.name}</span>
                    {c.isParent && <span className="text-[9px] bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded-md shrink-0 font-bold">شرکت مادر</span>}
                    {!c.registered && <span className="text-[9px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-md shrink-0">ثبت نشده</span>}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                    {num(c.purchasesCount)} خرید · {weight(c.purchasedKg)}
                    {c.lastPurchaseDate && ` · آخرین ${formatJalali(dateToYmd(new Date(c.lastPurchaseDate)), { year: false })}`}
                    {c.accountsCount > 0 && (
                      <span className="inline-flex items-center gap-0.5 mr-1">
                        · <CreditCard className="w-3 h-3" /> {num(c.accountsCount)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-left shrink-0">
                  {c.prepaid > 0 ? (
                    <>
                      <div className="text-[10px] text-emerald-600">طلب</div>
                      <div className="text-xs font-bold font-mono text-emerald-700">{formatToman(c.prepaid)}</div>
                    </>
                  ) : (
                    <>
                      <div className="text-[10px] text-slate-400">بدهی</div>
                      <div className={`text-xs font-bold font-mono ${c.debt ? 'text-rose-600' : 'text-slate-400'}`}>{formatToman(c.debt)}</div>
                    </>
                  )}
                </div>

                <div
                  role="button"
                  onClick={(e) => handleExport(e, c.name)}
                  title={`خروجی اکسل مغایرت‌گیری ${c.name}`}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 active:scale-90 transition shrink-0"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                </div>

                <ChevronLeft className="w-4 h-4 text-slate-300 shrink-0" />
              </div>
            </button>
          ))}
        </div>

        <CompanySheet
          open={creating}
          company={null}
          onClose={() => setCreating(false)}
          onSaved={(c) => {
            setCreating(false);
            open(c.name);
          }}
        />
      </IonContent>
    </IonPage>
  );
};
