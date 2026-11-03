import React, { useEffect, useState } from 'react';
import { Phone } from 'lucide-react';
import { customerWatchService as watchService } from '../../services/customerWatch.service';
import type { WatchResume } from '../../services/customerWatch.service';
import { GradeBadge } from './GradeBadge';
import { SuggestedInvoiceCard } from './SuggestedInvoiceCard';
import { formatToman, weight, num } from '../../lib/format';
import { formatJalaliIso } from '../../lib/jalali';
import { Bone } from '../ui/Skeleton';

export const CustomerResumeCard: React.FC<{ customerId: string; refreshKey?: number }> = ({ customerId, refreshKey }) => {
  const [resume, setResume] = useState<WatchResume | null>(null);

  useEffect(() => {
    watchService.resume(customerId).then(setResume).catch(() => setResume(null));
  }, [customerId, refreshKey]);

  if (!resume) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-3.5">
        <Bone className="h-16 w-full" />
      </div>
    );
  }

  const rows: [string, string][] = [
    ['ماه گذشته', `${formatToman(resume.monthAmount)} · ${weight(resume.monthKg)}`],
    ['سال گذشته', `${formatToman(resume.yearAmount)} · ${weight(resume.yearKg)}`],
    ['دراپ‌سایز', `${formatToman(resume.dropAmount)} · ${weight(resume.dropKg)}`],
    ['بیشترین کالا', resume.topProductName ? `${resume.topProductName} · ${weight(resume.topProductKg)}` : '—'],
  ];

  return (
    <div className="space-y-3">
      <section className="bg-white rounded-2xl border border-sky-100 shadow-sm p-3.5 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-[11px] text-slate-400">رزومه تماس</div>
            <div className="flex items-center gap-2 mt-1">
              <GradeBadge grade={resume.grade} />
              <span className="text-[11px] font-mono text-slate-400">امتیاز {num(resume.score)}</span>
            </div>
          </div>
          {resume.customer.phoneNumber && (
            <a href={`tel:${resume.customer.phoneNumber}`} className="p-2 rounded-xl bg-emerald-50 text-emerald-700">
              <Phone className="w-4 h-4" />
            </a>
          )}
        </div>
        <p className="text-[12px] text-slate-700 leading-5">
          {resume.action}
          {resume.reason ? ` · ${resume.reason}` : ''}
          {resume.quietDays != null ? ` · ${num(resume.quietDays)} روز از آخرین خرید` : ''}
        </p>
        {resume.customer.lastContactNote && (
          <p className="text-[11px] text-slate-500 bg-slate-50 rounded-xl px-2.5 py-2">آخرین تماس: {resume.customer.lastContactNote}</p>
        )}
        <div className="grid grid-cols-2 gap-2">
          {rows.map(([k, v]) => (
            <div key={k} className="bg-slate-50 rounded-xl px-2.5 py-2">
              <div className="text-[10px] text-slate-400">{k}</div>
              <div className="text-[11px] font-bold text-slate-800 mt-0.5 leading-4">{v}</div>
            </div>
          ))}
        </div>
        {resume.recent.length > 0 && (
          <div>
            <div className="text-[10px] font-bold text-slate-500 mb-1">فاکتورهای اخیر</div>
            <div className="space-y-1">
              {resume.recent.slice(0, 3).map((row) => (
                <div key={row.id} className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-500 truncate">{row.number} · {formatJalaliIso(row.date, { year: false })}</span>
                  <span className="font-mono text-slate-700">{formatToman(row.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
      <SuggestedInvoiceCard customerId={customerId} resume={resume} />
    </div>
  );
};
