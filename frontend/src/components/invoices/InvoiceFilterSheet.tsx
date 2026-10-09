import React, { useEffect, useState } from 'react';
import { Sheet } from '../ui/Sheet';
import { AmountInput } from '../ui/AmountInput';
import type { Invoice } from '../../services/invoices.service';

type PayMethod = Invoice['paymentMethod'];

export interface InvoiceFilters {
  type: 'all' | 'sale' | 'purchase';
  saleType: 'all' | 'retail' | 'supermarket' | 'wholesale';
  status: 'all' | 'paid' | 'credit';
  method: 'all' | Exclude<PayMethod, 'split'>;
  min: number;
  max: number;
  sort: 'new' | 'old' | 'amount';
  source: 'all' | 'shop' | 'factory';
}

export const DEFAULT_INVOICE_FILTERS: InvoiceFilters = {
  type: 'all',
  saleType: 'all',
  status: 'all',
  method: 'all',
  min: 0,
  max: 0,
  sort: 'new',
  source: 'all',
};

const TYPE_OPTS = [
  ['all', 'همه'],
  ['sale', 'فروش'],
  ['purchase', 'خرید'],
] as const;
const SALE_TYPE_OPTS = [
  ['all', 'همه'],
  ['retail', 'تکی'],
  ['supermarket', 'سوپرمارکت'],
  ['wholesale', 'عمده'],
] as const;
const STATUS_OPTS = [
  ['all', 'همه'],
  ['paid', 'تسویه'],
  ['credit', 'نسیه'],
] as const;
const METHOD_OPTS = [
  ['all', 'همه'],
  ['pos', 'کارتخوان'],
  ['cash', 'نقد'],
  ['transfer', 'کارت‌به‌کارت'],
  ['cheque', 'چک'],
  ['credit', 'نسیه'],
] as const;
const SORT_OPTS = [
  ['new', 'جدیدترین'],
  ['old', 'قدیمی‌ترین'],
  ['amount', 'بیشترین مبلغ'],
] as const;

const LABELS: Record<string, Record<string, string>> = {
  type: Object.fromEntries(TYPE_OPTS),
  saleType: Object.fromEntries(SALE_TYPE_OPTS),
  status: Object.fromEntries(STATUS_OPTS),
  method: Object.fromEntries(METHOD_OPTS),
  sort: Object.fromEntries(SORT_OPTS),
};

const isCredit = (inv: Invoice) => !inv.isPaid || (inv.remainingDebt || 0) > 0;

/** Split invoices count for every method they include. */
const paidWith = (inv: Invoice, m: string) =>
  inv.paymentMethod === m || (inv.paymentMethod === 'split' && ((inv.splitDetails as Record<string, number> | undefined)?.[m] || 0) > 0);

export function applyInvoiceFilters(list: Invoice[], f: InvoiceFilters): Invoice[] {
  const out = list.filter((inv) => {
    if (f.source === 'factory' && inv.fulfillment !== 'factory') return false;
    if (f.source === 'shop' && inv.fulfillment === 'factory') return false;
    if (f.type !== 'all' && inv.type !== f.type) return false;
    if (f.saleType !== 'all' && (inv.type !== 'sale' || inv.saleType !== f.saleType)) return false;
    if (f.status === 'credit' && !isCredit(inv)) return false;
    if (f.status === 'paid' && isCredit(inv)) return false;
    if (f.method !== 'all' && !paidWith(inv, f.method)) return false;
    if (f.min && (inv.finalAmount || 0) < f.min) return false;
    if (f.max && (inv.finalAmount || 0) > f.max) return false;
    return true;
  });
  const time = (inv: Invoice) => new Date(inv.invoiceDate || inv.createdAt).getTime();
  if (f.sort === 'old') out.sort((a, b) => time(a) - time(b));
  else if (f.sort === 'amount') out.sort((a, b) => (b.finalAmount || 0) - (a.finalAmount || 0));
  else out.sort((a, b) => time(b) - time(a));
  return out;
}

/** Chips for the filters that differ from the defaults, each with a reset patch. */
export function activeInvoiceFilters(f: InvoiceFilters): { key: keyof InvoiceFilters; label: string; reset: Partial<InvoiceFilters> }[] {
  const chips: { key: keyof InvoiceFilters; label: string; reset: Partial<InvoiceFilters> }[] = [];
  for (const key of ['type', 'saleType', 'status', 'method', 'sort'] as const) {
    if (f[key] !== DEFAULT_INVOICE_FILTERS[key]) chips.push({ key, label: LABELS[key][f[key]], reset: { [key]: DEFAULT_INVOICE_FILTERS[key] } });
  }
  if (f.source !== 'all') chips.push({ key: 'source', label: f.source === 'factory' ? 'از کارخانه' : 'از دفتر', reset: { source: 'all' } });
  if (f.min || f.max) {
    const fmt = (n: number) => n.toLocaleString('fa-IR');
    const label = f.min && f.max ? `${fmt(f.min)} تا ${fmt(f.max)}` : f.min ? `از ${fmt(f.min)}` : `تا ${fmt(f.max)}`;
    chips.push({ key: 'min', label, reset: { min: 0, max: 0 } });
  }
  return chips;
}

function Segment<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {options.map(([id, text]) => (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={`px-3 py-1.5 rounded-xl text-xs transition ${
              value === id ? 'bg-sky-600 text-white font-bold' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

export const InvoiceFilterSheet: React.FC<{
  open: boolean;
  value: InvoiceFilters;
  onClose: () => void;
  onApply: (f: InvoiceFilters) => void;
}> = ({ open, value, onClose, onApply }) => {
  const [f, setF] = useState(value);
  useEffect(() => {
    if (open) setF(value);
  }, [open, value]);
  const set = (patch: Partial<InvoiceFilters>) => setF((prev) => ({ ...prev, ...patch }));

  return (
    <Sheet
      open={open}
      title="فیلتر فاکتورها"
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <button
            onClick={() => setF(DEFAULT_INVOICE_FILTERS)}
            className="px-4 py-3 rounded-2xl bg-slate-100 text-slate-600 text-sm font-bold"
          >
            پاک کردن
          </button>
          <button
            onClick={() => {
              onApply(f);
              onClose();
            }}
            className="flex-1 py-3 rounded-2xl bg-sky-600 text-white text-sm font-bold"
          >
            اعمال
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <Segment label="نوع" value={f.type} options={TYPE_OPTS} onChange={(type) => set({ type, saleType: type === 'purchase' ? 'all' : f.saleType })} />
        {f.type !== 'purchase' && <Segment label="نوع فروش" value={f.saleType} options={SALE_TYPE_OPTS} onChange={(saleType) => set({ saleType })} />}
        <Segment label="وضعیت پرداخت" value={f.status} options={STATUS_OPTS} onChange={(status) => set({ status })} />
        <Segment label="روش پرداخت" value={f.method} options={METHOD_OPTS} onChange={(method) => set({ method })} />
        <div className="space-y-1.5">
          <div className="text-[11px] text-slate-500">مبلغ</div>
          <div className="grid grid-cols-2 gap-2">
            <AmountInput value={f.min} onChange={(min) => set({ min })} placeholder="از" />
            <AmountInput value={f.max} onChange={(max) => set({ max })} placeholder="تا" />
          </div>
        </div>
        <Segment label="ترتیب" value={f.sort} options={SORT_OPTS} onChange={(sort) => set({ sort })} />
      </div>
    </Sheet>
  );
};
