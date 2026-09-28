import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Landmark } from 'lucide-react';
import { bankCardTitle, useSettings, type BankCard } from '../../services/settings.service';

export const defaultAccountId = (cards: BankCard[]) => (cards.find((c) => c.isDefault) ?? (cards.length === 1 ? cards[0] : undefined))?.id ?? '';

export const accountTitle = (cards: BankCard[], id?: string) => {
  if (!id) return '';
  const c = cards.find((x) => x.id === id);
  return c ? bankCardTitle(c) : 'حساب حذف‌شده';
};

interface Props {
  value: string;
  onChange: (id: string) => void;
  /** e.g. "کارتخوان به حساب" */
  label?: string;
  className?: string;
}

/** "Which shop account did this card payment land in?" — one chip per account from settings. */
export const AccountPicker: React.FC<Props> = ({ value, onChange, label = 'واریز به حساب', className = '' }) => {
  const { bankCards } = useSettings();
  const navigate = useNavigate();

  if (!bankCards.length) {
    return (
      <button
        type="button"
        onClick={() => navigate('/settings')}
        className={`w-full text-[10px] text-slate-500 bg-slate-50 border border-dashed border-slate-300 rounded-xl px-3 py-2 text-right ${className}`}
      >
        برای ثبت اینکه پول به کدام حساب رفته، اول در «تنظیمات» حساب‌های بانکی را تعریف کنید.
      </button>
    );
  }

  return (
    <div className={`space-y-1 ${className}`}>
      <div className={`text-[10px] font-bold flex items-center gap-1 ${value ? 'text-slate-500' : 'text-amber-700'}`}>
        <Landmark className="w-3 h-3" /> {label}
        {!value && <span className="font-normal">— انتخاب کنید</span>}
      </div>
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
        {bankCards.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onChange(c.id)}
            className={`shrink-0 px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition ${
              value === c.id ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-slate-600 border-slate-200'
            }`}
          >
            {bankCardTitle(c)}
          </button>
        ))}
      </div>
    </div>
  );
};
