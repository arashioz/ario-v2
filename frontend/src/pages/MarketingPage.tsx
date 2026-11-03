import React, { useEffect, useMemo, useState } from 'react';
import { IonContent, IonPage, IonRefresher, IonRefresherContent } from '@ionic/react';
import type { RefresherEventDetail } from '@ionic/react';
import { useNavigate } from 'react-router-dom';
import { MapPin, PhoneCall, Target, Users } from 'lucide-react';
import { ReportHeader } from '../components/reports/ReportUI';
import { TargetProgressCard } from '../components/target/TargetProgressCard';
import { accountingService } from '../services/accounting.service';
import type { SalesProgress } from '../services/accounting.service';
import { followUpsService } from '../services/followups.service';
import type { DueResponse } from '../services/followups.service';
import { customersService, isQuietMonth } from '../services/customers.service';
import type { Customer } from '../services/customers.service';
import { periodPresets, periodQuery } from '../components/ui/PeriodPicker';
import { useAuth } from '../context/AuthContext';
import { formatToman, num } from '../lib/format';

export const MarketingPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const month = useMemo(() => periodPresets().find((p) => p.from && p.to && p.label.startsWith('ماه')) || periodPresets()[4], []);
  const [board, setBoard] = useState<SalesProgress | null>(null);
  const [due, setDue] = useState<DueResponse | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);

  const load = async () => {
    const [progress, dueList, list] = await Promise.all([
      accountingService.salesProgress(periodQuery(month)).catch(() => null),
      followUpsService.getDue().catch(() => null),
      customersService.getCustomers({ kind: 'shop' }).catch(() => [] as Customer[]),
    ]);
    if (progress) setBoard(progress);
    if (dueList) setDue(dueList);
    setCustomers(list);
  };

  useEffect(() => { void load(); }, []);

  const mine = board?.sellers.find((row) => row.userId === user?.id || row.name === user?.fullName);
  const missingPin = customers.filter((c) => c.kind !== 'walkin' && (c.latitude == null || c.longitude == null));
  const quiet = customers.filter((c) => isQuietMonth(c));

  return (
    <IonPage>
      <ReportHeader title="بازاریابی" subtitle="تارگت فروش، پیگیری و مشتری‌های بدون لوکیشن" />
      <IonContent fullscreen className="bg-slate-50">
        <IonRefresher slot="fixed" onIonRefresh={async (e: CustomEvent<RefresherEventDetail>) => { await load(); e.detail.complete(); }}>
          <IonRefresherContent />
        </IonRefresher>
        <div className="p-3 space-y-3 max-w-lg mx-auto pb-10">
          {mine && (
            <TargetProgressCard
              title="تارگت فروش من این ماه"
              amount={mine.amount}
              kg={mine.kg}
              targetAmount={mine.targetAmount || user?.salesTargetAmount || 0}
              targetKg={mine.targetKg || user?.salesTargetKg || 0}
              invoices={mine.invoices}
              href="/sales-target"
              tone="#10b981"
            />
          )}
          {board && (
            <TargetProgressCard
              title="تارگت کل آریو این ماه"
              amount={board.shop.amount}
              kg={board.shop.kg}
              targetAmount={board.shop.targetAmount}
              targetKg={board.shop.targetKg}
              invoices={board.shop.invoices}
              href="/sales-target"
            />
          )}

          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => navigate('/follow-ups')} className="bg-white rounded-2xl border border-emerald-100 p-3 text-right">
              <PhoneCall className="w-4 h-4 text-emerald-600 mb-2" />
              <div className="text-[13px] font-bold text-slate-800">پیگیری امروز</div>
              <div className="text-[11px] text-slate-400 mt-0.5">{num(due?.counts.total || 0)} مشتری</div>
            </button>
            <button type="button" onClick={() => navigate('/customers-map?filter=quiet')} className="bg-white rounded-2xl border border-amber-100 p-3 text-right">
              <Users className="w-4 h-4 text-amber-600 mb-2" />
              <div className="text-[13px] font-bold text-slate-800">بدون خرید ماه</div>
              <div className="text-[11px] text-slate-400 mt-0.5">{num(quiet.length)} سوپر</div>
            </button>
          </div>

          <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-3.5 py-3 flex items-center justify-between">
              <div>
                <h2 className="text-[13px] font-bold text-slate-800">بدون لوکیشن روی نقشه</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">{num(missingPin.length)} مشتری هنوز پین ندارند</p>
              </div>
              <MapPin className="w-4 h-4 text-fuchsia-600" />
            </div>
            <div className="divide-y divide-slate-100">
              {missingPin.slice(0, 12).map((c) => (
                <button key={c._id} type="button" onClick={() => navigate('/tabs/customers')} className="w-full px-3.5 py-2.5 flex items-center justify-between text-right">
                  <span className="min-w-0">
                    <span className="block text-[13px] font-bold text-slate-800 truncate">{c.name}</span>
                    <span className="block text-[11px] text-slate-400">{c.phoneNumber || 'بدون تلفن'}</span>
                  </span>
                  <span className="text-[11px] font-bold text-sky-700">ثبت لوکیشن</span>
                </button>
              ))}
              {missingPin.length === 0 && <p className="px-3.5 py-3 text-[12px] text-slate-400">همه مشتری‌های فروشگاهی پین دارند.</p>}
            </div>
          </section>

          <button type="button" onClick={() => navigate('/sales-target')} className="w-full bg-slate-900 text-white rounded-2xl py-3 text-sm font-bold flex items-center justify-center gap-2">
            <Target className="w-4 h-4" />
            تعریف و پیگیری تارگت فروش
          </button>
          {due && due.todayCalls > 0 && (
            <p className="text-[11px] text-center text-slate-400">امروز {num(due.todayCalls)} تماس ثبت شده · مانده طلب {formatToman(customers.filter((c) => c.balance > 0).reduce((s, c) => s + c.balance, 0))}</p>
          )}
        </div>
      </IonContent>
    </IonPage>
  );
};
