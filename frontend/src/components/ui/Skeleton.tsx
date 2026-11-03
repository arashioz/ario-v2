import React from 'react';

const pulse = 'animate-pulse rounded-lg bg-slate-200/90';

export const Bone: React.FC<{ className?: string }> = ({ className = 'h-3 w-24' }) => (
  <span className={`${pulse} inline-block align-middle ${className}`} aria-hidden="true" />
);

export const ListSkeleton: React.FC<{ rows?: number }> = ({ rows = 6 }) => (
  <div className="space-y-2" role="status" aria-label="در حال بارگذاری">
    {Array.from({ length: rows }, (_, i) => (
      <div key={i} className="rounded-2xl bg-white border border-slate-100 p-3 flex items-center gap-3">
        <span className={`${pulse} h-8 w-8 rounded-full shrink-0`} />
        <span className="flex-1 space-y-2">
          <span className={`${pulse} block h-3 w-2/5`} />
          <span className={`${pulse} block h-2 w-1/4`} />
        </span>
        <span className={`${pulse} h-3 w-14`} />
      </div>
    ))}
  </div>
);

export const CardGridSkeleton: React.FC<{ count?: number }> = ({ count = 6 }) => (
  <div className="grid grid-cols-2 gap-2" role="status" aria-label="در حال بارگذاری">
    {Array.from({ length: count }, (_, i) => (
      <div key={i} className="rounded-2xl bg-white border border-slate-100 p-3 space-y-2">
        <span className={`${pulse} block h-16 w-full rounded-xl`} />
        <span className={`${pulse} block h-3 w-3/4`} />
        <span className={`${pulse} block h-2 w-1/2`} />
      </div>
    ))}
  </div>
);
