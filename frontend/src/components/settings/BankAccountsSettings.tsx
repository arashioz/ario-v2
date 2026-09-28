import React, { useEffect, useState } from 'react';
import { Landmark, Plus, Save, Star, Trash2 } from 'lucide-react';
import { settingsService, type BankCard } from '../../services/settings.service';
import { cashbookService } from '../../services/cashbook.service';
import { apiErrorMessage } from '../../services/invoices.service';
import { useNotification } from '../../context/NotificationContext';
import { dateToYmd, jalaliMonthRange, ymdToJalali } from '../../lib/jalali';
import { formatToman, num, toEnDigits } from '../../lib/format';

const blank = (): BankCard => ({
  id: '',
  label: '',
  bankName: '',
  accountNumber: '',
  cardNumber: '',
  iban: '',
  accountHolder: '',
  isDefault: false,
});

const input = 'w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-sky-400 disabled:bg-slate-50';

const digits = (s: string) => toEnDigits(s).replace(/\D/g, '');
const cardProblem = (c: BankCard) => {
  const card = digits(c.cardNumber);
  const iban = toEnDigits(c.iban).replace(/[^0-9]/g, '');
  if (card && card.length !== 16) return 'شماره کارت باید ۱۶ رقم باشد';
  if (iban && iban.length !== 24) return 'شبا باید ۲۴ رقم (بعد از IR) باشد';
  if (!card && !iban && !digits(c.accountNumber)) return 'حداقل یکی از شماره حساب، کارت یا شبا را وارد کنید';
  return '';
};

/** Shop bank accounts that card payments (کارتخوان / کارت‌به‌کارت) are recorded against. */
export const BankAccountsSettings: React.FC<{ cards: BankCard[]; isAdmin: boolean }> = ({ cards, isAdmin }) => {
  const { showNotification } = useNotification();
  const [list, setList] = useState<BankCard[]>(cards);
  const [saving, setSaving] = useState(false);
  const [received, setReceived] = useState<Map<string, { in: number; count: number }>>(new Map());

  useEffect(() => setList(cards), [cards]);

  useEffect(() => {
    const j = ymdToJalali(dateToYmd());
    const { from } = jalaliMonthRange(j.jy, j.jm);
    cashbookService
      .cashbook(from, dateToYmd())
      .then((c) => setReceived(new Map((c.byAccount || []).map((a) => [a.accountId, a]))))
      .catch(() => undefined);
  }, [cards]);

  const dirty = JSON.stringify(list) !== JSON.stringify(cards);
  const problem = list.map(cardProblem).find(Boolean);

  const patch = (i: number, p: Partial<BankCard>) => setList((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...p } : c)));
  const makeDefault = (i: number) => setList((prev) => prev.map((c, idx) => ({ ...c, isDefault: idx === i })));

  const save = async () => {
    if (problem) {
      showNotification({ title: 'اطلاعات حساب ناقص است', message: problem, type: 'warning' });
      return;
    }
    try {
      setSaving(true);
      await settingsService.update({
        bankCards: list.map((c, i) => ({
          ...c,
          isDefault: c.isDefault || (!list.some((x) => x.isDefault) && i === 0),
        })),
      });
      showNotification({ title: 'ذخیره شد', message: 'حساب‌های بانکی به‌روز شد.', type: 'success' });
    } catch (err) {
      showNotification({ title: 'ذخیره نشد', message: apiErrorMessage(err, 'خطا در ذخیره حساب‌ها'), type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const unrecorded = received.get('');

  return (
    <section className="bg-white rounded-3xl border border-slate-100 shadow-sm p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
          <Landmark className="w-4 h-4 text-sky-600" /> حساب‌های بانکی فروشگاه
        </h2>
        {isAdmin && (
          <button onClick={() => setList((prev) => [...prev, { ...blank(), isDefault: prev.length === 0 }])} className="text-[11px] font-bold text-sky-700 flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" /> حساب جدید
          </button>
        )}
      </div>
      <p className="text-[11px] text-slate-400 leading-5">
        هر بار پرداخت با کارتخوان یا کارت‌به‌کارت ثبت شود، می‌پرسد پول به کدام حساب واریز شده. حساب پیش‌فرض (ستاره) خودکار انتخاب می‌شود و در پیامک‌ها برای واریز مشتری نوشته می‌شود.
      </p>

      {list.length === 0 && <p className="text-[11px] text-slate-400 text-center py-3">هنوز حسابی تعریف نشده.</p>}

      {list.map((c, i) => {
        const r = c.id ? received.get(c.id) : undefined;
        return (
          <div key={c.id || `new-${i}`} className={`rounded-2xl border p-3 space-y-2 ${c.isDefault ? 'border-sky-300 bg-sky-50/40' : 'border-slate-200'}`}>
            <div className="flex items-center gap-1.5">
              <input
                className={`${input} font-bold`}
                disabled={!isAdmin}
                placeholder="نام حساب (مثلاً ملت اصلی)"
                value={c.label}
                onChange={(e) => patch(i, { label: e.target.value })}
              />
              <button
                disabled={!isAdmin}
                onClick={() => makeDefault(i)}
                className={`p-2 rounded-xl shrink-0 ${c.isDefault ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-400'}`}
                title="حساب پیش‌فرض"
              >
                <Star className="w-4 h-4" fill={c.isDefault ? 'currentColor' : 'none'} />
              </button>
              {isAdmin && (
                <button onClick={() => setList((prev) => prev.filter((_, idx) => idx !== i))} className="p-2 rounded-xl bg-rose-50 text-rose-500 shrink-0" title="حذف حساب">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <input className={input} disabled={!isAdmin} placeholder="نام بانک" value={c.bankName} onChange={(e) => patch(i, { bankName: e.target.value })} />
              <input className={input} disabled={!isAdmin} placeholder="به نام (صاحب حساب)" value={c.accountHolder} onChange={(e) => patch(i, { accountHolder: e.target.value })} />
            </div>
            <input
              className={`${input} font-mono text-left`}
              dir="ltr"
              inputMode="numeric"
              disabled={!isAdmin}
              placeholder="شماره حساب"
              value={c.accountNumber}
              onChange={(e) => patch(i, { accountNumber: toEnDigits(e.target.value).replace(/[^\d-]/g, '') })}
            />
            <input
              className={`${input} font-mono text-left tracking-wider`}
              dir="ltr"
              inputMode="numeric"
              disabled={!isAdmin}
              placeholder="شماره کارت ۱۶ رقمی"
              value={digits(c.cardNumber).replace(/(\d{4})(?=\d)/g, '$1-')}
              onChange={(e) => patch(i, { cardNumber: digits(e.target.value).slice(0, 16) })}
            />
            <div className="flex items-center gap-1" dir="ltr">
              <span className="text-xs font-mono text-slate-500">IR</span>
              <input
                className={`${input} font-mono text-left`}
                dir="ltr"
                inputMode="numeric"
                disabled={!isAdmin}
                placeholder="شبا ۲۴ رقمی"
                value={toEnDigits(c.iban).replace(/^IR/i, '')}
                onChange={(e) => patch(i, { iban: digits(e.target.value).slice(0, 24) })}
              />
            </div>
            {cardProblem(c) && <p className="text-[10px] text-amber-700">{cardProblem(c)}</p>}
            {r && (
              <div className="text-[10px] text-emerald-700 bg-emerald-50 rounded-xl px-2.5 py-1.5">
                واریزی این ماه: <b className="font-mono">{formatToman(r.in)}</b> در {num(r.count)} پرداخت
              </div>
            )}
          </div>
        );
      })}

      {unrecorded && unrecorded.in > 0 && (
        <p className="text-[10px] text-slate-400">
          {formatToman(unrecorded.in)} پرداخت کارتی این ماه بدون مشخص کردن حساب ثبت شده ({num(unrecorded.count)} مورد).
        </p>
      )}

      {isAdmin && dirty && (
        <button
          onClick={save}
          disabled={saving}
          className="w-full py-3 rounded-2xl bg-sky-600 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Save className="w-4 h-4" /> {saving ? 'در حال ذخیره…' : 'ذخیره حساب‌ها'}
        </button>
      )}
    </section>
  );
};
