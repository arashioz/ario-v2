import React from 'react';
import { MoneyTextInput } from '../ui/AmountInput';

export interface TargetValues {
  amount: number;
  kg: number;
}

export const TargetFields: React.FC<{
  value: TargetValues;
  onChange: (next: TargetValues) => void;
  amountLabel?: string;
  kgLabel?: string;
  disabled?: boolean;
}> = ({ value, onChange, amountLabel = 'هدف مبلغ (تومان)', kgLabel = 'هدف وزن (کیلو)', disabled }) => {
  const input = 'w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm font-mono focus:outline-none focus:border-sky-400 disabled:bg-slate-50';
  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="block text-right">
        <span className="text-[10px] text-slate-500 block mb-1">{amountLabel}</span>
        <MoneyTextInput
          value={value.amount || ''}
          onChange={(plain) => onChange({ ...value, amount: Number(plain) || 0 })}
          disabled={disabled}
          className={input}
        />
      </label>
      <label className="block text-right">
        <span className="text-[10px] text-slate-500 block mb-1">{kgLabel}</span>
        <input
          type="text"
          inputMode="decimal"
          disabled={disabled}
          value={value.kg ? String(value.kg) : ''}
          onChange={(e) => onChange({ ...value, kg: Math.max(0, Number(e.target.value.replace(/[^\d.]/g, '')) || 0) })}
          className={input}
          placeholder="۰"
        />
      </label>
    </div>
  );
};
