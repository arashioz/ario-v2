import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, ClipboardList, FileCheck2, Phone, Search, UserPlus, UserRound, Users } from 'lucide-react';
import { Sheet } from '../ui/Sheet';
import { customersService, CUSTOMER_KIND_LABELS } from '../../services/customers.service';
import type { Customer, CustomerKind } from '../../services/customers.service';
import { apiErrorMessage } from '../../services/invoices.service';
import { SALE_TYPE_LABELS, type AppSettings, type SaleType } from '../../services/settings.service';
import { useNotification } from '../../context/NotificationContext';
import { formatToman, num, searchKey, weight } from '../../lib/format';
import {
  PaymentTermsForm,
  emptyTerms,
  shippingCharge,
  termsCredit,
  termsError,
  termsFinal,
  type PaymentTerms,
} from './PaymentTermsForm';

export interface CheckoutResult {
  customer: Customer | null;
  terms: PaymentTerms;
  asProforma: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  saleType: SaleType;
  subtotal: number;
  totalKg: number;
  itemCount: number;
  customers: Customer[];
  onCustomerCreated: (c: Customer) => void;
  settings: AppSettings;
  submitting: boolean;
  onSubmit: (r: CheckoutResult) => void;
}

const TYPE_CHIP: Record<string, string> = {
  retail: 'bg-slate-100 text-slate-600',
  supermarket: 'bg-emerald-100 text-emerald-700',
  wholesale: 'bg-violet-100 text-violet-700',
};

export const CheckoutSheet: React.FC<Props> = ({
  open,
  onClose,
  saleType,
  subtotal,
  totalKg,
  itemCount,
  customers,
  onCustomerCreated,
  settings,
  submitting,
  onSubmit,
}) => {
  const { showNotification } = useNotification();
  const bulk = saleType !== 'retail';
  const [step, setStep] = useState<'customer' | 'payment'>('customer');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [walkIn, setWalkIn] = useState(false);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newKind, setNewKind] = useState<CustomerKind>('walkin');
  const [walkName, setWalkName] = useState('');
  const [walkPhone, setWalkPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [terms, setTerms] = useState<PaymentTerms>(emptyTerms());
  const [asProforma, setAsProforma] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setStep(bulk ? 'customer' : 'payment');
    setCustomer(null);
    setWalkIn(!bulk);
    setQuery('');
    setAdding(false);
    setWalkName('');
    setWalkPhone('');
    setTerms(emptyTerms(bulk ? 'credit' : 'pos'));
    setAsProforma(bulk && settings.proformaForBulk);
    if (bulk) setTimeout(() => searchRef.current?.focus(), 120);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const results = useMemo(() => {
    const q = searchKey(query);
    if (!q) {
      return [...customers]
        .sort((a, b) => +new Date(b.lastTransactionDate || b.updatedAt || 0) - +new Date(a.lastTransactionDate || a.updatedAt || 0))
        .slice(0, 12);
    }
    const digits = q.replace(/\D/g, '');
    return customers
      .map((c) => {
        const name = searchKey(c.name);
        const phones = `${c.phoneNumber || ''} ${c.phoneSecondary || ''}`.replace(/\D/g, '');
        const score = name.startsWith(q) ? 3 : name.includes(q) ? 2 : digits.length >= 3 && phones.includes(digits) ? 2 : 0;
        return { c, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.c.name.localeCompare(b.c.name, 'fa'))
      .slice(0, 30)
      .map((x) => x.c);
  }, [customers, query]);

  if (!open) return null;

  const final = termsFinal(subtotal, terms);
  const credit = termsCredit(final, terms);
  const walkInNamed = !customer && !!walkName.trim();
  const error = termsError(final, terms, !!customer || walkInNamed, settings.bankCards);

  const pick = (c: Customer | null) => {
    setCustomer(c);
    setWalkIn(!c);
    setStep('payment');
  };

  const startAdd = () => {
    const q = query.trim();
    const isPhone = /^[0-9۰-۹\s+-]{4,}$/.test(q);
    setNewName(isPhone ? '' : q);
    setNewPhone(isPhone ? q : '');
    setNewKind(bulk ? 'shop' : 'walkin');
    setAdding(true);
  };

  const createCustomer = async () => {
    if (!newName.trim()) return;
    try {
      setSaving(true);
      const c = await customersService.create({
        name: newName.trim(),
        phoneNumber: searchKey(newPhone).replace(/\D/g, ''),
        customerType: newKind === 'walkin' ? 'retail' : saleType,
        kind: newKind,
      });
      if (!customers.some((x) => x._id === c._id)) onCustomerCreated(c);
      showNotification({ title: 'مشتری اضافه شد', message: `${c.name} ثبت و انتخاب شد.`, type: 'success' });
      setAdding(false);
      pick(c);
    } catch (err) {
      showNotification({ title: 'خطا', message: apiErrorMessage(err, 'ثبت مشتری انجام نشد'), type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const submit = async () => {
    if (error) return;
    const phone = searchKey(walkPhone).replace(/\D/g, '');
    let buyer = customer;
    if (!buyer && (walkName.trim() || phone)) {
      try {
        setSaving(true);
        buyer = await customersService.create({ name: walkName.trim() || 'مشتری حضوری', phoneNumber: phone, kind: 'walkin' });
        if (!customers.some((x) => x._id === buyer!._id)) onCustomerCreated(buyer);
      } catch (err) {
        showNotification({ title: 'خطا', message: apiErrorMessage(err, 'ثبت مشتری حضوری انجام نشد'), type: 'error' });
        return;
      } finally {
        setSaving(false);
      }
    }
    onSubmit({ customer: buyer, terms, asProforma: bulk && asProforma && !!buyer });
  };

  const header = (
    <div className="flex items-center justify-between text-[11px] bg-slate-50 rounded-2xl px-3 py-2">
      <span className="text-slate-500">
        {num(itemCount)} قلم · {weight(totalKg)} · <b className="text-slate-700">{SALE_TYPE_LABELS[saleType]}</b>
      </span>
      <span className="font-mono font-bold text-slate-800">{formatToman(subtotal)}</span>
    </div>
  );

  if (step === 'customer') {
    return (
      <Sheet open onClose={onClose} title="مشتری این فاکتور" subtitle="با نام یا شماره جستجو کنید و انتخاب کنید">
        {header}
        {!adding ? (
          <>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="نام یا شماره موبایل…"
                className="w-full pr-10 pl-4 py-3 rounded-2xl border border-sky-200 text-sm focus:outline-none focus:border-sky-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={startAdd}
                className="py-2.5 rounded-2xl bg-sky-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 active:scale-[0.98]"
              >
                <UserPlus className="w-4 h-4" /> مشتری جدید
              </button>
              <button
                onClick={() => pick(null)}
                disabled={bulk}
                className="py-2.5 rounded-2xl bg-slate-100 text-slate-700 text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-40 active:scale-[0.98]"
              >
                <UserRound className="w-4 h-4" /> مشتری حضوری
              </button>
            </div>
            {bulk && <p className="text-[10px] text-amber-700 -mt-2">برای فروش {SALE_TYPE_LABELS[saleType]} انتخاب مشتری الزامی است.</p>}

            <div className="space-y-1.5">
              {!query && results.length > 0 && <div className="text-[10px] text-slate-400">مشتریان اخیر</div>}
              {results.map((c) => (
                <button
                  key={c._id}
                  onClick={() => pick(c)}
                  className="w-full flex items-center justify-between gap-2 p-3 rounded-2xl border border-slate-200 bg-white text-right active:bg-sky-50"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13px] font-bold text-slate-800 truncate">{c.name}</span>
                      {c.kind === 'walkin' ? (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">{CUSTOMER_KIND_LABELS.walkin}</span>
                      ) : (
                        c.customerType && (
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${TYPE_CHIP[c.customerType]}`}>
                            {SALE_TYPE_LABELS[c.customerType]}
                          </span>
                        )
                      )}
                    </div>
                    {c.phoneNumber && (
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5 flex items-center gap-1" dir="ltr">
                        <Phone className="w-3 h-3" /> {c.phoneNumber}
                      </div>
                    )}
                  </div>
                  {c.balance !== 0 && (
                    <span className={`text-[11px] font-mono font-bold shrink-0 ${c.balance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {c.balance > 0 ? 'بدهکار ' : 'بستانکار '}
                      {formatToman(Math.abs(c.balance))}
                    </span>
                  )}
                </button>
              ))}
              {query && results.length === 0 && (
                <div className="text-center py-6 space-y-2">
                  <Users className="w-7 h-7 mx-auto text-slate-300" />
                  <p className="text-xs text-slate-400">مشتری با «{query}» پیدا نشد.</p>
                  <button onClick={startAdd} className="text-xs font-bold text-sky-600">
                    افزودن «{query}» به‌عنوان مشتری جدید
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <button onClick={() => setAdding(false)} className="text-[11px] text-slate-500 flex items-center gap-1">
              <ChevronRight className="w-3.5 h-3.5" /> بازگشت به جستجو
            </button>
            <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-slate-100">
              {(['shop', 'walkin'] as CustomerKind[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setNewKind(k)}
                  className={`py-2 rounded-xl text-[11px] font-bold transition ${newKind === k ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-500'}`}
                >
                  {k === 'shop' ? 'فروشنده (مغازه)' : 'مشتری حضوری'}
                </button>
              ))}
            </div>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={newKind === 'walkin' ? 'نام مشتری' : 'نام مشتری / فروشگاه'}
              className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-sm focus:outline-none focus:border-sky-500"
            />
            <input
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              placeholder="شماره موبایل"
              inputMode="tel"
              dir="ltr"
              className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-sm font-mono text-left focus:outline-none focus:border-sky-500"
            />
            <p className="text-[10px] text-slate-400">
              {newKind === 'walkin'
                ? 'مشتری حضوری فقط نام و شماره دارد؛ با همان شماره دفعه بعد پیدا می‌شود.'
                : `نوع قیمت: ${SALE_TYPE_LABELS[saleType]} — بقیه اطلاعات را بعدا از پرونده مشتری کامل کنید.`}
            </p>
            <button
              onClick={createCustomer}
              disabled={saving || !newName.trim()}
              className="w-full py-3 rounded-2xl bg-sky-600 text-white text-sm font-bold disabled:opacity-40"
            >
              {saving ? 'در حال ثبت…' : 'ثبت و انتخاب مشتری'}
            </button>
          </div>
        )}
      </Sheet>
    );
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="پرداخت و ثبت"
      subtitle={customer ? customer.name : 'مشتری حضوری'}
      footer={
        <div className="space-y-2">
          {error && <p className="text-[11px] text-rose-600 text-center">{error}</p>}
          <button
            onClick={submit}
            disabled={!!error || submitting || saving}
            className={`w-full py-3.5 rounded-2xl text-white text-sm font-bold disabled:opacity-40 active:scale-[0.98] transition flex items-center justify-center gap-2 ${
              bulk && asProforma ? 'bg-amber-600' : 'bg-sky-600'
            }`}
          >
            {bulk && asProforma ? <ClipboardList className="w-4 h-4" /> : <FileCheck2 className="w-4 h-4" />}
            {submitting ? 'در حال ثبت…' : bulk && asProforma ? 'ثبت پیش‌فاکتور' : 'ثبت نهایی فاکتور'} · {formatToman(final)}
          </button>
        </div>
      }
    >
      <button
        onClick={() => setStep('customer')}
        className="w-full flex items-center justify-between p-3 rounded-2xl bg-sky-50 border border-sky-200 text-right"
      >
        <div>
          <div className="text-[13px] font-bold text-sky-900">{customer ? customer.name : walkIn ? 'مشتری حضوری' : ''}</div>
          {customer && (
            <div className="text-[11px] text-sky-700 mt-0.5">
              مانده فعلی: {customer.balance > 0 ? `بدهکار ${formatToman(customer.balance)}` : customer.balance < 0 ? `بستانکار ${formatToman(-customer.balance)}` : 'تسویه'}
            </div>
          )}
        </div>
        <span className="text-[11px] font-bold text-sky-600">{customer ? 'تغییر' : 'انتخاب مشتری'}</span>
      </button>

      {!customer && (
        <div className="grid grid-cols-2 gap-2 -mt-2">
          <input
            value={walkName}
            onChange={(e) => setWalkName(e.target.value)}
            placeholder="نام (اختیاری)"
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-[13px] focus:outline-none focus:border-sky-400"
          />
          <input
            value={walkPhone}
            onChange={(e) => setWalkPhone(e.target.value)}
            placeholder="شماره (اختیاری)"
            inputMode="tel"
            dir="ltr"
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-[13px] font-mono text-left focus:outline-none focus:border-sky-400"
          />
        </div>
      )}

      {bulk && customer && (
        <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-slate-100">
          <button
            onClick={() => setAsProforma(true)}
            className={`py-2 rounded-xl text-[11px] font-bold transition ${asProforma ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-500'}`}
          >
            پیش‌فاکتور تا ارسال بار
          </button>
          <button
            onClick={() => setAsProforma(false)}
            className={`py-2 rounded-xl text-[11px] font-bold transition ${!asProforma ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-500'}`}
          >
            فاکتور نهایی (همین الان)
          </button>
        </div>
      )}
      {bulk && asProforma && customer && (
        <p className="text-[10px] text-amber-800 bg-amber-50 rounded-xl px-3 py-2 leading-5 -mt-2">
          پیش‌فاکتور از انبار کم نمی‌شود و به حساب مشتری نمی‌رود. وقتی بار را فرستادید در «پیش‌فاکتورها» دکمه «ارسال شد» را بزنید تا ثبت نهایی شود.
        </p>
      )}

      <PaymentTermsForm
        terms={terms}
        onChange={(patch) => setTerms((t) => ({ ...t, ...patch }))}
        subtotal={subtotal}
        showShipping={bulk}
        hasCustomer={!!customer || walkInNamed}
        methodHint={bulk && asProforma ? 'هنگام ارسال قابل تغییر است' : undefined}
      />

      <div className="rounded-2xl bg-slate-50 p-3 space-y-1.5 text-xs">
        <div className="flex justify-between text-slate-500">
          <span>جمع اقلام</span>
          <span className="font-mono">{formatToman(subtotal)}</span>
        </div>
        {terms.discount > 0 && (
          <div className="flex justify-between text-rose-600">
            <span>تخفیف</span>
            <span className="font-mono">−{formatToman(terms.discount)}</span>
          </div>
        )}
        {shippingCharge(terms) > 0 && (
          <div className="flex justify-between text-amber-700">
            <span>هزینه ارسال (با مشتری)</span>
            <span className="font-mono">+{formatToman(shippingCharge(terms))}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-slate-900 text-sm pt-1.5 border-t border-slate-200">
          <span>مبلغ نهایی</span>
          <span className="font-mono text-sky-700">{formatToman(final)}</span>
        </div>
        {credit > 0 && customer && (
          <div className="flex justify-between text-rose-700">
            <span>مانده مشتری بعد از این فاکتور</span>
            <span className="font-mono font-bold">{formatToman(customer.balance + credit)}</span>
          </div>
        )}
        {terms.shippingPayer === 'me' && terms.shippingCost > 0 && (
          <div className="flex justify-between text-slate-500">
            <span>هزینه ارسال با من (در هزینه‌ها)</span>
            <span className="font-mono">{formatToman(terms.shippingCost)}</span>
          </div>
        )}
      </div>
    </Sheet>
  );
};
