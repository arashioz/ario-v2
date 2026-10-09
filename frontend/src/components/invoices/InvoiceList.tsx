import React, { useMemo } from 'react';
import { CheckCircle2, Clock, FileText, Truck } from 'lucide-react';
import { isOverdue, type Invoice } from '../../services/invoices.service';
import type { SalesView } from '../../services/settings.service';
import { dateToYmd, formatJalali } from '../../lib/jalali';
import { formatToman, num, weight } from '../../lib/format';

const PAY_LABEL: Record<string, string> = {
  pos: 'کارتخوان',
  cash: 'نقدی',
  transfer: 'کارت‌به‌کارت',
  cheque: 'چک',
  credit: 'نسیه',
  split: 'ترکیبی',
};

const typeLabel = (inv: Invoice) =>
  inv.type === 'purchase' ? 'خرید' : inv.saleType === 'wholesale' ? 'عمده' : inv.saleType === 'supermarket' ? 'سوپرمارکت' : 'تکی';

const typeTone = (inv: Invoice) =>
  inv.type === 'purchase'
    ? 'bg-emerald-100 text-emerald-800'
    : inv.saleType === 'wholesale'
    ? 'bg-violet-100 text-violet-800'
    : inv.saleType === 'supermarket'
    ? 'bg-sky-100 text-sky-800'
    : 'bg-slate-100 text-slate-600';

const dayOf = (inv: Invoice) => dateToYmd(new Date(inv.invoiceDate || inv.createdAt));

const PaidBadge: React.FC<{ inv: Invoice }> = ({ inv }) =>
  inv.isPaid ? (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 flex items-center gap-1 whitespace-nowrap">
      <CheckCircle2 className="w-3 h-3" /> تسویه
    </span>
  ) : (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 flex items-center gap-1 whitespace-nowrap">
      <Clock className="w-3 h-3" /> {formatToman(inv.remainingDebt)}
    </span>
  );

const Card: React.FC<{ inv: Invoice; v: SalesView; onOpen: () => void; showDate: boolean }> = ({ inv, v, onOpen, showDate }) => (
  <button onClick={onOpen} className="w-full bg-white rounded-2xl p-3 border border-sky-100 shadow-sm text-right active:scale-[0.99] transition space-y-2.5">
    <div className="flex items-start justify-between gap-2">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-9 h-9 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
          <FileText className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[11px] font-semibold text-sky-800" dir="ltr">
              {inv.invoiceNumber}
            </span>
            {v.showSaleType && <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${typeTone(inv)}`}>{typeLabel(inv)}</span>}
            {inv.fulfillment === 'factory' && <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-100 text-amber-800">از کارخانه</span>}
            {isOverdue(inv) && <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-rose-600 text-white">تاخیر</span>}
          </div>
          <h4 className="text-xs font-bold text-slate-800 mt-1 truncate">{inv.customerName}</h4>
        </div>
      </div>
      <div className="text-left shrink-0">
        <div className="text-sm font-bold font-mono text-slate-800">{formatToman(inv.finalAmount)}</div>
        {showDate && <div className="text-[10px] text-slate-400 mt-0.5">{formatJalali(dayOf(inv), { year: false })}</div>}
      </div>
    </div>
    {v.showItems && (
      <div className="text-[10px] text-slate-500 bg-slate-50 rounded-2xl px-3 py-2 leading-5">
        {inv.items.map((i) => `${i.productName} ×${num(i.quantity, 2)}`).join(' · ')}
      </div>
    )}
    <div className="flex items-center justify-between pt-2 border-t border-slate-100 gap-2">
      <div className="flex items-center gap-2 text-[10px] text-slate-400 min-w-0">
        {v.showWeight && <span className="font-mono">{weight(inv.totalWeightKg)}</span>}
        {v.showPayment && <span>{PAY_LABEL[inv.paymentMethod] ?? inv.paymentMethod}</span>}
        {inv.shippingPayer && inv.shippingPayer !== 'none' && <Truck className="w-3 h-3 text-amber-500" />}
      </div>
      <PaidBadge inv={inv} />
    </div>
  </button>
);

const Compact: React.FC<{ inv: Invoice; v: SalesView; onOpen: () => void; showDate: boolean }> = ({ inv, v, onOpen, showDate }) => (
  <button onClick={onOpen} className="w-full flex items-center gap-2 px-3 py-2.5 text-right active:bg-slate-50">
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-bold text-slate-800 truncate">{inv.customerName}</span>
        {v.showSaleType && <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold shrink-0 ${typeTone(inv)}`}>{typeLabel(inv)}</span>}
        {inv.fulfillment === 'factory' && <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold shrink-0 bg-amber-100 text-amber-800">کارخانه</span>}
        {isOverdue(inv) && <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold shrink-0 bg-rose-600 text-white">تاخیر</span>}
      </div>
      <div className="text-[10px] text-slate-400 mt-0.5 truncate">
        <span dir="ltr" className="font-mono">
          {inv.invoiceNumber}
        </span>
        {showDate && ` · ${formatJalali(dayOf(inv), { year: false })}`}
        {v.showWeight && ` · ${weight(inv.totalWeightKg)}`}
        {v.showPayment && ` · ${PAY_LABEL[inv.paymentMethod] ?? ''}`}
      </div>
      {v.showItems && <div className="text-[10px] text-slate-500 truncate mt-0.5">{inv.items.map((i) => i.productName).join('، ')}</div>}
    </div>
    <div className="text-left shrink-0">
      <div className="text-xs font-bold font-mono text-slate-800">{formatToman(inv.finalAmount)}</div>
      {!inv.isPaid && <div className="text-[10px] font-mono text-rose-600 mt-0.5">مانده {formatToman(inv.remainingDebt)}</div>}
    </div>
  </button>
);

const Table: React.FC<{ list: Invoice[]; v: SalesView; onOpen: (i: Invoice) => void; showDate: boolean }> = ({ list, v, onOpen, showDate }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-[11px]">
      <thead className="bg-slate-50 text-slate-500">
        <tr>
          <th className="text-right font-bold px-2 py-2">مشتری</th>
          {showDate && <th className="text-right font-bold px-2 py-2">تاریخ</th>}
          {v.showSaleType && <th className="text-right font-bold px-2 py-2">نوع</th>}
          {v.showWeight && <th className="text-right font-bold px-2 py-2">وزن</th>}
          <th className="text-left font-bold px-2 py-2">مبلغ</th>
          {v.showPayment && <th className="text-left font-bold px-2 py-2">مانده</th>}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {list.map((inv) => (
          <tr key={inv._id} onClick={() => onOpen(inv)} className="active:bg-sky-50 cursor-pointer">
            <td className="px-2 py-2 font-bold text-slate-800 max-w-[110px] truncate">{inv.customerName}</td>
            {showDate && <td className="px-2 py-2 text-slate-500 whitespace-nowrap">{formatJalali(dayOf(inv), { year: false })}</td>}
            {v.showSaleType && <td className="px-2 py-2 text-slate-500">{typeLabel(inv)}</td>}
            {v.showWeight && <td className="px-2 py-2 font-mono text-slate-500 whitespace-nowrap">{num(inv.totalWeightKg)}</td>}
            <td className="px-2 py-2 font-mono font-bold text-left whitespace-nowrap">{num(inv.finalAmount)}</td>
            {v.showPayment && (
              <td className={`px-2 py-2 font-mono text-left whitespace-nowrap ${inv.remainingDebt ? 'text-rose-600' : 'text-emerald-600'}`}>
                {inv.remainingDebt ? num(inv.remainingDebt) : '✓'}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

/** Invoice list honoring the "sales display" settings (layout, grouping, visible fields). */
export const InvoiceList: React.FC<{ invoices: Invoice[]; view: SalesView; onOpen: (inv: Invoice) => void }> = ({ invoices, view, onOpen }) => {
  const groups = useMemo(() => {
    if (!view.groupByDay) return [{ day: '', list: invoices }];
    const m = new Map<string, Invoice[]>();
    for (const inv of invoices) {
      const d = dayOf(inv);
      if (!m.has(d)) m.set(d, []);
      m.get(d)!.push(inv);
    }
    return [...m.entries()].map(([day, list]) => ({ day, list }));
  }, [invoices, view.groupByDay]);

  const showDate = !view.groupByDay;

  return (
    <div className="space-y-3">
      {groups.map(({ day, list }) => {
        const total = list.reduce((s, i) => s + (i.finalAmount || 0), 0);
        const kg = list.reduce((s, i) => s + (i.totalWeightKg || 0), 0);
        return (
          <section key={day || 'all'} className="space-y-2">
            {day && (
              <div className="flex items-center justify-between px-1 text-[11px]">
                <span className="font-bold text-slate-700">{formatJalali(day, { weekday: true })}</span>
                <span className="text-slate-400 font-mono">
                  {num(list.length)} فاکتور · {formatToman(total)}
                  {view.showWeight ? ` · ${weight(kg)}` : ''}
                </span>
              </div>
            )}
            {view.layout === 'cards' ? (
              <div className="space-y-2.5">
                {list.map((inv) => (
                  <Card key={inv._id} inv={inv} v={view} onOpen={() => onOpen(inv)} showDate={showDate} />
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-sky-100 shadow-sm overflow-hidden">
                {view.layout === 'compact' ? (
                  <div className="divide-y divide-slate-100">
                    {list.map((inv) => (
                      <Compact key={inv._id} inv={inv} v={view} onOpen={() => onOpen(inv)} showDate={showDate} />
                    ))}
                  </div>
                ) : (
                  <Table list={list} v={view} onOpen={onOpen} showDate={showDate} />
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
};
