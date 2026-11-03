import React from 'react';
import { useNavigate } from 'react-router-dom';
import { TargetRing } from './TargetRing';
import { formatToman, weight } from '../../lib/format';

export const TargetProgressCard: React.FC<{
  title: string;
  amount: number;
  kg: number;
  targetAmount: number;
  targetKg: number;
  invoices?: number;
  href?: string;
  tone?: string;
  framed?: boolean;
}> = ({ title, amount, kg, targetAmount, targetKg, invoices, href = '/sales-target', tone = '#0ea5e9', framed = true }) => {
  const navigate = useNavigate();
  const inner = (
    <div className="flex items-center gap-3 text-right">
      <TargetRing actual={amount} target={targetAmount} tone={tone} />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-bold text-slate-800">{title}</div>
        <div className="text-[12px] font-mono text-slate-700 mt-0.5">
          {formatToman(amount)}
          {targetAmount > 0 ? <span className="text-slate-400"> از {formatToman(targetAmount)}</span> : <span className="text-slate-400"> · هدف مبلغ تعریف نشده</span>}
        </div>
        <div className="text-[11px] font-mono text-slate-400 mt-0.5">
          {weight(kg)}
          {targetKg > 0 ? ` از ${weight(targetKg)}` : ''}
          {invoices != null ? ` · ${invoices} فاکتور` : ''}
        </div>
      </div>
    </div>
  );
  const frame = framed ? 'w-full bg-white rounded-2xl border border-sky-100 shadow-sm p-3.5 text-right' : 'w-full text-right';
  return href ? (
    <button type="button" onClick={() => navigate(href)} className={`${frame} active:bg-slate-50`}>
      {inner}
    </button>
  ) : (
    <div className={frame}>{inner}</div>
  );
};
