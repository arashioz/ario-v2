import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { IonPage, IonContent, IonRefresher, IonRefresherContent } from '@ionic/react';
import type { RefresherEventDetail } from '@ionic/react';
import {
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Copy,
  CreditCard,
  Download,
  FileDown,
  FileSpreadsheet,
  FileText,
  Package,
  Pencil,
  Plus,
  Send,
  Truck,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { suppliersService, SUPPLIER_METHOD_LABELS, formatAccountNumber } from '../services/suppliers.service';
import type { SupplierAccount, SupplierListItem, SupplierPaymentRow, SupplierProfile, SupplierStatement } from '../services/suppliers.service';
import { CompanySheet } from '../components/suppliers/CompanySheet';
import { useNotification } from '../context/NotificationContext';
import { Empty, ReportHeader, Segments, StatCard } from '../components/reports/ReportUI';
import { useInvoiceOpener } from '../components/reports/useInvoiceOpener';
import { SupplierPaymentSheet } from '../components/suppliers/SupplierPaymentSheet';
import Toman from '../components/ui/Toman';
import { dateToYmd, formatJalali, ymdToJalali, JALALI_MONTHS, faNum } from '../lib/jalali';
import { PeriodPicker, periodPresets } from '../components/ui/PeriodPicker';
import type { Period } from '../components/ui/PeriodPicker';
import { formatToman, num, percent, toman, tons } from '../lib/format';

type View = 'payments' | 'invoices' | 'products' | 'month' | 'ledger';

const jDate = (iso: string | null | undefined) => (iso ? formatJalali(dateToYmd(new Date(iso)), { year: true }) : '—');

export const SupplierAccountPage: React.FC = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { showNotification } = useNotification();
  const name = params.get('name') || undefined;
  const [data, setData] = useState<SupplierAccount | null>(null);
  const [profile, setProfile] = useState<SupplierProfile | null>(null);
  const [channel, setChannel] = useState<'all' | 'shop' | 'factory'>('all');
  const [period, setPeriod] = useState<Period>(() => periodPresets()[0]);
  const [statement, setStatement] = useState<SupplierStatement | null>(null);
  const [error, setError] = useState('');
  const [view, setView] = useState<View>('payments');
  const [sheet, setSheet] = useState<{ payment: SupplierPaymentRow | null } | null>(null);
  const [editCompany, setEditCompany] = useState(false);
  const [newCompany, setNewCompany] = useState(false);
  const [others, setOthers] = useState<SupplierListItem[] | null>(null);
  const [exporting, setExporting] = useState(false);
  const [moving, setMoving] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [target, setTarget] = useState('');
  const [destName, setDestName] = useState('');
  const [companies, setCompanies] = useState<SupplierListItem[]>([]);
  const [moveSaving, setMoveSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setError('');
      const p = await suppliersService.profile(name);
      setProfile(p);
      setData(p.account);
      if (p.isParent) setOthers((await suppliersService.list()).filter((c) => !c.isParent));
    } catch {
      setError('دریافت حساب شرکت ناموفق بود');
    }
  }, [name]);

  const copy = async (text: string) => {
    await navigator.clipboard?.writeText(text).catch(() => undefined);
    showNotification({ title: 'کپی شد', message: text, type: 'info' });
  };

  const handleExportExcel = async () => {
    try {
      setExporting(true);
      await suppliersService.exportReconciliation(name);
      showNotification({
        title: 'خروجی اکسل مغایرت‌گیری',
        message: 'فایل اکسل با موفقیت آماده و دریافت شد.',
        type: 'success',
      });
    } catch {
      showNotification({
        title: 'خطا',
        message: 'دریافت فایل اکسل مغایرت‌گیری ناموفق بود.',
        type: 'error',
      });
    } finally {
      setExporting(false);
    }
  };

  const startMove = async () => {
    setMoving(true);
    setPicked([]);
    setTarget('');
    setDestName('');
    try {
      setCompanies(await suppliersService.list());
    } catch {
      setCompanies([]);
    }
  };

  const moveProducts = async () => {
    const to = (target === '__new__' ? destName : target).trim();
    if (!picked.length || !to) {
      showNotification({ title: 'جابه‌جایی', message: 'کالا و شرکت مقصد را انتخاب کنید.', type: 'warning' });
      return;
    }
    try {
      setMoveSaving(true);
      const res = await suppliersService.reassignProducts({ productIds: picked, to, from: data?.supplier });
      showNotification({
        title: 'کالاها منتقل شد',
        message: `${res.products.toLocaleString('fa-IR')} کالا به ${res.to}. ${res.movedInvoices.toLocaleString('fa-IR')} فاکتور کامل و ${res.splitInvoices.toLocaleString('fa-IR')} فاکتور مشترک جدا شد.`,
        type: 'success',
      });
      setMoving(false);
      await load();
    } catch {
      showNotification({ title: 'انتقال نشد', message: 'جابه‌جایی کالاها انجام نشد.', type: 'error' });
    } finally {
      setMoveSaving(false);
    }
  };

  const company = profile?.company;
  const title = profile ? (profile.isParent ? `حساب شرکت مادر` : company?.name ?? 'حساب شرکت') : 'حساب شرکت';

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let alive = true;
    suppliersService
      .statement(name, period.from, period.to)
      .then((s) => {
        if (alive) setStatement(s);
      })
      .catch(() => {
        if (alive) setStatement(null);
      });
    return () => {
      alive = false;
    };
  }, [name, period]);

  const { open: openInvoice, modal } = useInvoiceOpener(load);

  const handleRefresh = async (e: CustomEvent<RefresherEventDetail>) => {
    await load();
    e.detail.complete();
  };

  const s = data?.summary;
  const paidShare = s && s.creditTotal ? Math.min(100, (s.paymentsTotal / s.creditTotal) * 100) : 0;
  const maxDest = Math.max(1, ...(data?.byDestination ?? []).map((d) => d.amount));

  const months = useMemo(() => {
    const m = new Map<string, { key: string; label: string; purchases: number; payments: number; closing: number }>();
    const asc = [...(data?.timeline ?? [])].reverse();
    for (const e of asc) {
      const j = ymdToJalali(dateToYmd(new Date(e.date)));
      const key = `${j.jy}-${String(j.jm).padStart(2, '0')}`;
      if (!m.has(key)) m.set(key, { key, label: `${JALALI_MONTHS[j.jm - 1]} ${faNum(j.jy)}`, purchases: 0, payments: 0, closing: 0 });
      const r = m.get(key)!;
      if (e.kind === 'purchase') r.purchases += e.amount;
      else r.payments += e.amount;
      r.closing = e.balance;
    }
    return [...m.values()].reverse();
  }, [data]);

  return (
    <IonPage>
      <ReportHeader
        title={title}
        subtitle={data?.supplier ?? 'خرید، پرداخت‌ها و بدهی فعلی'}
        right={
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={handleExportExcel}
              disabled={exporting}
              className="flex items-center gap-1 px-2.5 py-2 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold active:scale-95 disabled:opacity-50"
              title="خروجی اکسل مغایرت‌گیری"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span className="hidden sm:inline">اکسل مغایرت</span>
            </button>
            <button
              onClick={() => navigate(`/deposits-report${data ? `?name=${encodeURIComponent(data.supplier)}` : ''}`)}
              className="p-2 rounded-2xl bg-slate-100 text-slate-700 active:scale-95"
              aria-label="گزارش واریزی‌ها و PDF"
              title="گزارش واریزی‌ها و PDF"
            >
              <FileDown className="w-4 h-4" />
            </button>
            <button
              onClick={() => setSheet({ payment: null })}
              className="flex items-center gap-1 px-3 py-2 rounded-2xl bg-emerald-600 text-white text-[11px] font-bold active:scale-95"
            >
              <Plus className="w-4 h-4" /> ثبت پرداخت
            </button>
          </div>
        }
      />

      <IonContent fullscreen className="bg-slate-50">
        <IonRefresher slot="fixed" onIonRefresh={handleRefresh}>
          <IonRefresherContent />
        </IonRefresher>

        <div className="p-3 space-y-3 max-w-2xl mx-auto pb-8">
          {error && <div className="text-xs text-rose-700 bg-rose-50 rounded-2xl p-3">{error}</div>}

          <div className="rounded-2xl p-4 text-white bg-gradient-to-br from-rose-600 to-fuchsia-700 shadow-xl shadow-rose-700/20">
            <div className="flex items-center gap-2 text-rose-100 text-xs">
              <Building2 className="w-4 h-4" />
              {s && s.prepaid > 0 ? 'طلب شما از شرکت (پیش‌پرداخت)' : 'بدهی فعلی به شرکت'}
            </div>
            <div className="mt-2 text-3xl font-bold">
              <Toman value={s ? (s.prepaid > 0 ? s.prepaid : s.debt) : null} unitClassName="text-sm font-normal text-rose-100" />
            </div>
            <div className="mt-3 h-2 rounded-full bg-white/20 overflow-hidden">
              <div className="h-full bg-white rounded-full" style={{ width: `${paidShare}%` }} />
            </div>
            <div className="flex justify-between mt-1.5 text-[10px] text-rose-100">
              <span>
                پرداخت‌شده {percent(paidShare)} از خریدهای نسیه
              </span>
              <span>{num(s?.openInvoices)} فاکتور باز</span>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-white/15 text-[11px]">
              <div>
                <div className="text-rose-100 text-[10px]">کل خرید از شرکت</div>
                <div className="font-bold mt-0.5">
                  <Toman value={s?.purchasesTotal} unitClassName="text-[10px] font-normal text-rose-100" />
                </div>
              </div>
              <div className="text-left">
                <div className="text-rose-100 text-[10px]">کل پرداختی من</div>
                <div className="font-bold mt-0.5">
                  <Toman value={s?.totalPaid} unitClassName="text-[10px] font-normal text-rose-100" />
                </div>
              </div>
            </div>
          </div>

          {data?.purchaseChannels && (
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ['جمع خرید', data.purchaseChannels.shop.amount + data.purchaseChannels.factory.amount, data.purchaseChannels.shop.kg + data.purchaseChannels.factory.kg, 'bg-white border-slate-100 text-slate-800'],
                  ['رسیده به دفتر', data.purchaseChannels.shop.amount, data.purchaseChannels.shop.kg, 'bg-white border-sky-100 text-sky-950'],
                  ['از کارخانه', data.purchaseChannels.factory.amount, data.purchaseChannels.factory.kg, 'bg-white border-amber-100 text-amber-950'],
                ] as const
              ).map(([label, amount, kg, tone]) => (
                <div key={label} className={`rounded-2xl border p-2.5 ${tone}`}>
                  <div className="text-[11px] font-bold">{label}</div>
                  <div className="text-[13px] font-bold font-mono mt-1">{formatToman(amount)}</div>
                  <div className="text-[10px] mt-0.5 text-slate-400">{tons(kg)} تن</div>
                </div>
              ))}
            </div>
          )}

          <div className="bg-white rounded-2xl border border-emerald-100 p-3 shadow-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-800">خروجی اکسل مغایرت‌گیری</div>
                <div className="text-[10px] text-slate-400 truncate">
                  ریز اسناد خرید، مبالغ واریز و مانده تجمعی جهت تطبیق با حسابداری شرکت
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={exporting}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold active:scale-95 shrink-0 transition shadow-xs disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{exporting ? 'در حال دریافت…' : 'دریافت اکسل'}</span>
            </button>
          </div>

          {company && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-800">{company.name}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5 space-x-reverse space-x-2">
                    {company.contactName && <span>رابط: {company.contactName}</span>}
                    {company.phone && (
                      <a href={`tel:${company.phone}`} className="text-sky-600 font-mono" dir="ltr">
                        {company.phone}
                      </a>
                    )}
                    {!company.contactName && !company.phone && <span>اطلاعات تماس ثبت نشده</span>}
                  </div>
                  {company.address && <div className="text-[10px] text-slate-400 mt-0.5">{company.address}</div>}
                </div>
                <button onClick={() => setEditCompany(true)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-sky-50 text-sky-700 text-[11px] font-bold shrink-0">
                  <Pencil className="w-3.5 h-3.5" /> {profile?.registered ? 'ویرایش' : 'ثبت شرکت'}
                </button>
              </div>
              {company.accounts.length > 0 ? (
                <div className="space-y-1.5">
                  {company.accounts.map((a, i) => (
                    <div key={i} className="rounded-2xl bg-slate-50 px-3 py-2">
                      <div className="text-[11px] font-bold text-slate-700">
                        {a.holder || 'بدون نام'}
                        {a.bank && <span className="text-slate-400 font-normal"> · {a.bank}</span>}
                      </div>
                      {[a.cardNumber, a.iban, a.accountNumber].filter(Boolean).map((no) => (
                        <button key={no} onClick={() => copy(no)} className="flex items-center gap-1 text-[10px] font-mono text-slate-500 mt-0.5" dir="ltr">
                          <Copy className="w-3 h-3" /> {formatAccountNumber(no)}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[10px] text-slate-400">حساب بانکی برای این شرکت ثبت نشده. با «ویرایش» اضافه کنید.</p>
              )}
            </div>
          )}

          {profile?.isParent && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-bold text-slate-700">شرکت‌های تأمین‌کننده</div>
                <button
                  onClick={() => setNewCompany(true)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-sky-600 text-white text-[11px] font-bold active:scale-95"
                >
                  <Plus className="w-3.5 h-3.5" /> شرکت جدید
                </button>
              </div>
              {!others ? (
                <p className="text-[10px] text-slate-400">در حال دریافت…</p>
              ) : others.length === 0 ? (
                <p className="text-[10px] text-slate-400">جز شرکت مادر، شرکتی ثبت نشده. با «شرکت جدید» تأمین‌کننده‌هایتان را اضافه کنید.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {others.map((c) => (
                    <button
                      key={c.name}
                      onClick={() => navigate(`/supplier-account?name=${encodeURIComponent(c.name)}`)}
                      className="w-full flex items-center gap-2.5 py-2.5 text-right"
                    >
                      <div className="w-8 h-8 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-bold text-slate-800 truncate">{c.name}</div>
                        <div className="text-[10px] text-slate-400 truncate">
                          {c.phone ? <span dir="ltr">{c.phone}</span> : c.contactName || 'بدون شماره'} · پرداختی {formatToman(c.paymentsTotal)}
                        </div>
                      </div>
                      <div className="text-left shrink-0">
                        <div className="text-[9px] text-slate-400">{c.prepaid > 0 ? 'طلب' : 'بدهی'}</div>
                        <div className={`text-[11px] font-bold font-mono ${c.prepaid > 0 ? 'text-emerald-600' : c.debt ? 'text-rose-600' : 'text-slate-400'}`}>
                          {formatToman(c.prepaid > 0 ? c.prepaid : c.debt)}
                        </div>
                      </div>
                      <ChevronLeft className="w-4 h-4 text-slate-300 shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <StatCard
              icon={<Truck className="w-4 h-4" />}
              tone="amber"
              title="خرید از شرکت"
              main={`${tons(s?.purchasedKg)} تن`}
              sub={`${num(s?.purchasesCount)} فاکتور`}
            />
            <StatCard
              icon={<Send className="w-4 h-4" />}
              tone="emerald"
              title="پرداخت‌های بعد از خرید"
              main={formatToman(s?.paymentsTotal)}
              sub={`${num(s?.paymentsCount)} پرداخت · آخرین ${jDate(s?.lastPaymentDate)}`}
            />
            <StatCard
              icon={<CreditCard className="w-4 h-4" />}
              tone="sky"
              title="پرداخت همان روز خرید"
              main={formatToman(s?.paidOnSpot)}
              sub="بخش نقدی فاکتورها"
            />
            <StatCard
              icon={<CalendarClock className="w-4 h-4" />}
              tone="rose"
              title="قدیمی‌ترین بدهی باز"
              main={s?.oldestOpenDate ? jDate(s.oldestOpenDate) : 'ندارد'}
              sub={s?.oldestOpenInvoice ?? ''}
            />
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3">
            <div className="text-xs font-bold text-slate-700 mb-3">به کجا پرداخت کردم</div>
            <div className="space-y-3">
              {(data?.byDestination ?? []).map((d) => (
                <div key={d.destination}>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className={`font-bold ${d.destination === 'نامشخص' ? 'text-slate-400' : 'text-slate-700'}`}>{d.destination}</span>
                    <span className="font-bold text-slate-800">
                      <Toman value={d.amount} />
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(d.amount / maxDest) * 100}%` }} />
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">
                    {num(d.count)} پرداخت · آخرین {jDate(d.lastDate)}
                    {d.accounts.length > 0 && <span className="font-mono" dir="ltr"> · {d.accounts.join('، ')}</span>}
                  </div>
                </div>
              ))}
            </div>
            {data && data.byMethod.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-slate-100">
                {data.byMethod.map((m) => (
                  <span key={m.method} className="text-[10px] bg-slate-50 text-slate-600 rounded-lg px-2 py-1">
                    {SUPPLIER_METHOD_LABELS[m.method] ?? m.method}: <b>{formatToman(m.amount)}</b> ({num(m.count)})
                  </span>
                ))}
              </div>
            )}
          </div>

          <Segments<View>
            value={view}
            onChange={setView}
            items={[
              ['payments', `پرداخت‌ها (${num(data?.payments.length ?? 0)})`],
              ['invoices', 'فاکتورهای خرید'],
              ['products', `محصولات (${num(profile?.products.length ?? 0)})`],
              ['month', 'ماهانه'],
              ['ledger', 'گردش حساب'],
            ]}
          />

          {!data ? null : view === 'payments' ? (
            <div className="space-y-2.5">
              {data.payments.length === 0 ? (
                <Empty>پرداختی ثبت نشده.</Empty>
              ) : (
                data.payments.map((p) => (
                  <button key={p._id} onClick={() => setSheet({ payment: p })} className="w-full text-right bg-white rounded-2xl border border-slate-100 shadow-sm p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-800">
                          <Toman value={p.amount} />
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {jDate(p.date)} · {SUPPLIER_METHOD_LABELS[p.method] ?? p.method}
                        </div>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0 ${p.destination ? 'bg-sky-50 text-sky-700' : 'bg-slate-100 text-slate-400'}`}>
                        {p.destination || 'مقصد نامشخص'}
                      </span>
                    </div>
                    {(p.notes || (p.rawSupplier && p.rawSupplier !== p.destination)) && (
                      <p className="text-[10px] text-slate-500 mt-1.5">{p.notes || `ثبت قبلی: ${p.rawSupplier}`}</p>
                    )}
                    {p.allocations.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {p.allocations.map((a) => (
                          <span key={a.invoiceId} className="text-[9px] bg-emerald-50 text-emerald-700 rounded-md px-1.5 py-0.5 font-mono">
                            {a.invoiceNumber}: {formatToman(a.amount)}
                          </span>
                        ))}
                      </div>
                    )}
                    {p.unallocated > 0 && <p className="text-[10px] text-amber-700 mt-1.5">پیش‌پرداخت (بیش از بدهی): {formatToman(p.unallocated)}</p>}
                  </button>
                ))
              )}
            </div>
          ) : view === 'invoices' ? (
            <div className="space-y-2.5">
              <div className="flex gap-1.5">
                {(
                  [
                    ['all', 'همه'],
                    ['shop', 'رسیده به دفتر'],
                    ['factory', 'از کارخانه'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setChannel(id)}
                    className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border ${channel === id ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {data.invoices
                .filter((i) => channel === 'all' || (i.fulfillment || 'shop') === channel)
                .map((i) => {
                const share = i.credit ? Math.min(100, (i.paid / i.credit) * 100) : 100;
                return (
                  <button key={i.invoiceId} onClick={() => openInvoice(i.invoiceId)} className="w-full text-right bg-white rounded-2xl border border-slate-100 shadow-sm p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-slate-400" />
                          <span className="font-mono">{i.invoiceNumber}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {jDate(i.date)} · {i.fulfillment === 'factory' ? 'کارخانه' : 'دفتر'} · {num(i.kg)} کیلو · <Toman value={i.amount} />
                        </div>
                      </div>
                      {i.remaining > 0 ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0 bg-rose-50 text-rose-600 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {num(i.ageDays)} روز
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0 bg-emerald-50 text-emerald-700 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> {i.settledAt ? jDate(i.settledAt) : 'نقدی'}
                        </span>
                      )}
                    </div>
                    {i.credit > 0 && (
                      <>
                        <div className="mt-2.5 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${share}%` }} />
                        </div>
                        <div className="flex justify-between text-[10px] mt-1">
                          <span className="text-emerald-700">
                            پرداخت‌شده <b>{formatToman(i.paid)}</b>
                          </span>
                          {i.remaining > 0 && (
                            <span className="text-rose-600">
                              مانده <b>{formatToman(i.remaining)}</b>
                            </span>
                          )}
                        </div>
                      </>
                    )}
                    {i.upfront > 0 && <div className="text-[10px] text-slate-400 mt-1">پرداخت همان روز: {formatToman(i.upfront)}</div>}
                  </button>
                );
              })}
            </div>
          ) : view === 'products' ? (
            <div className="space-y-2.5">
              {!!profile?.products.length && (
                <div className="bg-white rounded-2xl border border-slate-100 p-3 space-y-2">
                  {!moving ? (
                    <button onClick={startMove} className="w-full py-2.5 rounded-xl bg-sky-50 text-sky-800 text-xs font-bold border border-sky-100">
                      جابه‌جایی به شرکت دیگر
                    </button>
                  ) : (
                    <>
                      <p className="text-[11px] text-slate-500 leading-5">کالاهایی که اشتباه زیر این شرکت آمده‌اند را انتخاب کنید. اگر شرکت مقصد هنوز نیست، نامش را بنویسید تا ساخته شود.</p>
                      <select value={target} onChange={(e) => setTarget(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs">
                        <option value="">شرکت مقصد</option>
                        {companies
                          .filter((c) => c.name !== data?.supplier)
                          .map((c) => (
                            <option key={c.name} value={c.name}>
                              {c.name}
                            </option>
                          ))}
                        <option value="__new__">شرکت جدید…</option>
                      </select>
                      {target === '__new__' && (
                        <input
                          value={destName}
                          onChange={(e) => setDestName(e.target.value)}
                          placeholder="نام شرکت جدید"
                          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs"
                        />
                      )}
                      <div className="flex gap-2">
                        <button onClick={() => setMoving(false)} className="flex-1 py-2 rounded-xl border border-slate-200 text-xs text-slate-600">
                          انصراف
                        </button>
                        <button
                          onClick={moveProducts}
                          disabled={moveSaving || !picked.length}
                          className="flex-1 py-2 rounded-xl bg-sky-600 text-white text-xs font-bold disabled:opacity-40"
                        >
                          {moveSaving ? 'در حال انتقال…' : `انتقال ${picked.length.toLocaleString('fa-IR')} کالا`}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
              {!profile?.products.length ? (
                <Empty>محصولی از این شرکت خریداری یا به آن متصل نشده.</Empty>
              ) : (
                profile.products.map((p) => (
                  <div key={p.productId} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3">
                    <div className="flex items-start justify-between gap-2">
                      {moving && (
                        <input
                          type="checkbox"
                          checked={picked.includes(p.productId)}
                          onChange={() =>
                            setPicked((prev) => (prev.includes(p.productId) ? prev.filter((id) => id !== p.productId) : [...prev, p.productId]))
                          }
                          className="mt-1"
                        />
                      )}
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <Package className="w-3.5 h-3.5 text-slate-400" />
                          <span className="truncate">{p.name}</span>
                          {p.isDefault && <span className="text-[9px] bg-sky-50 text-sky-700 px-1.5 py-0.5 rounded-md shrink-0">تأمین‌کننده اصلی</span>}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {p.invoices ? `${num(p.invoices)} خرید · آخرین ${jDate(p.lastDate)}` : 'هنوز خریدی ثبت نشده'}
                          {p.stock !== null && ` · موجودی ${num(p.stock)} ${p.unit}`}
                        </div>
                      </div>
                      {p.amount > 0 && (
                        <div className="text-left shrink-0">
                          <div className="text-[11px] font-bold text-slate-800">{formatToman(p.amount)}</div>
                          <div className="text-[10px] text-slate-400">{num(p.kg)} کیلو</div>
                        </div>
                      )}
                    </div>
                    {p.invoices > 0 && (
                      <div className="grid grid-cols-3 gap-1.5 mt-2.5 text-center">
                        <div className="bg-slate-50 rounded-xl py-1.5">
                          <div className="text-[9px] text-slate-400">آخرین فی</div>
                          <div className="text-[10px] font-bold font-mono text-slate-700">{toman(p.lastUnitPrice)}</div>
                        </div>
                        <div className="bg-slate-50 rounded-xl py-1.5">
                          <div className="text-[9px] text-slate-400">آخرین کیلویی</div>
                          <div className="text-[10px] font-bold font-mono text-slate-700">{toman(p.lastPricePerKg)}</div>
                        </div>
                        <div className="bg-slate-50 rounded-xl py-1.5">
                          <div className="text-[9px] text-slate-400">میانگین کیلویی</div>
                          <div className="text-[10px] font-bold font-mono text-slate-700">{toman(p.avgPricePerKg)}</div>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          ) : view === 'month' ? (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm divide-y divide-slate-100">
              {months.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">گردشی ثبت نشده.</div>
              ) : (
                months.map((m) => (
                  <div key={m.key} className="px-3.5 py-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700">{m.label}</span>
                      <span className="text-[11px] text-slate-500">
                        مانده پایان ماه <b className="text-rose-600">{formatToman(m.closing)}</b>
                      </span>
                    </div>
                    <div className="flex justify-between mt-1.5 text-[10px]">
                      <span className="text-amber-700">خرید نسیه {formatToman(m.purchases)}</span>
                      <span className="text-emerald-700">پرداخت {formatToman(m.payments)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold text-slate-800">دفتر معین</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">خرید نسیه بستانکار است و پرداخت بدهکار</div>
                  </div>
                  <PeriodPicker value={period} onChange={setPeriod} />
                </div>
                {statement && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      {(
                        [
                          ['مانده تا قبل از بازه', statement.opening],
                          ['گردش بازه', statement.period],
                          ['مانده تا پایان بازه', statement.closing],
                        ] as const
                      ).map(([label, side]) => (
                        <div key={label} className={`rounded-xl border p-2.5 ${label === 'گردش بازه' ? 'col-span-2' : ''} border-slate-100 bg-slate-50`}>
                          <div className="text-[10px] text-slate-500">{label}</div>
                          {label === 'گردش بازه' ? (
                            <div className="flex justify-between mt-1 text-[12px] font-bold">
                              <span className="text-rose-700">بستانکار {formatToman(side.credit)}</span>
                              <span className="text-emerald-700">بدهکار {formatToman(side.debit)}</span>
                            </div>
                          ) : (
                            <div className={`text-[12px] font-bold mt-1 ${side.credit > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                              {side.credit > 0 ? `بستانکار ${formatToman(side.credit)}` : side.debit > 0 ? `بدهکار ${formatToman(side.debit)}` : 'تسویه'}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-bold text-slate-700">کالاهای خریداری‌شده در همین بازه</div>
                      {statement.products.length === 0 ? (
                        <p className="text-[11px] text-slate-400">در این بازه خریدی از این شرکت نیست.</p>
                      ) : (
                        statement.products.map((p) => (
                          <div key={p.productId} className="flex items-center justify-between gap-2 py-1.5 border-t border-slate-100">
                            <div className="min-w-0">
                              <div className="text-[11px] font-bold text-slate-800 truncate">{p.name}</div>
                              <div className="text-[10px] text-slate-400">
                                {num(p.quantity)} {p.unit || 'عدد'} · {num(p.kg)} کیلو · {num(p.invoices)} فاکتور
                              </div>
                            </div>
                            <div className="text-[11px] font-bold text-slate-800 shrink-0">{formatToman(p.amount)}</div>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm divide-y divide-slate-100">
              {data.timeline
                .filter((e) => {
                  const day = dateToYmd(new Date(e.date));
                  if (period.from && day < period.from) return false;
                  if (period.to && day > period.to) return false;
                  return true;
                })
                .map((e) => (
                <button
                  key={`${e.kind}-${e.id}`}
                  onClick={() => (e.kind === 'purchase' ? openInvoice(e.id) : setSheet({ payment: data.payments.find((p) => p._id === e.id) ?? null }))}
                  className="w-full text-right flex items-center justify-between px-3.5 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold text-slate-700">
                      {e.kind === 'purchase' ? (
                        <>
                          خرید <span className="font-mono">{e.label}</span>
                        </>
                      ) : (
                        <>پرداخت به {e.label}</>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400">{jDate(e.date)}</div>
                  </div>
                  <div className="text-left shrink-0">
                    <div className={`text-[11px] font-bold ${e.kind === 'purchase' ? 'text-rose-600' : 'text-emerald-600'}`}>
                      <Toman value={e.kind === 'purchase' ? e.amount : -e.amount} signed />
                    </div>
                    <div className="text-[10px] text-slate-400">مانده {formatToman(e.balance)}</div>
                  </div>
                </button>
              ))}
            </div>
            </div>
          )}
        </div>
        {modal}
      </IonContent>

      {data && (
        <SupplierPaymentSheet
          open={!!sheet}
          supplier={data.supplier}
          payment={sheet?.payment ?? null}
          destinations={data.destinations}
          accounts={company?.accounts}
          debt={data.summary.debt}
          onClose={() => setSheet(null)}
          onSaved={setData}
        />
      )}
      <CompanySheet
        open={newCompany}
        company={null}
        onClose={() => setNewCompany(false)}
        onSaved={(c) => {
          setNewCompany(false);
          navigate(`/supplier-account?name=${encodeURIComponent(c.name)}`);
        }}
      />
      <CompanySheet
        open={editCompany}
        company={company ? { ...company, _id: profile?.registered ? company._id : null } : null}
        lockName={profile?.isParent}
        onClose={() => setEditCompany(false)}
        onSaved={(c) => {
          setEditCompany(false);
          if (c.name !== name && (name || !profile?.isParent)) navigate(`/supplier-account?name=${encodeURIComponent(c.name)}`, { replace: true });
          else load();
        }}
        onRemoved={
          profile?.isParent
            ? undefined
            : () => {
                setEditCompany(false);
                navigate('/suppliers', { replace: true });
              }
        }
      />
    </IonPage>
  );
};
