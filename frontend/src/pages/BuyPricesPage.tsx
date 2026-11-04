import React, { useEffect, useMemo, useState } from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { ReportHeader } from '../components/reports/ReportUI';
import { invoicesService, type PricePeriodRow } from '../services/invoices.service';
import { formatToman } from '../lib/format';
import { formatJalaliIso } from '../lib/jalali';

const day = (value?: string) => (value ? formatJalaliIso(value) : '');

export const BuyPricesPage: React.FC = () => {
  const [rows, setRows] = useState<PricePeriodRow[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    invoicesService.pricePeriods().then(setRows).catch(() => setError('بازه‌های قیمت خرید خوانده نشد'));
  }, []);

  const groups = useMemo(() => {
    const q = query.trim();
    const map = new Map<string, PricePeriodRow[]>();
    for (const row of rows) {
      if (q && !row.productName.includes(q)) continue;
      const list = map.get(row.productId) || [];
      list.push(row);
      map.set(row.productId, list);
    }
    return [...map.entries()];
  }, [rows, query]);

  return (
    <IonPage>
      <ReportHeader title="بازه قیمت خرید" subtitle="بهای تمام‌شده هر کالا از تاریخ فاکتور خرید تا تغییر بعدی" />
      <IonContent className="bg-slate-50">
        <div className="p-3 max-w-md mx-auto space-y-3 pb-16">
          <p className="text-[11px] text-slate-500 leading-6">
            فاکتور فروشی که تاریخ گذشته می‌گیرد، سودش با قیمت همین بازه حساب می‌شود، نه با قیمت خرید امروز.
          </p>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="نام کالا"
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
          />
          {error && <p className="text-xs text-rose-700">{error}</p>}
          {!error && !rows.length && <p className="text-xs text-slate-400">در حال خواندن…</p>}
          {groups.map(([id, list]) => (
            <article key={id} className="rounded-2xl bg-white border border-slate-200 p-3 space-y-2">
              <h2 className="text-sm font-bold text-slate-800">{list[0].productName}</h2>
              {list.map((row) => (
                <div key={`${row.invoiceId}-${row.from}`} className="flex items-start justify-between gap-2 text-[11px]">
                  <div className="text-slate-500 leading-5">
                    <div>{day(row.from)}{row.to ? ` تا قبل از ${day(row.to)}` : ' — قیمت جاری'}</div>
                    <div>فاکتور {row.invoiceNumber}</div>
                  </div>
                  <div className="font-bold text-slate-800 font-mono">{formatToman(row.unitPrice)}</div>
                </div>
              ))}
            </article>
          ))}
        </div>
      </IonContent>
    </IonPage>
  );
};
