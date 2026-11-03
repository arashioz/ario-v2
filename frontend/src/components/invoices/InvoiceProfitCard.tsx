import React, { useEffect, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { accountingService } from '../../services/accounting.service';
import type { InvoiceProfit } from '../../services/accounting.service';
import { formatToman, percent, profitCaption, profitColor, toman, weight } from '../../lib/format';

/** Tiny toggle: the invoice profit stays hidden until the button is pressed. */
export const InvoiceProfitCard: React.FC<{ invoiceId: string; version: string }> = ({ invoiceId, version }) => {
  const [data, setData] = useState<InvoiceProfit | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    accountingService
      .invoiceProfit(invoiceId)
      .then((d) => alive && setData(d))
      .catch(() => alive && setData(null));
    return () => {
      alive = false;
    };
  }, [invoiceId, version]);

  if (!data) return null;

  return (
    <div className="print:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-full border border-slate-200/80 bg-white px-2 py-0.5 text-[10px] leading-4 text-slate-500 shadow-sm active:scale-95"
      >
        <TrendingUp className="w-3 h-3 text-emerald-600" />
        {open ? (
          <span className={`font-mono font-bold ${profitColor(data.profit)}`}>
            {profitCaption(data.profit, { sold: data.revenue, unknown: data.unknownRevenue })}
          </span>
        ) : (
          <span>سود فاکتور</span>
        )}
      </button>
      {open && (
        <div className="mt-1.5 space-y-1 text-[10px] leading-4 text-slate-500">
          <div className="font-mono">
            {percent(data.marginPercent)} · کیلویی {formatToman(data.profitPerKg)}
          </div>
          {data.kg > 0 && (
            <div className="font-mono">
              تناژ محاسبه‌شده {weight(data.kg)}
              {data.storedKg && Math.abs(data.storedKg - data.kg) > Math.max(0.6, data.kg * 0.02)
                ? ` · ثبت فاکتور ${weight(data.storedKg)}`
                : ''}
            </div>
          )}
          {(data.issues || []).map((issue, i) => (
            <p key={i} className="text-amber-800">{issue.detail}</p>
          ))}
          {data.estimated && !(data.issues || []).length && <p className="text-amber-700">بخشی از بهای این فروش روی فاکتور ثبت نشده؛ آن بخش سود حساب نشده.</p>}
          {data.lines.map((l, i) => (
            <div key={i} className="rounded-xl bg-slate-50 px-2 py-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-slate-700 font-bold">{l.productName}</span>
                <span className={`shrink-0 font-mono ${l.unknownCost ? 'text-amber-700' : profitColor(l.profit)}`}>
                  {l.unknownCost ? 'سود نامشخص' : toman(l.profit)}
                </span>
              </div>
              <div className="font-mono text-slate-500 mt-0.5">
                {l.unit && l.unit !== 'کیلوگرم' ? `خرید هر ${l.unit} ${formatToman(l.costPerUnit)} · ` : ''}
                خرید هر کیلو {formatToman(l.costPerKg)}
                {l.kg > 0 ? ` · فروش هر کیلو ${formatToman(l.sellPerKg)}` : ''}
                {l.kg > 0 ? ` · ${weight(l.kg)}` : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
