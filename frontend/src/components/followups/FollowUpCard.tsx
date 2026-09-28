import React, { useCallback, useEffect, useState } from 'react';
import { PhoneCall, ChevronLeft, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { followUpsService } from '../../services/followups.service';
import type { DueResponse } from '../../services/followups.service';
import { DueRow } from './DueRow';
import { FollowUpSheet } from './FollowUpSheet';
import type { FollowUpTarget } from './FollowUpSheet';

/** Dashboard card: today's automatic call list. */
export const FollowUpCard: React.FC<{ refreshKey?: number }> = ({ refreshKey }) => {
  const navigate = useNavigate();
  const [data, setData] = useState<DueResponse | null>(null);
  const [target, setTarget] = useState<FollowUpTarget | null>(null);

  const load = useCallback(() => {
    followUpsService.getDue().then(setData).catch(() => undefined);
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  if (!data) return null;
  const top = data.items.slice(0, 4);

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <PhoneCall className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">پیگیری امروز</h3>
            <p className="text-[10px] text-slate-400">
              <span className="font-mono">{data.counts.total.toLocaleString('fa-IR')}</span> مشتری منتظر تماس ·{' '}
              <span className="font-mono">{data.todayCalls.toLocaleString('fa-IR')}</span> تماس امروز ثبت شده
            </p>
          </div>
        </div>
        <button
          onClick={() => navigate('/follow-ups')}
          className="flex items-center text-[11px] font-bold text-sky-600 active:opacity-60"
        >
          همه
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {top.length === 0 ? (
        <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 rounded-2xl p-3 mt-3">
          <CheckCircle2 className="w-4 h-4" />
          همه پیگیری‌های امروز انجام شده است.
        </div>
      ) : (
        <div className="divide-y divide-slate-100 mt-1">
          {top.map((item) => (
            <DueRow key={item.customer._id} item={item} onLog={setTarget} />
          ))}
        </div>
      )}

      <FollowUpSheet
        target={target}
        onClose={() => setTarget(null)}
        onLogged={() => {
          setTarget(null);
          load();
        }}
      />
    </div>
  );
};
