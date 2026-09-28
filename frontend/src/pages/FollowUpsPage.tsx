import React, { useCallback, useEffect, useState } from 'react';
import { IonPage, IonHeader, IonToolbar, IonContent, IonRefresher, IonRefresherContent } from '@ionic/react';
import type { RefresherEventDetail } from '@ionic/react';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { followUpsService, REASON_LABELS, RESULT_LABELS } from '../services/followups.service';
import type { DueResponse, DueReason, FollowUpLog } from '../services/followups.service';
import { DueRow } from '../components/followups/DueRow';
import { FollowUpSheet } from '../components/followups/FollowUpSheet';
import type { FollowUpTarget } from '../components/followups/FollowUpSheet';
import { formatToman } from '../lib/format';

type Filter = 'all' | DueReason;

export const FollowUpsPage: React.FC = () => {
  const navigate = useNavigate();
  const [view, setView] = useState<'due' | 'log'>('due');
  const [filter, setFilter] = useState<Filter>('all');
  const [due, setDue] = useState<DueResponse | null>(null);
  const [logs, setLogs] = useState<FollowUpLog[]>([]);
  const [target, setTarget] = useState<FollowUpTarget | null>(null);

  const load = useCallback(async () => {
    const [d, l] = await Promise.all([
      followUpsService.getDue().catch(() => null),
      followUpsService.recent(100).catch(() => []),
    ]);
    if (d) setDue(d);
    setLogs(l);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleRefresh = async (e: CustomEvent<RefresherEventDetail>) => {
    await load();
    e.detail.complete();
  };

  const items = (due?.items ?? []).filter((i) => filter === 'all' || i.reason === filter);
  const filters: Filter[] = ['all', 'promise', 'scheduled', 'debt', 'inactive'];

  return (
    <IonPage>
      <IonHeader className="ion-no-border">
        <IonToolbar className="bg-white/95 backdrop-blur-md px-4 py-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <button onClick={() => navigate(-1)} className="p-2 rounded-2xl bg-slate-50 text-slate-700 active:scale-95">
              <ArrowRight className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-sm font-bold text-slate-800">پیگیری مشتریان</h1>
              <p className="text-[10px] text-slate-400">لیست تماس خودکار بر اساس بدهی، قول پرداخت و خرید اخیر</p>
            </div>
          </div>
        </IonToolbar>
      </IonHeader>

      <IonContent fullscreen className="bg-slate-50">
        <IonRefresher slot="fixed" onIonRefresh={handleRefresh}>
          <IonRefresherContent />
        </IonRefresher>

        <div className="p-3 space-y-3 max-w-md mx-auto pb-8">
          <div className="grid grid-cols-2 p-1 bg-slate-200/70 rounded-2xl">
            {([
              ['due', `منتظر تماس (${(due?.counts.total ?? 0).toLocaleString('fa-IR')})`],
              ['log', 'تماس‌های ثبت‌شده'],
            ] as const).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setView(k)}
                className={`py-2 rounded-xl text-xs font-bold transition ${view === k ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {view === 'due' ? (
            <>
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
                {filters.map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-3 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap transition ${
                      filter === f ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 border border-slate-200'
                    }`}
                  >
                    {f === 'all' ? 'همه' : REASON_LABELS[f]}{' '}
                    <span className="font-mono">
                      ({(f === 'all' ? due?.counts.total ?? 0 : due?.counts[f] ?? 0).toLocaleString('fa-IR')})
                    </span>
                  </button>
                ))}
              </div>

              {items.length === 0 ? (
                <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 rounded-2xl p-3">
                  <CheckCircle2 className="w-4 h-4" />
                  موردی برای پیگیری نیست.
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-slate-100 px-3 divide-y divide-slate-100">
                  {items.map((item) => (
                    <DueRow key={item.customer._id} item={item} onLog={setTarget} />
                  ))}
                </div>
              )}
            </>
          ) : logs.length === 0 ? (
            <div className="bg-white rounded-2xl p-6 text-center border border-dashed border-slate-200 text-xs text-slate-400">
              هنوز تماسی ثبت نشده است.
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-100 divide-y divide-slate-100">
              {logs.map((l) => {
                const c = typeof l.customer === 'object' ? l.customer : null;
                return (
                  <div key={l._id} className="p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">{c?.name ?? '—'}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                        {RESULT_LABELS[l.result]}
                      </span>
                    </div>
                    {l.note && <p className="text-[11px] text-slate-500 mt-1">{l.note}</p>}
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-1">
                      <span>
                        {new Intl.DateTimeFormat('fa-IR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(
                          new Date(l.createdAt),
                        )}
                      </span>
                      {l.createdByName && <span>· {l.createdByName}</span>}
                      {l.promisedAmount > 0 && (
                        <span className="text-amber-600">
                          · قول <span className="font-mono">{formatToman(l.promisedAmount)}</span>
                        </span>
                      )}
                      {l.nextFollowUpAt && (
                        <span>
                          · بعدی {new Intl.DateTimeFormat('fa-IR', { month: 'short', day: 'numeric' }).format(new Date(l.nextFollowUpAt))}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <FollowUpSheet
          target={target}
          onClose={() => setTarget(null)}
          onLogged={() => {
            setTarget(null);
            load();
          }}
        />
      </IonContent>
    </IonPage>
  );
};
