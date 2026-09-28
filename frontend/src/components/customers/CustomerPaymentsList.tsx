import React, { useCallback, useEffect, useState } from 'react';
import { ArrowDownLeft, Search } from 'lucide-react';
import { customersService, PAYMENT_METHOD_LABELS } from '../../services/customers.service';
import type { PaymentRow } from '../../services/customers.service';
import { formatToman } from '../../lib/format';

type Range = 'today' | 'week' | 'month' | 'all';

const RANGE_LABELS: Record<Range, string> = {
  today: 'امروز',
  week: '۷ روز',
  month: '۳۰ روز',
  all: 'همه',
};

const rangeStart = (r: Range): string | undefined => {
  if (r === 'all') return undefined;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (r === 'week') d.setDate(d.getDate() - 6);
  if (r === 'month') d.setDate(d.getDate() - 29);
  return d.toISOString();
};

interface Props {
  refreshKey?: number;
  onOpenCustomer: (customerId: string) => void;
}

export const CustomerPaymentsList: React.FC<Props> = ({ refreshKey, onOpenCustomer }) => {
  const [range, setRange] = useState<Range>('month');
  const [search, setSearch] = useState('');
  const [data, setData] = useState<{ total: number; count: number; items: PaymentRow[] } | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await customersService.listPayments({ from: rangeStart(range), search: search.trim() || undefined }));
    } catch {
      setData({ total: 0, count: 0, items: [] });
    } finally {
      setLoading(false);
    }
  }, [range, search]);

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, refreshKey, search]);

  return (
    <div className="space-y-3">
      <div className="bg-emerald-600 rounded-2xl p-3 text-white flex items-center justify-between">
        <div>
          <span className="text-xs text-emerald-100 block">جمع دریافت‌ها ({RANGE_LABELS[range]})</span>
          <span className="text-xl font-bold font-mono">{(data?.total ?? 0).toLocaleString('fa-IR')}</span>
          <span className="text-xs text-emerald-100 mr-1">تومان</span>
        </div>
        <div className="bg-white/15 rounded-2xl px-3 py-2 text-center">
          <span className="text-[10px] text-emerald-100 block">تعداد</span>
          <span className="font-bold font-mono">{(data?.count ?? 0).toLocaleString('fa-IR')}</span>
        </div>
      </div>

      <div className="flex gap-1.5">
        {(Object.keys(RANGE_LABELS) as Range[]).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition ${
              range === r ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 border border-slate-200'
            }`}
          >
            {RANGE_LABELS[r]}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="جستجوی نام مشتری…"
          className="w-full pr-10 pl-4 py-2.5 text-xs rounded-2xl bg-white border border-slate-200 focus:outline-none focus:border-sky-400"
        />
      </div>

      {loading && !data ? (
        <div className="py-8 text-center text-xs text-slate-400">در حال دریافت…</div>
      ) : !data?.items.length ? (
        <div className="bg-white rounded-2xl p-6 text-center border border-dashed border-slate-200 text-xs text-slate-400">
          دریافتی در این بازه ثبت نشده است.
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 divide-y divide-slate-100 overflow-hidden">
          {data.items.map((p) => (
            <button
              key={p._id}
              onClick={() => p.customer && onOpenCustomer(p.customer._id)}
              className="w-full text-right p-3 flex items-start gap-3 active:bg-slate-50 transition"
            >
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <ArrowDownLeft className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-800 truncate">{p.customer?.name ?? '—'}</span>
                  <span className="text-sm font-bold font-mono text-emerald-600 shrink-0">
                    {formatToman(p.amount)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-0.5">
                  <span>
                    {new Intl.DateTimeFormat('fa-IR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(
                      new Date(p.date),
                    )}
                  </span>
                  {p.paymentMethod && <span>• {PAYMENT_METHOD_LABELS[p.paymentMethod]}</span>}
                  {p.recordedByName && <span>• {p.recordedByName}</span>}
                </div>
                {!!p.allocations?.length && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {p.allocations.map((a) => (
                      <span key={a.invoiceId} className="text-[10px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-md" dir="ltr">
                        {a.invoiceNumber}
                      </span>
                    ))}
                  </div>
                )}
                {p.description && <p className="text-[10px] text-slate-400 mt-0.5 truncate">{p.description}</p>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
