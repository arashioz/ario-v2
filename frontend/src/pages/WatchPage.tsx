import React, { useEffect, useMemo, useState } from 'react';
import { IonContent, IonPage, IonRefresher, IonRefresherContent } from '@ionic/react';
import type { RefresherEventDetail } from '@ionic/react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ScanSearch } from 'lucide-react';
import { ReportHeader, Segments } from '../components/reports/ReportUI';
import { WatchSettingsForm } from '../components/watch/WatchSettingsForm';
import { GradeBadge } from '../components/watch/GradeBadge';
import { customerWatchService as watchService, GRADE_LABELS, type WatchBoard, type WatchGrade, type WatchQueueRow } from '../services/customerWatch.service';
import { formatToman, num, weight } from '../lib/format';
import { useNotification } from '../context/NotificationContext';
import { apiErrorMessage } from '../services/invoices.service';

type Tab = 'queue' | 'grades' | 'rules';

export const WatchPage: React.FC = () => {
  const { showNotification } = useNotification();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [tab, setTab] = useState<Tab>('queue');
  const [board, setBoard] = useState<WatchBoard | null>(null);
  const [scanning, setScanning] = useState(false);
  const [grade, setGrade] = useState<WatchGrade | 'all'>((params.get('grade') as WatchGrade) || 'all');

  const load = async () => {
    setBoard(await watchService.board());
  };

  useEffect(() => { void load().catch(() => setBoard(null)); }, []);

  const scan = async () => {
    setScanning(true);
    try {
      const next = await watchService.scan();
      setBoard(next);
      showNotification({ title: 'پایش انجام شد', message: `${next.scanned} مشتری گرید خورد · ${next.planned} پیگیری زمان‌بندی شد.`, type: 'success' });
    } catch (err) {
      showNotification({ title: 'اسکن نشد', message: apiErrorMessage(err, 'پایش مشتری اجرا نشد'), type: 'error' });
    } finally {
      setScanning(false);
    }
  };

  const queue = useMemo(() => {
    const rows = board?.queue || [];
    if (grade === 'all') return rows;
    return rows.filter((row) => row.watchGrade === grade);
  }, [board, grade]);

  return (
    <IonPage>
      <ReportHeader
        title="پایش مشتری"
        subtitle="گرید RFM، دراپ‌سایز و فاکتور پیشنهادی تماس"
        right={
          <button type="button" disabled={scanning} onClick={() => void scan()} className="px-3 py-1.5 rounded-xl bg-sky-600 text-white text-[11px] font-bold disabled:opacity-50 flex items-center gap-1">
            <ScanSearch className="w-3.5 h-3.5" />
            {scanning ? 'در حال پایش…' : 'پایش کن'}
          </button>
        }
      />
      <IonContent fullscreen className="bg-slate-50">
        <IonRefresher slot="fixed" onIonRefresh={async (e: CustomEvent<RefresherEventDetail>) => { await load(); e.detail.complete(); }}>
          <IonRefresherContent />
        </IonRefresher>
        <div className="p-3 space-y-3 max-w-lg mx-auto pb-10">
          <Segments<Tab> value={tab} onChange={setTab} items={[['queue', 'صف تماس'], ['grades', 'گریدها'], ['rules', 'قوانین']]} />

          {board && (
            <div className="grid grid-cols-4 gap-2">
              {(['A', 'B', 'C', 'D'] as WatchGrade[]).map((g) => (
                <button key={g} type="button" onClick={() => { setGrade(g); setTab('queue'); }} className="bg-white rounded-2xl border border-slate-100 py-2.5 text-center">
                  <div className="text-[10px] text-slate-400">{GRADE_LABELS[g]}</div>
                  <div className="text-[15px] font-black font-mono">{num(board.grades[g] || 0)}</div>
                </button>
              ))}
            </div>
          )}

          {tab === 'rules' && <WatchSettingsForm />}

          {tab === 'grades' && board && (
            <p className="text-[12px] text-slate-500 leading-5">
              {num(board.scored)} از {num(board.total)} مشتری فروشگاهی گرید دارند.
              دکمه پایش را بزنید تا ماه گذشته، سال گذشته، دراپ‌سایز و کالای پرمصرف از نو حساب شود.
            </p>
          )}

          {tab !== 'rules' && (
            <>
              <div className="flex gap-1 overflow-x-auto no-scrollbar">
                {(['all', 'A', 'B', 'C', 'D'] as const).map((g) => (
                  <button key={g} type="button" onClick={() => setGrade(g)} className={`px-3 py-1.5 rounded-full text-[11px] font-bold shrink-0 ${grade === g ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>
                    {g === 'all' ? `صف (${num(board?.queueCount || 0)})` : GRADE_LABELS[g]}
                  </button>
                ))}
              </div>
              <div className="space-y-2">
                {queue.map((row) => (
                  <QueueRow key={row._id} row={row} onOpen={() => navigate(`/tabs/customers?customerId=${row._id}`)} />
                ))}
                {queue.length === 0 && (
                  <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-6 text-center text-[12px] text-slate-400">
                    {board?.scored ? 'در این گرید کسی در صف تماس نیست.' : 'هنوز پایش نشده. قوانین را ذخیره کنید و پایش کن را بزنید.'}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </IonContent>
    </IonPage>
  );
};

const QueueRow: React.FC<{ row: WatchQueueRow; onOpen: () => void }> = ({ row, onOpen }) => (
  <button type="button" onClick={onOpen} className="w-full bg-white rounded-2xl border border-slate-100 shadow-sm p-3.5 text-right">
    <div className="flex items-center justify-between gap-2">
      <span className="text-[14px] font-bold text-slate-800 truncate">{row.name}</span>
      <GradeBadge grade={row.watchGrade} />
    </div>
    <p className="text-[11px] text-slate-500 mt-1 leading-5">{row.watchAction}{row.watchReason ? ` · ${row.watchReason}` : ''}</p>
    <div className="text-[11px] font-mono text-slate-400 mt-1">
      {row.watchTopProductName ? `${row.watchTopProductName} · ` : ''}
      دراپ {weight(row.watchDropKg || 0)}
      {(row.balance || 0) > 0 ? ` · بدهی ${formatToman(row.balance)}` : ''}
    </div>
  </button>
);
