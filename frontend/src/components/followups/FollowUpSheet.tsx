import React, { useEffect, useState } from 'react';
import { Phone } from 'lucide-react';
import { Sheet } from '../ui/Sheet';
import { AmountInput } from '../ui/AmountInput';
import { followUpsService, RESULT_LABELS } from '../../services/followups.service';
import type { FollowUpResult } from '../../services/followups.service';
import { apiErrorMessage } from '../../services/invoices.service';
import { useNotification } from '../../context/NotificationContext';
import { formatToman } from '../../lib/format';

export interface FollowUpTarget {
  customerId: string;
  name: string;
  phoneNumber?: string;
  balance: number;
  reason?: string;
}

type NextChoice = 'auto' | '1' | '3' | '7' | '30' | 'none';

const NEXT_LABELS: Record<NextChoice, string> = {
  auto: 'خودکار',
  '1': 'فردا',
  '3': '۳ روز',
  '7': 'یک هفته',
  '30': 'یک ماه',
  none: 'دیگر نه',
};

const RESULT_ORDER: FollowUpResult[] = ['answered', 'promised', 'ordered', 'no_answer', 'busy', 'wrong_number'];

interface Props {
  target: FollowUpTarget | null;
  onClose: () => void;
  onLogged: () => void;
}

export const FollowUpSheet: React.FC<Props> = ({ target, onClose, onLogged }) => {
  const { showNotification } = useNotification();
  const [result, setResult] = useState<FollowUpResult | null>(null);
  const [note, setNote] = useState('');
  const [promised, setPromised] = useState(0);
  const [next, setNext] = useState<NextChoice>('auto');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (target) {
      setResult(null);
      setNote('');
      setPromised(0);
      setNext('auto');
    }
  }, [target]);

  if (!target) return null;

  const submit = async () => {
    if (!result) return;
    let nextFollowUpAt: string | undefined;
    if (next === 'none') nextFollowUpAt = '';
    else if (next !== 'auto') nextFollowUpAt = new Date(Date.now() + Number(next) * 86400000).toISOString();

    try {
      setSaving(true);
      await followUpsService.log(target.customerId, {
        result,
        reason: target.reason,
        note: note.trim() || undefined,
        promisedAmount: result === 'promised' ? promised : undefined,
        nextFollowUpAt,
      });
      showNotification({ title: 'ثبت شد', message: `نتیجه تماس با ${target.name} ثبت شد.`, type: 'success' });
      onLogged();
    } catch (err) {
      showNotification({ title: 'خطا', message: apiErrorMessage(err, 'ثبت تماس انجام نشد'), type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="ثبت نتیجه تماس"
      subtitle={target.name}
      footer={
        <button
          onClick={submit}
          disabled={!result || saving}
          className="w-full py-3 rounded-2xl bg-sky-600 text-white text-sm font-bold disabled:opacity-40 active:scale-[0.98] transition"
        >
          {saving ? 'در حال ثبت…' : 'ثبت'}
        </button>
      }
    >
      <div className="flex items-center justify-between bg-slate-50 rounded-2xl px-4 py-3">
        <div className="text-xs">
          <span className="text-slate-400 block">مانده حساب</span>
          <span className={`font-mono font-bold ${target.balance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
            {formatToman(Math.abs(target.balance))}
          </span>
        </div>
        {target.phoneNumber && (
          <a href={`tel:${target.phoneNumber}`} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold">
            <Phone className="w-3.5 h-3.5" />
            <span className="font-mono" dir="ltr">{target.phoneNumber}</span>
          </a>
        )}
      </div>

      <div>
        <label className="text-xs font-bold text-slate-700 block mb-2">نتیجه تماس</label>
        <div className="grid grid-cols-3 gap-1.5">
          {RESULT_ORDER.map((r) => (
            <button
              key={r}
              onClick={() => setResult(r)}
              className={`py-2.5 rounded-xl text-[11px] font-bold border transition ${
                result === r ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-slate-600 border-slate-200'
              }`}
            >
              {RESULT_LABELS[r]}
            </button>
          ))}
        </div>
      </div>

      {result === 'promised' && (
        <div>
          <label className="text-xs font-bold text-slate-700 block mb-1.5">مبلغ قول داده‌شده (اختیاری)</label>
          <AmountInput value={promised} onChange={setPromised} />
        </div>
      )}

      <div>
        <label className="text-xs font-bold text-slate-700 block mb-2">تماس بعدی</label>
        <div className="grid grid-cols-6 gap-1">
          {(Object.keys(NEXT_LABELS) as NextChoice[]).map((n) => (
            <button
              key={n}
              onClick={() => setNext(n)}
              className={`py-2 rounded-xl text-[10px] font-bold border transition ${
                next === n ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200'
              }`}
            >
              {NEXT_LABELS[n]}
            </button>
          ))}
        </div>
        {next === 'auto' && (
          <p className="text-[10px] text-slate-400 mt-1.5">
            جواب نداد ← فردا · قول پرداخت ← ۳ روز · صحبت شد ← یک هفته (بدهکار) یا یک ماه
          </p>
        )}
      </div>

      <textarea
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="یادداشت (مثلاً: گفت آخر هفته واریز می‌کند)"
        className="w-full px-4 py-2.5 rounded-2xl border border-slate-200 text-xs focus:outline-none focus:border-sky-500"
      />
    </Sheet>
  );
};
