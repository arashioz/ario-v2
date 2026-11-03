import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Binoculars, ChevronLeft, PhoneCall } from 'lucide-react';
import { customerWatchService as watchService, GRADE_LABELS, type WatchBoard, type WatchGrade } from '../../services/customerWatch.service';
import { GradeBadge } from './GradeBadge';
import { num } from '../../lib/format';
import { Bone } from '../ui/Skeleton';

export const WatchBoardCard: React.FC<{ refreshKey?: number }> = ({ refreshKey }) => {
  const navigate = useNavigate();
  const [board, setBoard] = useState<WatchBoard | null>(null);

  const load = useCallback(() => {
    watchService.board().then(setBoard).catch(() => undefined);
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  if (!board) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-3.5">
        <Bone className="h-14 w-full" />
      </div>
    );
  }

  const grades: WatchGrade[] = ['A', 'B', 'C', 'D'];

  return (
    <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-2xl bg-sky-50 text-sky-700 flex items-center justify-center">
            <Binoculars className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">پایش مشتری</h3>
            <p className="text-[10px] text-slate-400">{num(board.queueCount)} نفر در صف تماس</p>
          </div>
        </div>
        <button type="button" onClick={() => navigate('/watch')} className="flex items-center text-[11px] font-bold text-sky-600">
          ماژول
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-4 gap-1 mt-3">
        {grades.map((g) => (
          <button key={g} type="button" onClick={() => navigate(`/watch?grade=${g}`)} className="rounded-xl bg-slate-50 py-2 text-center">
            <div className="text-[10px] text-slate-400">{GRADE_LABELS[g]}</div>
            <div className="text-[13px] font-black font-mono text-slate-800">{num(board.grades[g] || 0)}</div>
          </button>
        ))}
      </div>
      <div className="mt-2 divide-y divide-slate-100">
        {board.queue.slice(0, 4).map((row) => (
          <button key={row._id} type="button" onClick={() => navigate(`/tabs/customers?customerId=${row._id}`)} className="w-full py-2 text-right">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-bold text-slate-800 truncate">{row.name}</span>
              <GradeBadge grade={row.watchGrade} />
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5 truncate">{row.watchAction || row.watchReason}</p>
          </button>
        ))}
        {board.queue.length === 0 && (
          <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 rounded-2xl p-3 mt-2">
            <PhoneCall className="w-4 h-4" />
            صفی نیست. از ماژول پایش یک بار اسکن بگیرید.
          </div>
        )}
      </div>
    </section>
  );
};
