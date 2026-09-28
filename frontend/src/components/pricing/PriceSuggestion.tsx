import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, Check, Loader2 } from 'lucide-react';
import type { CostBasis, PriceSuggestion, SuggestMode, SuggestQuery } from '../../services/accounting.service';
import { formatToman, num, percent } from '../../lib/format';
import { dateToYmd, formatJalali } from '../../lib/jalali';
import Toman from '../ui/Toman';

export interface PricingOptions {
  mode: SuggestMode;
  markup: string;
  basis: CostBasis;
  /** Expected monthly inflation (%) for the holding buffer. */
  inflation: string;
  /** Empty = measured per product. */
  holdDays: string;
}

const DEFAULT_OPTIONS: PricingOptions = { mode: 'custom', markup: '6', basis: 'replacement', inflation: '', holdDays: '' };
const STORAGE_KEY = 'pricing-options-v2';

const MODES: { id: SuggestMode; label: string; hint: string }[] = [
  {
    id: 'list',
    label: 'انتقال تورم به قیمت فعلی',
    hint: 'قیمت فروش جدید = قیمت فروش قبلی × (۱ + درصد افزایش بهای پایه از زمان آخرین قیمت‌گذاری). ساختار قیمت‌ها به‌هم نمی‌خورد.',
  },
  {
    id: 'recent',
    label: 'ضریب سود همیشگی',
    hint: 'قیمت فروش جدید = بهای پایه × (۱ + درصد سودی که در ۳۰ روز اخیر واقعاً روی این کالا گرفته‌اید).',
  },
  { id: 'custom', label: 'درصد سود هدف', hint: 'قیمت فروش جدید = بهای پایه × (۱ + درصد سود هدف).' },
];

const BASES: { id: CostBasis; label: string; hint: string }[] = [
  {
    id: 'replacement',
    label: 'بهای جایگزینی (توصیه‌شده)',
    hint: 'مبنا آخرین بهای تمام‌شده خرید است، حتی اگر از بار قدیمی هنوز در انبار مانده باشد؛ تا وقتی موجودی تمام شد پول خرید بار بعدی را داشته باشید.',
  },
  {
    id: 'average',
    label: 'میانگین موزون انبار',
    hint: 'مبنا میانگین بهای تمام‌شده موجودی فعلی انبار است (قدیم و جدید). محتاطانه برای بازار رقابتی؛ در تورم شدید سرمایه آب می‌رود.',
  },
];

/** Pricing options shared between the inflation page and the purchase sheet, remembered on this device. */
export function usePricingOptions() {
  const [opts, setOpts] = useState<PricingOptions>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      const merged = { ...DEFAULT_OPTIONS, ...(saved || {}) };
      return MODES.some((m) => m.id === merged.mode) ? merged : { ...merged, mode: DEFAULT_OPTIONS.mode };
    } catch {
      return DEFAULT_OPTIONS;
    }
  });
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(opts));
  }, [opts]);
  const patch = useCallback((p: Partial<PricingOptions>) => setOpts((o) => ({ ...o, ...p })), []);
  return [opts, patch] as const;
}

export const pricingQuery = (o: PricingOptions): SuggestQuery => ({
  mode: o.mode,
  markup: o.mode === 'custom' ? Number(o.markup) || 0 : undefined,
  basis: o.basis,
  inflation: Number(o.inflation) || undefined,
  holdDays: o.holdDays !== '' && !Number.isNaN(Number(o.holdDays)) ? Number(o.holdDays) : undefined,
});

const decimal = (v: string) => v.replace(/[^0-9.]/g, '');

const Choice = <T extends string>({ items, value, onChange }: { items: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) => (
  <div className={`grid gap-1.5 ${items.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
    {items.map((m) => (
      <button
        key={m.id}
        onClick={() => onChange(m.id)}
        className={`px-2 py-2 rounded-xl text-[11px] font-bold leading-4 transition ${
          value === m.id ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 border border-slate-200'
        }`}
      >
        {m.label}
      </button>
    ))}
  </div>
);

const NumField: React.FC<{ label: string; value: string; onChange: (v: string) => void; placeholder?: string; suffix: string }> = ({
  label,
  value,
  onChange,
  placeholder,
  suffix,
}) => (
  <label className="flex items-center justify-between gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 text-[11px] text-slate-600">
    {label}
    <span className="flex items-center gap-1.5 shrink-0">
      <input
        value={value}
        onChange={(e) => onChange(decimal(e.target.value))}
        inputMode="decimal"
        placeholder={placeholder}
        className="w-16 text-center font-mono font-bold text-slate-800 bg-slate-50 rounded-lg py-1 focus:outline-none placeholder:font-sans placeholder:font-normal placeholder:text-slate-400"
      />
      {suffix}
    </span>
  </label>
);

const Section: React.FC<{ step: string; title: string; hint?: string; children: React.ReactNode }> = ({ step, title, hint, children }) => (
  <div className="space-y-1.5">
    <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 px-1">
      <span className="w-4 h-4 rounded-full bg-slate-800 text-white text-[9px] flex items-center justify-center">{step}</span>
      {title}
    </div>
    {children}
    {hint && <p className="text-[10px] text-slate-500 leading-5 px-1">{hint}</p>}
  </div>
);

export const PricingOptionsPanel: React.FC<{ value: PricingOptions; onChange: (p: Partial<PricingOptions>) => void }> = ({ value, onChange }) => {
  const inflation = Number(value.inflation) || 0;
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3 space-y-3">
      <div>
        <h3 className="text-xs font-extrabold text-slate-800">قیمت فروش روی آخرین خرید</h3>
        <p className="text-[11px] text-slate-500 leading-5 mt-1">
          هر بار که خرید بعدی گران‌تر ثبت شود، پیشنهاد فروش هم بالا می‌رود: آخرین خرید به‌علاوه همین درصد سود. فروش از قیمت خرید پایین‌تر نمی‌رود تا پول خرید دوباره بماند.
        </p>
      </div>
      <NumField
        label="سود روی قیمت خرید"
        value={value.markup}
        onChange={(markup) => onChange({ markup, mode: 'custom' })}
        suffix="٪"
      />
      {value.mode !== 'custom' && (
        <p className="text-[10px] text-amber-700 leading-5">الان روش دیگری فعال است. با عوض کردن این درصد، همان سود ثابت روی قیمت خرید اعمال می‌شود.</p>
      )}

      <details className="rounded-2xl bg-slate-50 border border-slate-100">
        <summary className="px-3 py-2 text-[11px] font-bold text-slate-600 cursor-pointer">تنظیم دقیق‌تر</summary>
        <div className="px-3 pb-3 space-y-3.5">
          <Section step="۱" title="مبنای بهای تمام‌شده" hint={BASES.find((b) => b.id === value.basis)?.hint}>
            <Choice items={BASES} value={value.basis} onChange={(basis) => onChange({ basis })} />
          </Section>
          <Section
            step="۲"
            title="بافر تورم تا زمان فروش"
            hint={
              inflation > 0
                ? `اگر کالا در انبار بماند، ${num(inflation, 2)}٪ در ماه به بهای پایه اضافه می‌شود.`
                : 'اگر کالا مدتی می‌ماند، تورم ماهانه را بگذارید تا قیمت فروش جلوتر از گرانی بعدی باشد.'
            }
          >
            <div className="grid grid-cols-2 gap-1.5">
              <NumField label="تورم ماهانه" value={value.inflation} onChange={(v) => onChange({ inflation: v })} placeholder="مثلاً ۳" suffix="٪" />
              <NumField label="مدت خواب" value={value.holdDays} onChange={(holdDays) => onChange({ holdDays })} placeholder="خودکار" suffix="روز" />
            </div>
          </Section>
          <Section step="۳" title="روش دیگر" hint={MODES.find((m) => m.id === value.mode)?.hint}>
            <Choice items={MODES} value={value.mode} onChange={(mode) => onChange({ mode })} />
          </Section>
        </div>
      </details>
    </div>
  );
};

const changeTone = (n: number | null | undefined) =>
  !n ? 'bg-slate-100 text-slate-500' : n > 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600';

const signed = (n: number) => `${n > 0 ? '+' : ''}${percent(n)}`;

export const PriceSuggestionCard: React.FC<{
  s: PriceSuggestion;
  selected?: boolean;
  onToggle?: () => void;
  onApply?: () => void;
  applying?: boolean;
  applied?: boolean;
}> = ({ s, selected, onToggle, onApply, applying, applied }) => {
  const holdLabel = s.holdDaysMeasured === null && s.holdDays === 0 ? 'بدون سابقه فروش' : `${num(s.holdDays)} روز خواب`;
  const each = s.byWeight === false ? `هر ${s.unit}` : 'هر کیلو';
  const lift = s.suggested.perKg - s.current.perKg;
  return (
    <div className={`bg-white rounded-2xl border shadow-sm p-3 ${selected ? 'border-emerald-300 ring-2 ring-emerald-100' : 'border-slate-100'}`}>
      <div className="flex items-start justify-between gap-2">
        <button onClick={onToggle} disabled={!onToggle} className="flex items-start gap-2.5 min-w-0 text-right">
          {onToggle && (
            <span
              className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                selected ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300 bg-white'
              }`}
            >
              {selected && <Check className="w-3.5 h-3.5" />}
            </span>
          )}
          <div className="min-w-0">
            <h3 className="text-xs font-bold text-slate-800 truncate">{s.name}</h3>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {s.byWeight === false ? `قیمت به ${s.unit}` : `هر ${s.unit} ${num(s.weightPerUnitKg, 2)} کیلو`}
              {s.lastPurchaseDate ? ` · آخرین خرید ${formatJalali(dateToYmd(new Date(s.lastPurchaseDate)))}` : ''}
            </p>
          </div>
        </button>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0 font-mono ${changeTone(s.costChangePercent)}`}>
          تورم خرید {signed(s.costChangePercent)}
        </span>
      </div>

      <div className="mt-3 rounded-2xl bg-amber-50/70 border border-amber-100 px-3 py-2 space-y-1 text-[10px] text-amber-900">
        <div className="flex items-center justify-between gap-2">
          <span>
            {s.lastFreightPerKg > 0 ? (
              <>
                فاکتور <b className="font-mono">{num(s.lastInvoicePricePerKg)}</b> + کرایه <b className="font-mono">{num(s.lastFreightPerKg)}</b>
              </>
            ) : (
              'بهای تمام‌شده آخرین خرید'
            )}
          </span>
          <span className="font-mono">
            {s.prevCostPerKg !== s.lastCostPerKg && <span className="text-amber-500 line-through ml-1">{num(s.prevCostPerKg)}</span>}
            <b>{num(s.lastCostPerKg)}</b>
          </span>
        </div>
        {s.basis === 'average' && (
          <div className="flex items-center justify-between gap-2">
            <span>میانگین موزون انبار ({num(s.stockKg)} کیلو)</span>
            <b className="font-mono">{num(s.avgCostPerKg)}</b>
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <span>
            بافر تورم {s.bufferPercent > 0 ? <b className="font-mono">{signed(s.bufferPercent)}</b> : '—'} · {holdLabel}
          </span>
          <span className="font-mono">
            بهای پایه <b className="text-[11px]">{num(s.baseCostPerKg)}</b>
          </span>
        </div>
      </div>

      <p className={`text-[11px] leading-5 mt-2 ${lift > 0 ? 'text-rose-800' : 'text-emerald-800'}`}>
        {lift > 0
          ? `آخرین خرید ${num(s.lastCostPerKg)} ${each}. برای اینکه خرید بعدی ضرر ندهد باید ${num(s.suggested.perKg)} ${each} بفروشید؛ ${num(lift)} بالاتر از قیمت فعلی.`
          : `قیمت فعلی از آخرین خرید به‌علاوه سود بالاتر است و پول خرید دوباره را پوشش می‌دهد.`}
      </p>

      <div className="flex items-center gap-2 mt-2 text-[11px]">
        <div className="flex-1 bg-slate-50 rounded-2xl px-2 py-2 text-center">
          <div className="text-[10px] text-slate-500">فروش فعلی {each}</div>
          <div className="font-mono font-bold text-slate-700">{num(s.current.perKg)}</div>
          <div className={`text-[9px] font-mono ${s.current.profitPerKg < 0 ? 'text-rose-600' : 'text-slate-400'}`}>
            سود {num(s.current.profitPerKg)}
            {s.current.markupOnBaseCost !== null && ` · ${percent(s.current.markupOnBaseCost)}`}
          </div>
        </div>
        <ArrowLeft className="w-4 h-4 text-slate-300 shrink-0" />
        <div className="flex-1 bg-emerald-50 rounded-2xl px-2 py-2 text-center">
          <div className="text-[10px] text-emerald-700">پیشنهادی {each}</div>
          <div className="font-mono font-bold text-emerald-800">{num(s.suggested.perKg)}</div>
          <div className="text-[9px] font-mono text-emerald-600">
            سود {num(s.suggested.profitPerKg)} · {percent(s.markupUsed)}
          </div>
        </div>
      </div>
      <p className="text-[9px] text-slate-400 mt-1 px-1">سود و درصدها نسبت به بهای پایه (بهای جایگزینی + بافر) است.</p>

      <div className="mt-2 rounded-2xl border border-slate-100 overflow-hidden text-[11px]">
        <div className="grid grid-cols-3 bg-slate-50 text-[10px] text-slate-400 px-3 py-1.5">
          <span>قیمت هر {s.unit}</span>
          <span className="text-center">فعلی</span>
          <span className="text-left">پیشنهادی</span>
        </div>
        {(
          [
            ['تکی / مصرف‌کننده', 'retail'],
            ['سوپرمارکت', 'supermarket'],
            ['عمده', 'wholesale'],
          ] as const
        ).map(([label, k]) => (
          <div key={k} className="grid grid-cols-3 items-center px-3 py-1.5 border-t border-slate-100">
            <span className="text-slate-500">{label}</span>
            <span className="text-center font-mono text-slate-500">{num(s.current[k])}</span>
            <span className={`text-left font-mono font-bold ${s.suggested[k] > s.current[k] ? 'text-rose-600' : s.suggested[k] < s.current[k] ? 'text-emerald-600' : 'text-slate-700'}`}>
              {num(s.suggested[k])}
            </span>
          </div>
        ))}
      </div>

      {(s.recentSellPerKg !== null || s.mode === 'list') && (
        <p className="text-[10px] text-slate-400 mt-2 leading-5">
          {s.mode === 'list' && s.costChangeSincePricePercent !== 0 && (
            <>
              بهای پایه از زمان آخرین قیمت‌گذاری ({num(s.priceBaseCostPerKg)}){' '}
              <b className={`font-mono ${s.costChangeSincePricePercent > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{signed(s.costChangeSincePricePercent)}</b>{' '}
              تغییر کرده.{' '}
            </>
          )}
          {s.recentSellPerKg !== null && (
            <>
              میانگین فروش واقعی اخیر هر کیلو <b className="font-mono text-slate-600">{num(s.recentSellPerKg)}</b>
              {s.recentMarkupPercent !== null && (
                <>
                  {' '}
                  با سود <b className="font-mono text-slate-600">{percent(s.recentMarkupPercent)}</b> روی بهای جایگزینی روز فروش
                </>
              )}
              .
            </>
          )}
        </p>
      )}
      {s.lossGuarded && (
        <div className="flex items-center gap-1.5 text-[10px] text-amber-800 bg-amber-50 rounded-xl px-2.5 py-1.5 mt-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          قیمت تا بهای خرید بالا آمد تا فروش ضرر ندهد.
        </div>
      )}

      <div className="flex items-center justify-between gap-2 mt-3">
        <div className="text-[11px] text-slate-500">
          {s.needsUpdate ? (
            <>
              تغییر قیمت تکی{' '}
              <b className={`font-mono ${(s.changePercent ?? 0) > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{signed(s.changePercent ?? 0)}</b>{' '}
              (<Toman value={s.suggested.retail - s.current.retail} signed />)
            </>
          ) : (
            'قیمت فعلی با بهای جایگزینی هماهنگ است'
          )}
        </div>
        {onApply && (
          <button
            onClick={onApply}
            disabled={applying || applied}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-bold shrink-0 transition active:scale-95 ${
              applied ? 'bg-emerald-50 text-emerald-700' : 'bg-emerald-600 text-white disabled:opacity-60'
            }`}
          >
            {applying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : applied ? <Check className="w-3.5 h-3.5" /> : null}
            {applied ? 'اعمال شد' : 'اعمال قیمت'}
          </button>
        )}
      </div>
    </div>
  );
};

export const suggestionReason = (s: PriceSuggestion) =>
  `قیمت پیشنهادی بر اساس بهای ${s.basis === 'average' ? 'میانگین انبار' : 'جایگزینی'} (${formatToman(s.costBasisPerKg)} هر کیلو${
    s.bufferPercent > 0 ? `، بافر تورم ${percent(s.bufferPercent)}` : ''
  }، سود ${percent(s.markupUsed)})`;
