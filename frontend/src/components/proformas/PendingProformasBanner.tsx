import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Truck } from 'lucide-react';
import { proformasService } from '../../services/proformas.service';
import { formatToman, num, weight } from '../../lib/format';

/** Shown only while there are pre-invoices waiting to ship. */
export const PendingProformasBanner: React.FC<{ refreshKey?: unknown }> = ({ refreshKey }) => {
  const navigate = useNavigate();
  const [s, setS] = useState<{ pendingCount: number; pendingAmount: number; pendingKg: number } | null>(null);

  useEffect(() => {
    proformasService.summary().then(setS).catch(() => undefined);
  }, [refreshKey]);

  if (!s?.pendingCount) return null;
  return (
    <button
      onClick={() => navigate('/proformas')}
      className="w-full flex items-center gap-3 p-3 rounded-2xl bg-amber-50 border border-amber-200 text-right active:scale-[0.99] transition"
    >
      <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shrink-0">
        <Truck className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-bold text-amber-900">{num(s.pendingCount)} پیش‌فاکتور منتظر ارسال بار</div>
        <div className="text-[10px] text-amber-700 font-mono mt-0.5">
          {formatToman(s.pendingAmount)} · {weight(s.pendingKg)}
        </div>
      </div>
      <ChevronLeft className="w-4 h-4 text-amber-400" />
    </button>
  );
};
