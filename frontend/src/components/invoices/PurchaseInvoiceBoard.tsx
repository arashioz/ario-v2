import React, { useMemo, useState } from 'react';
import type { Invoice } from '../../services/invoices.service';
import { PARENT_COMPANY } from '../../services/suppliers.service';
import { dateToYmd, formatJalali } from '../../lib/jalali';
import { formatToman, num, weight } from '../../lib/format';

const companyOf = (inv: Invoice) => inv.supplierCompany || inv.customerName || PARENT_COMPANY;
const dayOf = (inv: Invoice) => dateToYmd(new Date(inv.invoiceDate || inv.createdAt));

export const PurchaseInvoiceBoard: React.FC<{
  invoices: Invoice[];
  onOpen: (inv: Invoice) => void;
}> = ({ invoices, onOpen }) => {
  const [company, setCompany] = useState('all');
  const [showLines, setShowLines] = useState(true);

  const companies = useMemo(() => {
    const names = new Set<string>();
    for (const inv of invoices) names.add(companyOf(inv));
    return [...names].sort((a, b) => (a === PARENT_COMPANY ? -1 : b === PARENT_COMPANY ? 1 : a.localeCompare(b, 'fa')));
  }, [invoices]);

  const filtered = useMemo(
    () => (company === 'all' ? invoices : invoices.filter((inv) => companyOf(inv) === company)),
    [invoices, company],
  );

  const days = useMemo(() => {
    const byDay = new Map<string, Invoice[]>();
    for (const inv of filtered) {
      const day = dayOf(inv);
      const list = byDay.get(day) ?? [];
      list.push(inv);
      byDay.set(day, list);
    }
    const chronological = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const running = new Map<string, { amount: number; kg: number; count: number }>();
    const rows = chronological.map(([day, list]) => {
      const byCompany = new Map<string, Invoice[]>();
      for (const inv of list) {
        const name = companyOf(inv);
        const group = byCompany.get(name) ?? [];
        group.push(inv);
        byCompany.set(name, group);
      }
      const companiesOfDay = [...byCompany.entries()].map(([name, invs]) => {
        const amount = invs.reduce((s, i) => s + (i.finalAmount || 0), 0);
        const kg = invs.reduce((s, i) => s + (i.totalWeightKg || 0), 0);
        const prev = running.get(name) ?? { amount: 0, kg: 0, count: 0 };
        const until = { amount: prev.amount + amount, kg: prev.kg + kg, count: prev.count + invs.length };
        running.set(name, until);
        return { name, invs, amount, kg, until };
      });
      return {
        day,
        amount: list.reduce((s, i) => s + (i.finalAmount || 0), 0),
        kg: list.reduce((s, i) => s + (i.totalWeightKg || 0), 0),
        count: list.length,
        companies: companiesOfDay.sort((a, b) => (a.name === PARENT_COMPANY ? -1 : b.name === PARENT_COMPANY ? 1 : a.name.localeCompare(b.name, 'fa'))),
      };
    });
    return rows.reverse();
  }, [filtered]);

  if (!invoices.length) {
    return <div className="bg-white rounded-3xl p-8 text-center text-slate-400 border border-sky-100 text-xs">فاکتور خریدی یافت نشد</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => setCompany('all')}
          className={`px-3 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap ${
            company === 'all' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 border border-slate-200'
          }`}
        >
          همه شرکت‌ها
        </button>
        {companies.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setCompany(name)}
            className={`px-3 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap ${
              company === name ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 border border-slate-200'
            }`}
          >
            {name === PARENT_COMPANY ? 'قند بلالی' : name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowLines((v) => !v)}
          className={`px-3 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap ${
            showLines ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 border border-slate-200'
          }`}
        >
          ریز کالا
        </button>
      </div>

      {days.map((d) => (
        <section key={d.day} className="space-y-2">
          <div className="flex items-center justify-between px-1 text-[11px]">
            <span className="font-bold text-slate-700">{formatJalali(d.day, { weekday: true, year: true })}</span>
            <span className="text-slate-400 font-mono">
              {num(d.count)} فاکتور · {formatToman(d.amount)} · {weight(d.kg)}
            </span>
          </div>
          {d.companies.map((c) => (
            <div key={c.name} className="bg-white rounded-2xl border border-emerald-100 shadow-sm overflow-hidden">
              <div className="px-3 py-2 bg-emerald-50/80 border-b border-emerald-100">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-emerald-900">{c.name}</span>
                  <span className="text-[10px] font-mono text-emerald-800">
                    جمع این روز: {formatToman(c.amount)} · {weight(c.kg)}
                  </span>
                </div>
                <div className="text-[10px] text-emerald-700 mt-0.5">
                  جمع تا پایان این روز: {formatToman(c.until.amount)} · {num(c.until.count)} فاکتور · {weight(c.until.kg)}
                </div>
              </div>
              <div className="divide-y divide-slate-100">
                {c.invs.map((inv) => (
                  <button key={inv._id} type="button" onClick={() => onOpen(inv)} className="w-full text-right px-3 py-2.5 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[11px] font-mono font-bold text-slate-700" dir="ltr">
                          {inv.invoiceNumber}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {num(inv.items.length)} قلم · {weight(inv.totalWeightKg)}
                          {inv.fulfillment === 'factory' ? ' · ارسال از کارخانه' : ''}
                        </div>
                      </div>
                      <div className="text-left shrink-0 text-[12px] font-bold font-mono text-slate-800">{formatToman(inv.finalAmount)}</div>
                    </div>
                    {showLines && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-[10px]">
                          <thead className="text-slate-400">
                            <tr>
                              <th className="text-right font-bold py-1">کالا</th>
                              <th className="text-right font-bold py-1">مقدار</th>
                              <th className="text-left font-bold py-1">فی</th>
                              <th className="text-left font-bold py-1">مبلغ</th>
                            </tr>
                          </thead>
                          <tbody>
                            {inv.items.map((it, idx) => (
                              <tr key={`${inv._id}-${idx}`} className="text-slate-700">
                                <td className="py-0.5 pr-0">{it.productName}</td>
                                <td className="py-0.5 whitespace-nowrap">
                                  {num(it.quantity, 2)} {it.unit}
                                  {it.weightKg ? ` · ${weight(it.weightKg)}` : ''}
                                </td>
                                <td className="py-0.5 text-left font-mono">{formatToman(it.unitPrice)}</td>
                                <td className="py-0.5 text-left font-mono font-bold">{formatToman(it.totalPrice)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
};
