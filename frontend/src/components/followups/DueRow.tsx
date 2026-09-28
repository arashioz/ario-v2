import React from 'react';
import { Phone, ClipboardCheck } from 'lucide-react';
import { REASON_LABELS, RESULT_LABELS, relativeDays } from '../../services/followups.service';
import type { DueItem, DueReason } from '../../services/followups.service';
import type { FollowUpTarget } from './FollowUpSheet';
import { formatToman } from '../../lib/format';

const REASON_STYLE: Record<DueReason, string> = {
  promise: 'bg-amber-50 text-amber-700',
  scheduled: 'bg-sky-50 text-sky-700',
  debt: 'bg-rose-50 text-rose-700',
  inactive: 'bg-slate-100 text-slate-600',
};

export const toTarget = (item: DueItem): FollowUpTarget => ({
  customerId: item.customer._id,
  name: item.customer.name,
  phoneNumber: item.customer.phoneNumber,
  balance: item.customer.balance,
  reason: item.reason,
});

interface Props {
  item: DueItem;
  onLog: (target: FollowUpTarget) => void;
}

export const DueRow: React.FC<Props> = ({ item, onLog }) => {
  const { customer } = item;

  const call = () => {
    if (!customer.phoneNumber) return;
    window.location.href = `tel:${customer.phoneNumber}`;
    // Open the log sheet so it is waiting when the user comes back from the call.
    setTimeout(() => onLog(toTarget(item)), 600);
  };

  return (
    <div className="flex items-center gap-3 py-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-slate-800 truncate">{customer.name}</span>
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md shrink-0 ${REASON_STYLE[item.reason]}`}>
            {REASON_LABELS[item.reason]}
          </span>
        </div>
        <div className="text-[10px] text-slate-400 mt-0.5 truncate">
          {customer.balance > 0 && (
            <span className="text-rose-600 font-mono font-bold ml-1.5">{formatToman(customer.balance)}</span>
          )}
          {item.reason === 'inactive' && item.daysSincePurchase !== null && (
            <span className="ml-1.5">آخرین خرید {item.daysSincePurchase.toLocaleString('fa-IR')} روز پیش</span>
          )}
          {item.lastContactAt ? (
            <span>
              · تماس قبلی {relativeDays(item.lastContactAt)}
              {item.lastContactResult ? ` (${RESULT_LABELS[item.lastContactResult]})` : ''}
            </span>
          ) : (
            <span>· تاکنون تماس ثبت نشده</span>
          )}
        </div>
        {item.lastContactNote && <p className="text-[10px] text-slate-500 mt-0.5 truncate">«{item.lastContactNote}»</p>}
      </div>

      <button
        onClick={() => onLog(toTarget(item))}
        className="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center active:scale-95 transition shrink-0"
        title="ثبت نتیجه تماس"
      >
        <ClipboardCheck className="w-4 h-4" />
      </button>
      <button
        onClick={call}
        disabled={!customer.phoneNumber}
        className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center active:scale-95 transition shrink-0 disabled:opacity-30"
        title="تماس"
      >
        <Phone className="w-4 h-4" />
      </button>
    </div>
  );
};
