import React from 'react';
import { parseToman } from '../../lib/format';

const toLatinDigits = (s: string) =>
  s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

const grouped = (n: number) => Math.abs(Math.round(n)).toLocaleString('fa-IR');

/** Plain digit string (possibly negative) from a money field. Empty when zero. */
const moneyPlain = (raw: string, allowNegative = false) => {
  if (allowNegative && /^[-−]$/.test(raw.trim())) return '-';
  const n = parseToman(raw);
  if (!n) return '';
  return allowNegative && /[-−]/.test(raw) ? `-${n}` : String(n);
};

interface AmountInputProps {
  value: number;
  onChange: (v: number) => void;
  placeholder?: string;
  suffix?: string;
  autoFocus?: boolean;
  className?: string;
}

export const AmountInput: React.FC<AmountInputProps> = ({
  value,
  onChange,
  placeholder = '۰',
  suffix = 'تومان',
  autoFocus,
  className = '',
}) => (
  <div className={`relative ${className}`}>
    <input
      type="text"
      inputMode="numeric"
      autoFocus={autoFocus}
      value={value ? value.toLocaleString('fa-IR') : ''}
      onChange={(e) => onChange(parseInt(toLatinDigits(e.target.value).replace(/[^0-9]/g, ''), 10) || 0)}
      placeholder={placeholder}
      className="w-full pl-14 pr-4 py-3 rounded-2xl border border-slate-200 font-mono text-base font-bold text-slate-800 focus:outline-none focus:border-sky-500"
    />
    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs text-slate-400">{suffix}</span>
  </div>
);

/** Money field whose parent stores a plain digit string ("1500000" or ""). */
export const MoneyTextInput: React.FC<{
  value: string | number;
  onChange: (plain: string) => void;
  className?: string;
  placeholder?: string;
  allowNegative?: boolean;
}> = ({ value, onChange, className = '', placeholder = '۰', allowNegative = false }) => {
  const raw = String(value ?? '');
  const n = Number(raw.replace(/[^0-9-]/g, '')) || 0;
  const shown = raw === '-' ? '−' : n ? `${n < 0 ? '−' : ''}${grouped(n)}` : '';
  return (
    <input
      type="text"
      inputMode="numeric"
      dir="ltr"
      placeholder={placeholder}
      value={shown}
      onChange={(e) => onChange(moneyPlain(e.target.value, allowNegative))}
      className={className}
    />
  );
};
