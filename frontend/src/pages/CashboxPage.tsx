import React, { useEffect, useState } from 'react';
import { IonPage, IonContent, IonRefresher, IonRefresherContent } from '@ionic/react';
import { Banknote, CreditCard, ArrowRightLeft } from 'lucide-react';
import { cashbookService } from '../services/cashbook.service';
import type { Cashbook } from '../services/cashbook.service';
import { PeriodPicker, periodPresets } from '../components/ui/PeriodPicker';
import type { Period } from '../components/ui/PeriodPicker';
import { ReportHeader } from '../components/reports/ReportUI';
import { accountTitle } from '../components/ui/AccountPicker';
import { useSettings } from '../services/settings.service';
import { formatToman } from '../lib/format';

const methodNet = (book: Cashbook | null, method: string) => book?.byMethod?.find((m) => m.method === method)?.net ?? 0;

export const CashboxPage: React.FC = () => {
  const { bankCards } = useSettings();
  const [period, setPeriod] = useState<Period>(() => periodPresets()[0]);
  const [book, setBook] = useState<Cashbook | null>(null);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      setError('');
      setBook(await cashbookService.cashbook(period.from, period.to));
    } catch {
      setError('صندوق خوانده نشد');
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const cards = [
    { label: 'کارتخوان', value: methodNet(book, 'pos'), icon: CreditCard, tone: 'text-sky-700 bg-sky-50' },
    { label: 'نقد', value: methodNet(book, 'cash'), icon: Banknote, tone: 'text-emerald-700 bg-emerald-50' },
    { label: 'کارت‌به‌کارت', value: methodNet(book, 'transfer'), icon: ArrowRightLeft, tone: 'text-violet-700 bg-violet-50' },
  ];

  return (
    <IonPage>
      <ReportHeader title="صندوق" subtitle="کارتخوان، نقد، و واریز به هر کارت" />
      <IonContent fullscreen className="bg-slate-50">
        <IonRefresher slot="fixed" onIonRefresh={(e) => load().finally(() => e.detail.complete())}>
          <IonRefresherContent />
        </IonRefresher>
        <div className="p-3 space-y-3 max-w-md mx-auto pb-8">
          <PeriodPicker value={period} onChange={setPeriod} />
          {error && <div className="text-xs text-rose-700 bg-rose-50 rounded-2xl p-3">{error}</div>}
          <div className="grid grid-cols-1 gap-2">
            {cards.map((c) => (
              <div key={c.label} className="bg-white rounded-2xl border border-slate-100 p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${c.tone}`}>
                    <c.icon className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold text-slate-700">{c.label}</span>
                </div>
                <span className="text-sm font-extrabold font-mono text-slate-800">{formatToman(c.value)}</span>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 divide-y divide-slate-100">
            <div className="px-3 py-2 text-[11px] font-bold text-slate-500">واریز به کارت‌ها</div>
            {(book?.byAccount || []).length === 0 ? (
              <div className="px-3 py-4 text-xs text-slate-400">در این بازه کارت‌به‌کارتی ثبت نشده.</div>
            ) : (
              book!.byAccount.map((a) => (
                <div key={a.accountId || 'none'} className="px-3 py-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-800 truncate">
                      {a.accountId ? accountTitle(bankCards, a.accountId) : 'کارت‌به‌کارت بدون حساب'}
                    </div>
                    <div className="text-[10px] text-slate-400">{a.count.toLocaleString('fa-IR')} واریز</div>
                  </div>
                  <span className="text-xs font-extrabold font-mono text-violet-700 shrink-0">{formatToman(a.in)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </IonContent>
    </IonPage>
  );
};
