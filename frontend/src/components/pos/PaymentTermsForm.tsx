import React, { useEffect } from 'react';
import { Banknote, Clock, CreditCard, FileCheck, ArrowRightLeft, Sparkles, Truck } from 'lucide-react';
import { AmountInput } from '../ui/AmountInput';
import { AccountPicker, defaultAccountId } from '../ui/AccountPicker';
import type { Invoice, ShippingPayer, SplitDetails } from '../../services/invoices.service';
import { useSettings, type BankCard } from '../../services/settings.service';
import { formatToman } from '../../lib/format';

export type PayMethod = Invoice['paymentMethod'];
type CardMethod = 'pos' | 'transfer';

export interface PaymentTerms {
  paymentMethod: PayMethod;
  /**
   * split: every part of the total. credit: only what is paid right away (pos/cash/transfer/cheque);
   * whatever is left of the total goes on the customer's account.
   */
  split: Required<SplitDetails>;
  discount: number;
  shippingPayer: ShippingPayer;
  shippingCost: number;
  /** Shop bank account each card method was deposited to. */
  accounts: Record<CardMethod, string>;
}

export const emptyTerms = (method: PayMethod = 'pos'): PaymentTerms => ({
  paymentMethod: method,
  split: { pos: 0, cash: 0, transfer: 0, cheque: 0, credit: 0 },
  discount: 0,
  shippingPayer: 'none',
  shippingCost: 0,
  accounts: { pos: '', transfer: '' },
});

export const shippingCharge = (t: PaymentTerms) => (t.shippingPayer === 'customer' ? t.shippingCost : 0);
export const termsFinal = (subtotal: number, t: PaymentTerms) => Math.max(0, subtotal - t.discount) + shippingCharge(t);
export const splitSum = (t: PaymentTerms) => t.split.pos + t.split.cash + t.split.transfer + t.split.cheque + t.split.credit;
/** Paid right away on a credit invoice. */
export const paidNow = (t: PaymentTerms) => t.split.pos + t.split.cash + t.split.transfer + t.split.cheque;

/** Part of the final amount that goes on the customer's account. */
export const termsCredit = (final: number, t: PaymentTerms) =>
  t.paymentMethod === 'credit' ? Math.max(0, final - paidNow(t)) : t.paymentMethod === 'split' ? Math.min(final, t.split.credit) : 0;

/** Only کارت‌به‌کارت is tied to a shop bank account. کارتخوان is the POS drawer, not a card. */
export const accountMethodsUsed = (t: PaymentTerms): CardMethod[] =>
  (['transfer'] as CardMethod[]).filter(
    (m) => t.paymentMethod === m || ((t.paymentMethod === 'split' || t.paymentMethod === 'credit') && t.split[m] > 0),
  );

const paidParts = (s: Required<SplitDetails>) => s.pos + s.cash + s.transfer + s.cheque;

/** Unpaid remainder of a split invoice sits on نسیه, never on cash. */
export const splitWithRemainder = (s: Required<SplitDetails>, final: number, hasCustomer: boolean): Required<SplitDetails> => ({
  ...s,
  credit: hasCustomer ? Math.max(0, final - paidParts(s)) : 0,
});

const CARD_LABELS: Record<CardMethod, string> = { pos: 'کارتخوان', transfer: 'کارت‌به‌کارت' };

export const termsError = (final: number, t: PaymentTerms, hasCustomer: boolean, cards: BankCard[] = []): string | null => {
  if (t.paymentMethod === 'split' && paidNow(t) > final) return 'جمع پرداخت‌ها از مبلغ فاکتور بیشتر است';
  if (t.paymentMethod === 'split' && !hasCustomer && paidNow(t) !== final) return 'بدون مشتری، کل مبلغ باید همین‌جا پرداخت شود';
  if (t.paymentMethod === 'credit' && paidNow(t) > final) return 'پرداخت فعلی از مبلغ فاکتور بیشتر است';
  if (termsCredit(final, t) > 0 && !hasCustomer) return 'برای فروش نسیه، مشتری را انتخاب کنید';
  if (t.shippingPayer !== 'none' && t.shippingCost <= 0) return 'هزینه ارسال را وارد کنید';
  if (cards.length && accountMethodsUsed(t).length && !t.accounts.transfer) return 'حساب واریز کارت‌به‌کارت را انتخاب کنید';
  return null;
};

/** Fields the API expects, derived from the form. A credit invoice with money paid now is sent as split. */
export const termsPayload = (final: number, t: PaymentTerms) => {
  const credit = termsCredit(final, t);
  const depositAccounts = { pos: '', transfer: accountMethodsUsed(t).includes('transfer') ? t.accounts.transfer : '' };
  const shipping = {
    discount: t.discount,
    shippingPayer: t.shippingPayer !== 'none' && t.shippingCost > 0 ? t.shippingPayer : ('none' as ShippingPayer),
    shippingCost: t.shippingPayer !== 'none' ? t.shippingCost : 0,
  };
  if (t.paymentMethod === 'credit' && paidNow(t) > 0) {
    return {
      paymentMethod: 'split' as PayMethod,
      splitDetails: { pos: t.split.pos, cash: t.split.cash, transfer: t.split.transfer, cheque: t.split.cheque, credit },
      paidAmount: final - credit,
      depositAccounts,
      ...shipping,
    };
  }
  return {
    paymentMethod: t.paymentMethod,
    splitDetails: t.paymentMethod === 'split' ? { ...t.split } : undefined,
    paidAmount: final - credit,
    depositAccounts,
    ...shipping,
  };
};

/** Saved terms back into the form; a split that leaves credit is shown as نسیه with the paid parts filled in. */
export const termsFromSaved = (p: {
  paymentMethod: PayMethod;
  splitDetails?: SplitDetails;
  paidAmount?: number;
  discount?: number;
  shippingPayer?: ShippingPayer;
  shippingCost?: number;
  depositAccounts?: Partial<Record<CardMethod, string>>;
}): PaymentTerms => {
  const s = { pos: 0, cash: 0, transfer: 0, cheque: 0, credit: 0, ...(p.splitDetails || {}) } as Required<SplitDetails>;
  const base = {
    ...emptyTerms(p.paymentMethod),
    discount: p.discount || 0,
    shippingPayer: p.shippingPayer || 'none',
    shippingCost: p.shippingCost || 0,
    accounts: { pos: p.depositAccounts?.pos || '', transfer: p.depositAccounts?.transfer || '' },
  };
  if (p.paymentMethod === 'split' && s.credit > 0) return { ...base, paymentMethod: 'credit', split: { ...s, credit: 0 } };
  if (p.paymentMethod === 'credit') return { ...base, split: { ...base.split, cash: p.paidAmount || 0 } };
  return { ...base, split: s };
};

const METHODS: { id: PayMethod; label: string; icon: React.ElementType; tone: string }[] = [
  { id: 'pos', label: 'کارتخوان', icon: CreditCard, tone: 'bg-sky-600 border-sky-600' },
  { id: 'cash', label: 'نقدی', icon: Banknote, tone: 'bg-sky-600 border-sky-600' },
  { id: 'transfer', label: 'کارت به کارت', icon: ArrowRightLeft, tone: 'bg-sky-600 border-sky-600' },
  { id: 'cheque', label: 'چک صیادی', icon: FileCheck, tone: 'bg-sky-600 border-sky-600' },
  { id: 'credit', label: 'نسیه', icon: Clock, tone: 'bg-rose-600 border-rose-600' },
  { id: 'split', label: 'ترکیبی', icon: Sparkles, tone: 'bg-purple-600 border-purple-600' },
];

type SplitKey = keyof SplitDetails;

const SPLIT_FIELDS: { key: SplitKey; label: string }[] = [
  { key: 'cash', label: 'نقدی' },
  { key: 'pos', label: 'کارتخوان' },
  { key: 'transfer', label: 'کارت به کارت' },
  { key: 'cheque', label: 'چک' },
  { key: 'credit', label: 'مانده نسیه' },
];
const PAID_FIELDS = SPLIT_FIELDS.filter((f) => f.key !== 'credit');

interface Props {
  terms: PaymentTerms;
  onChange: (patch: Partial<PaymentTerms>) => void;
  subtotal: number;
  showShipping: boolean;
  hasCustomer: boolean;
  methodHint?: string;
}

export const PaymentTermsForm: React.FC<Props> = ({ terms, onChange, subtotal, showShipping, hasCustomer, methodHint }) => {
  const { bankCards } = useSettings();
  const final = termsFinal(subtotal, terms);
  const credit = termsCredit(final, terms);
  const splitLeft = final - splitSum(terms);
  const used = accountMethodsUsed(terms);

  const editSplit = (key: SplitKey, value: number) => {
    if (key === 'credit') return;
    onChange({ split: splitWithRemainder({ ...terms.split, [key]: value }, final, hasCustomer) });
  };

  const editPaid = (key: SplitKey, value: number) => onChange({ split: { ...terms.split, [key]: value, credit: 0 } });

  const setAccount = (m: CardMethod, id: string) => onChange({ accounts: { ...terms.accounts, [m]: id } });

  // Discount or a newly chosen customer moves the unpaid part onto نسیه.
  const splitKey = `${final}:${hasCustomer}:${terms.split.pos}:${terms.split.cash}:${terms.split.transfer}:${terms.split.cheque}`;
  useEffect(() => {
    if (terms.paymentMethod !== 'split') return;
    const next = splitWithRemainder(terms.split, final, hasCustomer);
    if (next.credit !== terms.split.credit) onChange({ split: next });
  }, [splitKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-select the default account when کارت‌به‌کارت is used.
  const usedKey = used.join(',');
  useEffect(() => {
    const def = defaultAccountId(bankCards);
    if (!def) return;
    const missing = used.filter((m) => !terms.accounts[m]);
    if (missing.length) onChange({ accounts: { ...terms.accounts, ...Object.fromEntries(missing.map((m) => [m, def])) } });
  }, [usedKey, bankCards]); // eslint-disable-line react-hooks/exhaustive-deps

  const picker = (m: CardMethod) => (
    <AccountPicker key={m} value={terms.accounts[m]} onChange={(id) => setAccount(m, id)} label={`${CARD_LABELS[m]} به حساب`} />
  );

  const pickMethod = (id: PayMethod) => {
    if (id === terms.paymentMethod) return;
    if (id === 'split') {
      onChange({ paymentMethod: id, split: splitWithRemainder({ pos: 0, cash: 0, transfer: 0, cheque: 0, credit: 0 }, final, hasCustomer) });
    } else if (id === 'credit') {
      onChange({ paymentMethod: id, split: { pos: 0, cash: 0, transfer: 0, cheque: 0, credit: 0 } });
    } else onChange({ paymentMethod: id });
  };

  return (
    <div className="space-y-4">
      {showShipping && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-3 space-y-2.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
            <Truck className="w-4 h-4" /> هزینه ارسال بار
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {([
              ['none', 'ندارد'],
              ['customer', 'با مشتری'],
              ['me', 'با من'],
            ] as [ShippingPayer, string][]).map(([id, label]) => (
              <button
                key={id}
                onClick={() => onChange({ shippingPayer: id })}
                className={`py-2 rounded-xl text-[11px] font-bold border transition ${
                  terms.shippingPayer === id ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-slate-600 border-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {terms.shippingPayer !== 'none' && (
            <>
              <AmountInput value={terms.shippingCost} onChange={(v) => onChange({ shippingCost: v })} placeholder="هزینه ارسال" />
              <p className="text-[10px] text-amber-800 leading-5">
                {terms.shippingPayer === 'customer'
                  ? 'به مبلغ فاکتور مشتری اضافه می‌شود (جزو سود فروش حساب نمی‌شود).'
                  : 'هنگام ثبت نهایی به‌عنوان «هزینه ارسال بار» در هزینه‌های فروشگاه ثبت می‌شود.'}
              </p>
            </>
          )}
        </div>
      )}

      <div>
        <label className="text-xs font-bold text-slate-700 block mb-1.5">تخفیف فاکتور</label>
        <AmountInput value={terms.discount} onChange={(v) => onChange({ discount: Math.min(v, subtotal) })} />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-bold text-slate-700">نحوه تسویه</label>
          {methodHint && <span className="text-[10px] text-slate-400">{methodHint}</span>}
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {METHODS.map((m) => (
            <button
              key={m.id}
              onClick={() => pickMethod(m.id)}
              className={`py-2.5 rounded-2xl text-[11px] font-bold border flex flex-col items-center gap-1 transition ${
                terms.paymentMethod === m.id ? `${m.tone} text-white shadow-sm` : 'bg-slate-50 border-slate-200 text-slate-600'
              }`}
            >
              <m.icon className="w-4 h-4" />
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {terms.paymentMethod === 'transfer' && (
        <div className="rounded-2xl bg-sky-50/60 border border-sky-100 p-3">{picker('transfer')}</div>
      )}

      {terms.paymentMethod === 'credit' && (
        <div className="rounded-2xl bg-rose-50/60 border border-rose-200 p-3 space-y-2">
          <div>
            <label className="text-[11px] font-bold text-rose-800">پرداخت همین الان (اختیاری)</label>
            <p className="text-[10px] text-rose-700/80 leading-5">هر مبلغی بزنید خودکار از نسیه کم می‌شود.</p>
          </div>
          {PAID_FIELDS.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="w-20 text-[11px] font-bold text-slate-600">{f.label}</span>
                <AmountInput className="flex-1" value={terms.split[f.key] || 0} onChange={(v) => editPaid(f.key, v)} />
              </div>
              {f.key === 'transfer' && terms.split.transfer > 0 && <div className="pr-[88px]">{picker('transfer')}</div>}
            </div>
          ))}
          <div className="flex items-center justify-between pt-2 border-t border-rose-200 text-xs">
            <span className="font-bold text-rose-800">مانده نسیه (به حساب مشتری)</span>
            <span className="font-mono font-extrabold text-rose-700">{formatToman(credit)}</span>
          </div>
          {paidNow(terms) > 0 && (
            <div className="flex items-center justify-between text-[11px] text-emerald-700">
              <span>پرداخت‌شده همین الان</span>
              <span className="font-mono font-bold">{formatToman(paidNow(terms))}</span>
            </div>
          )}
          {paidNow(terms) > 0 && paidNow(terms) < final && (
            <button onClick={() => onChange({ split: { ...terms.split, pos: 0, cash: 0, transfer: 0, cheque: 0 } })} className="text-[10px] text-rose-600">
              پاک کردن مبالغ پرداختی
            </button>
          )}
        </div>
      )}

      {terms.paymentMethod === 'split' && (
        <div className="rounded-2xl bg-purple-50/60 border border-purple-200 p-3 space-y-2">
          <p className="text-[10px] text-purple-700 leading-5">
            {hasCustomer
              ? 'هر چه همین‌جا پرداخت نشود، از مانده کم می‌شود و به‌صورت نسیه روی حساب مشتری می‌نشیند.'
              : 'بدون مشتری باید کل مبلغ همین‌جا پرداخت شود.'}
          </p>
          {PAID_FIELDS.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="w-20 text-[11px] font-bold text-slate-600">{f.label}</span>
                <AmountInput className="flex-1" value={terms.split[f.key] || 0} onChange={(v) => editSplit(f.key, v)} />
              </div>
              {f.key === 'transfer' && terms.split.transfer > 0 && <div className="pr-[88px]">{picker('transfer')}</div>}
            </div>
          ))}
          <div className="flex items-center justify-between pt-2 border-t border-purple-200 text-xs">
            <span className="font-bold text-rose-800">مانده نسیه</span>
            <span className="font-mono font-extrabold text-rose-700">{formatToman(hasCustomer ? credit : Math.max(0, splitLeft))}</span>
          </div>
        </div>
      )}
    </div>
  );
};
