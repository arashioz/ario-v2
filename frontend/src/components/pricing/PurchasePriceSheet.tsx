import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Truck, Warehouse } from 'lucide-react';
import { Sheet } from '../ui/Sheet';
import { accountingService } from '../../services/accounting.service';
import type { PurchaseImpact } from '../../services/accounting.service';
import { PriceSuggestionCard, PricingOptionsPanel, pricingQuery, usePricingOptions } from './PriceSuggestion';
import { usePriceApplier } from './usePriceApplier';
import { formatToman, num, percent, profitColor, weight } from '../../lib/format';
import { dateToYmd, formatJalali } from '../../lib/jalali';

/**
 * After a purchase invoice: how much each product's cost moved, what the stock on hand gained,
 * and the new sell price that keeps the profit — with one tap to apply.
 */
export const PurchasePriceSheet: React.FC<{ invoiceId: string | null; onClose: () => void }> = ({ invoiceId, onClose }) => {
  const [data, setData] = useState<PurchaseImpact | null>(null);
  const [error, setError] = useState('');
  const [pricing, setPricing] = usePricingOptions();
  const query = useMemo(() => pricingQuery(pricing), [pricing]);

  const load = useCallback(async () => {
    if (!invoiceId) return;
    try {
      setError('');
      setData(await accountingService.purchaseImpact(invoiceId, query));
    } catch {
      setError('محاسبه قیمت پیشنهادی ناموفق بود');
    }
  }, [invoiceId, query]);

  useEffect(() => {
    if (!invoiceId) {
      setData(null);
      return;
    }
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [invoiceId, load]);

  const { apply, applying, applied, reset } = usePriceApplier();

  useEffect(() => {
    if (!invoiceId) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId]);

  const suggestions = (data?.items ?? []).map((i) => i.suggestion).filter((s): s is NonNullable<typeof s> => !!s);
  const pending = suggestions.filter((s) => s.needsUpdate && !applied.has(s.productId));

  return (
    <Sheet
      open={!!invoiceId}
      title="قیمت فروش بعد از این خرید"
      subtitle={data ? `${data.invoiceNumber} · ${formatJalali(dateToYmd(new Date(data.date)))} · ${data.supplier}` : 'در حال محاسبه…'}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-2xl bg-slate-100 text-slate-600 text-xs font-bold">
            {pending.length ? 'بعداً' : 'بستن'}
          </button>
          {pending.length > 0 && (
            <button
              onClick={() => apply(pending)}
              disabled={applying.size > 0}
              className="flex-[2] py-2.5 rounded-2xl bg-emerald-600 text-white text-xs font-bold disabled:opacity-60"
            >
              اعمال قیمت جدید {num(pending.length)} کالا
            </button>
          )}
        </div>
      }
    >
      {error && <div className="text-xs text-rose-700 bg-rose-50 rounded-2xl p-3">{error}</div>}
      {!data ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
        </div>
      ) : (
        <>
          {data.holdingGain !== 0 && (
            <div className="flex gap-2.5 bg-amber-50 border border-amber-200 rounded-2xl p-3 text-[11px] text-amber-900 leading-6">
              <Warehouse className="w-4 h-4 shrink-0 mt-1 text-amber-600" />
              <div>
                با این قیمت خرید، ارزش باری که از قبل در انبار داشتید{' '}
                <b className={`font-mono ${profitColor(data.holdingGain)}`}>{formatToman(data.holdingGain)}</b> {data.holdingGain > 0 ? 'بیشتر' : 'کمتر'} شد (سود
                تورمی).
              </div>
            </div>
          )}

          {data.freight > 0 && (
            <div className="flex items-center gap-2 bg-sky-50 border border-sky-100 rounded-2xl px-3 py-2 text-[11px] text-sky-900">
              <Truck className="w-4 h-4 shrink-0 text-sky-600" />
              کرایه حمل و تخلیه <b className="font-mono">{formatToman(data.freight)}</b> به نسبت وزن روی بهای تمام‌شده هر کالا سرشکن شد.
            </div>
          )}

          <div className="space-y-1.5">
            {data.items.map((i) => (
              <div key={i.productId} className="flex items-center justify-between bg-slate-50 rounded-2xl px-3 py-2 text-[11px]">
                <div className="min-w-0">
                  <div className="font-bold text-slate-700 truncate">{i.name}</div>
                  <div className="text-[10px] text-slate-400">
                    {weight(i.kg)}
                    {i.stockKgHeld ? ` · انبار قبلی ${weight(i.stockKgHeld)}` : ''}
                    {i.freightPerKg > 0 ? ` · فاکتور ${num(i.invoicePricePerKg)} + کرایه ${num(i.freightPerKg)}` : ''}
                  </div>
                </div>
                <div className="text-left shrink-0">
                  <div className="font-mono text-slate-600">
                    {i.prevCostPerKg !== null && i.prevCostPerKg !== i.newCostPerKg && <span className="text-slate-400">{num(i.prevCostPerKg)} ← </span>}
                    <b>{num(i.newCostPerKg)}</b>
                  </div>
                  <div
                    className={`text-[10px] font-bold font-mono ${
                      (i.costChangePercent ?? 0) > 0 ? 'text-rose-600' : (i.costChangePercent ?? 0) < 0 ? 'text-emerald-600' : 'text-slate-400'
                    }`}
                  >
                    {i.costChangePercent === null ? 'اولین خرید' : `تورم خرید ${i.costChangePercent > 0 ? '+' : ''}${percent(i.costChangePercent)}`}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <PricingOptionsPanel value={pricing} onChange={setPricing} />

          {data.items.some((i) => !i.isLatestPurchase) && (
            <p className="text-[10px] text-slate-500 bg-slate-50 rounded-xl p-2.5 leading-5">
              برای بعضی کالاها خرید جدیدتری هم ثبت شده؛ قیمت پیشنهادی آن‌ها از آخرین بهای تمام‌شده خرید حساب شده است.
            </p>
          )}

          {suggestions.length === 0 ? (
            <p className="text-[11px] text-slate-400 text-center py-4">برای کالاهای این فاکتور (بدون وزن واحد) قیمت پیشنهادی قابل محاسبه نیست.</p>
          ) : (
            suggestions.map((s) => (
              <PriceSuggestionCard
                key={s.productId}
                s={s}
                onApply={() => apply([s])}
                applying={applying.has(s.productId)}
                applied={applied.has(s.productId)}
              />
            ))
          )}
        </>
      )}
    </Sheet>
  );
};
