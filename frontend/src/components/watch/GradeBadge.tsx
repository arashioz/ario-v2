import React from 'react';
import { GRADE_LABELS, GRADE_TONE, type WatchGrade } from '../../services/customerWatch.service';

export const GradeBadge: React.FC<{ grade?: string | null; className?: string }> = ({ grade, className = '' }) => {
  const g = (grade === 'A' || grade === 'B' || grade === 'C' || grade === 'D' ? grade : '') as WatchGrade | '';
  if (!g) return <span className={`text-[10px] text-slate-400 ${className}`}>بدون گرید</span>;
  return (
    <span className={`inline-flex items-center text-[10px] font-black px-2 py-0.5 rounded-full border ${GRADE_TONE[g]} ${className}`}>
      {g} · {GRADE_LABELS[g]}
    </span>
  );
};
