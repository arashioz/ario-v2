import React from 'react';
import { percent } from '../../lib/format';

export const targetRatio = (actual: number, target: number) => (target > 0 ? Math.min(1, Math.max(0, actual / target)) : 0);

export const TargetRing: React.FC<{
  actual: number;
  target: number;
  size?: number;
  stroke?: number;
  tone?: string;
  label?: string;
}> = ({ actual, target, size = 72, stroke = 7, tone = '#0ea5e9', label }) => {
  const ratio = target > 0 ? actual / target : 0;
  const shown = Math.min(1, Math.max(0, ratio));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * shown;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tone}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[12px] font-extrabold font-mono text-slate-800">{target > 0 ? percent(ratio * 100, 0) : '—'}</span>
        {label && <span className="text-[8px] text-slate-400">{label}</span>}
      </div>
    </div>
  );
};
