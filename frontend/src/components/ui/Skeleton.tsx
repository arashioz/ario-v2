import React from 'react';
import { createPortal } from 'react-dom';

const bar = 'rounded-lg bg-slate-200/80';

export const ListSkeleton: React.FC<{ rows?: number }> = ({ rows = 6 }) => (
  <div className="space-y-2" role="status" aria-label="در حال بارگذاری">
    {Array.from({ length: rows }, (_, i) => (
      <div key={i} className="rounded-2xl bg-white border border-slate-100 p-3 space-y-2 animate-pulse">
        <div className={`${bar} h-3 w-2/5`} />
        <div className={`${bar} h-2 w-1/4`} />
        <div className={`${bar} h-2 w-3/5`} />
      </div>
    ))}
  </div>
);

/** Route fallback. Keeps the splash class so a half-loaded page is not uncovered early. */
export const PageSkeleton: React.FC = () =>
  createPortal(
    <div className="app-splash" role="status" aria-label="در حال بارگذاری" dir="rtl" style={{ background: '#f8fafc', alignItems: 'stretch', justifyContent: 'flex-start', padding: 16 }}>
      <div className="w-full max-w-md mx-auto space-y-3 pt-8">
        <div className="h-8 w-28 rounded-xl bg-slate-200 animate-pulse" />
        <div className="h-24 rounded-3xl bg-white border border-slate-100 animate-pulse" />
        <ListSkeleton rows={5} />
      </div>
    </div>,
    document.body,
  );
