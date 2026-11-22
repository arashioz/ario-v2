import React, { useEffect, useState } from 'react';
import { IonPage, IonContent, IonRefresher, IonRefresherContent } from '@ionic/react';
import { Banknote, CreditCard, ArrowRightLeft, Pencil } from 'lucide-react';
import { cashbookService } from '../services/cashbook.service';
import type { Cashbook, UnspecifiedTransfers, UnspecifiedTransfer } from '../services/cashbook.service';
import { SOURCE_LABELS } from '../services/cashbook.service';
import { PeriodPicker, periodPresets } from '../components/ui/PeriodPicker';
import type { Period } from '../components/ui/PeriodPicker';
import { ReportHeader } from '../components/reports/ReportUI';
import { AccountPicker, accountTitle } from '../components/ui/AccountPicker';
import { AmountInput } from '../components/ui/AmountInput';
import { Sheet } from '../components/ui/Sheet';
import { useSettings } from '../services/settings.service';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { apiErrorMessage } from '../services/invoices.service';
import { formatToman } from '../lib/format';
import { formatJalaliIso as formatJalali } from '../lib/jalali';

type Drawer = 'cash' | 'pos' | 'transfer';

const DRAWER_LABEL: Record<Drawer, string> = {
  cash: 'موجودی نقد',
  transfer: 'کارت‌به‌کارت',
  pos: 'پوز',
};

const methodRow = (book: Cashbook | null, method: string) =>
  book?.byMethod?.find((m) => m.method === method) ?? { method, in: 0, out: 0, net: 0 };

export const CashboxPage: React.FC = () => {
  const { bankCards } = useSettings();
  const { user } = useAuth();
  const { showNotification } = useNotification();
  const isAdmin = user?.role === 'admin';
  const [period, setPeriod] = useState<Period>(() => periodPresets()[0]);
  const [book, setBook] = useState<Cashbook | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Drawer | null>(null);
  const [draft, setDraft] = useState(0);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [unspecOpen, setUnspecOpen] = useState(false);
  const [unspec, setUnspec] = useState<UnspecifiedTransfers | null>(null);
  const [unspecLoading, setUnspecLoading] = useState(false);
  const [picking, setPicking] = useState<Record<string, string>>({});
  const [bulkAccount, setBulkAccount] = useState('');
  const [applying, setApplying] = useState(false);

  const load = async () => {
    try {
      setError('');
      setBook(await cashbookService.cashbook(period.from, period.to));
    } catch {
      setError('صندوق خوانده نشد');
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const adjustment = (method: Drawer) => book?.adjustments?.find((a) => a.method === method);

  const openEdit = (method: Drawer) => {
    const row = methodRow(book, method);
    setEditing(method);
    setDraft(Math.max(0, Math.round(row.net)));
    setNote(adjustment(method)?.note || '');
  };

  const applyBook = (next: Cashbook) => {
    setPeriod(periodPresets()[0]);
    setBook(next);
    setEditing(null);
  };

  const saveBalance = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const next = await cashbookService.setBalance(editing, draft, note);
      applyBook(next);
      showNotification({ title: 'صندوق اصلاح شد', message: `${DRAWER_LABEL[editing]} روی ${formatToman(draft)} گذاشته شد.`, type: 'success' });
    } catch (err) {
      showNotification({ title: 'ذخیره نشد', message: apiErrorMessage(err, 'اصلاح صندوق انجام نشد'), type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const clearBalance = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const next = await cashbookService.clearBalance(editing);
      applyBook(next);
      showNotification({ title: 'اصلاح پاک شد', message: `${DRAWER_LABEL[editing]} دوباره از روی فاکتورها حساب می‌شود.`, type: 'success' });
    } catch (err) {
      showNotification({ title: 'پاک نشد', message: apiErrorMessage(err, 'حذف اصلاح انجام نشد'), type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const rowKey = (r: Pick<UnspecifiedTransfer, 'source' | 'id' | 'index'>) => `${r.source}:${r.id}:${r.index ?? ''}`;

  const refreshUnspec = async () => {
    setUnspec(await cashbookService.unspecifiedTransfers(period.from, period.to));
  };

  const openUnspec = async () => {
    setUnspecOpen(true);
    setPicking({});
    setBulkAccount('');
    setUnspecLoading(true);
    try {
      await refreshUnspec();
    } catch {
      showNotification({ title: 'خوانده نشد', message: 'لیست کارت‌به‌کارت بدون حساب باز نشد', type: 'error' });
    } finally {
      setUnspecLoading(false);
    }
  };

  const afterAssign = async () => {
    await load();
    await refreshUnspec();
  };

  const assignRow = async (r: UnspecifiedTransfer) => {
    const accountId = picking[rowKey(r)];
    if (!accountId) return;
    setApplying(true);
    try {
      await cashbookService.assignTransfer({ source: r.source, id: r.id, index: r.index }, accountId);
      setPicking((p) => {
        const c = { ...p };
        delete c[rowKey(r)];
        return c;
      });
      await afterAssign();
      showNotification({ title: 'کارت تخصیص یافت', message: `${r.title} به «${accountTitle(bankCards, accountId)}» وصل شد.`, type: 'success' });
    } catch (err) {
      showNotification({ title: 'ثبت نشد', message: apiErrorMessage(err, 'تخصیص کارت انجام نشد'), type: 'error' });
    } finally {
      setApplying(false);
    }
  };

  const assignAll = async () => {
    if (!bulkAccount) return;
    setApplying(true);
    try {
      await cashbookService.assignAllTransfers(period.from, period.to, bulkAccount);
      setPicking({});
      await afterAssign();
      showNotification({ title: 'واریزها منتقل شدند', message: `همه کارت‌به‌کارت‌های بدون حساب این بازه به «${accountTitle(bankCards, bulkAccount)}» وصل شدند.`, type: 'success' });
    } catch (err) {
      showNotification({ title: 'انتقال نشد', message: apiErrorMessage(err, 'انتقال دسته‌جمعی انجام نشد'), type: 'error' });
    } finally {
      setApplying(false);
    }
  };

  const cards: { method: Drawer; label: string; hint: string; icon: typeof Banknote; tone: string }[] = [
    { method: 'cash', label: 'موجودی نقد', hint: 'صندوق مغازه', icon: Banknote, tone: 'text-emerald-700 bg-emerald-50' },
    { method: 'transfer', label: 'کارت‌به‌کارت', hint: 'واریز و حواله', icon: ArrowRightLeft, tone: 'text-violet-700 bg-violet-50' },
    { method: 'pos', label: 'پوز', hint: 'فقط امروز؛ روزهای قبل به حساب اصلی رفته', icon: CreditCard, tone: 'text-sky-700 bg-sky-50' },
  ];
  const total = cards.reduce((s, c) => s + methodRow(book, c.method).net, 0);
  const allTime = !period.from && !period.to;

  return (
    <IonPage>
      <ReportHeader title="صندوق" subtitle="موجودی نقد، کارت‌به‌کارت و پوز" right={<PeriodPicker value={period} onChange={setPeriod} />} />
      <IonContent fullscreen className="bg-slate-50">
        <IonRefresher slot="fixed" onIonRefresh={(e) => load().finally(() => e.detail.complete())}>
          <IonRefresherContent />
        </IonRefresher>
        <div className="p-3 space-y-3 max-w-md mx-auto pb-8">
          {error && <div className="text-xs text-rose-700 bg-rose-50 rounded-2xl p-3">{error}</div>}
          <div className="rounded-2xl bg-slate-900 text-white p-4">
            <div className="text-[11px] text-slate-300">جمع این سه موجودی · {period.label}</div>
            <div className={`mt-1 text-2xl font-black font-mono ${total < 0 ? 'text-rose-300' : ''}`}>{formatToman(total)}</div>
          </div>
          <div className="grid grid-cols-1 gap-2">
            {cards.map((c) => {
              const row = methodRow(book, c.method);
              const fix = adjustment(c.method);
              return (
              <div key={c.method} className="bg-white rounded-2xl border border-slate-100 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${c.tone}`}>
                      <c.icon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-800">{c.label}</div>
                      <div className="text-[10px] text-slate-400">{c.hint}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`text-sm font-extrabold font-mono ${row.net < 0 ? 'text-rose-600' : 'text-slate-800'}`}>
                      {formatToman(row.net)}
                    </span>
                    {isAdmin && allTime && (
                      <button
                        type="button"
                        onClick={() => openEdit(c.method)}
                        className="w-8 h-8 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center"
                        title="اصلاح موجودی"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                {allTime && fix && fix.amount !== 0 && (
                  <div className="mt-2 text-[10px] text-amber-800 bg-amber-50 rounded-xl px-2 py-1.5 leading-5">
                    این عدد دستی اصلاح شده{fix.note ? `: ${fix.note}` : ''}.
                  </div>
                )}
                <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
                  <div className="rounded-xl bg-emerald-50 text-emerald-800 px-2 py-1.5">
                    <div className="text-emerald-600">ورود</div>
                    <div className="font-mono font-bold">{formatToman(row.in)}</div>
                  </div>
                  <div className="rounded-xl bg-rose-50 text-rose-800 px-2 py-1.5">
                    <div className="text-rose-600">خروج</div>
                    <div className="font-mono font-bold">{formatToman(row.out)}</div>
                  </div>
                </div>
              </div>
              );
            })}
          </div>
          <div className="bg-white rounded-2xl border border-sky-100 p-3 space-y-2">
            <div className="text-[11px] font-bold text-sky-800">مطابقت کارتخوان امروز</div>
            <p className="text-[10px] text-slate-500 leading-5">
              این عدد را با گزارش امروز اپ کارتخوان مقایسه کنید. پایان هر روز، مانده پوز خودش صفر می‌شود و به{' '}
              {book?.mainAccountId ? accountTitle(bankCards, book.mainAccountId) : 'حساب اصلی'} می‌رود.
            </p>
            <div className="grid grid-cols-3 gap-2 text-[10px]">
              <div className="rounded-xl bg-emerald-50 text-emerald-800 px-2 py-1.5">
                <div>ورود امروز</div>
                <div className="font-mono font-bold">{formatToman(book?.posToday?.in || 0)}</div>
              </div>
              <div className="rounded-xl bg-rose-50 text-rose-800 px-2 py-1.5">
                <div>خروج امروز</div>
                <div className="font-mono font-bold">{formatToman(book?.posToday?.out || 0)}</div>
              </div>
              <div className="rounded-xl bg-sky-50 text-sky-800 px-2 py-1.5">
                <div>مانده امروز</div>
                <div className="font-mono font-bold">{formatToman(book?.posToday?.net || 0)}</div>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 divide-y divide-slate-100">
            <div className="px-3 py-2 text-[11px] font-bold text-slate-500">لاگ تسویه پوز به حساب اصلی</div>
            {(book?.posSettlements || []).length === 0 ? (
              <div className="px-3 py-4 text-xs text-slate-400">در این بازه تسویه‌ای ثبت نشده.</div>
            ) : (
              book!.posSettlements.slice(0, 30).map((s) => (
                <div key={s.date} className="px-3 py-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-800">{formatJalali(s.date)}</div>
                    <div className="text-[10px] text-slate-400">
                      {s.amount >= 0 ? 'واریز به حساب اصلی' : 'برداشت از حساب اصلی'}
                    </div>
                  </div>
                  <span className={`text-xs font-extrabold font-mono shrink-0 ${s.amount >= 0 ? 'text-violet-700' : 'text-rose-600'}`}>
                    {formatToman(s.amount)}
                  </span>
                </div>
              ))
            )}
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 divide-y divide-slate-100">
            <div className="px-3 py-2 text-[11px] font-bold text-slate-500">واریز به کارت‌ها</div>
            {(book?.byAccount || []).length === 0 ? (
              <div className="px-3 py-4 text-xs text-slate-400">در این بازه کارت‌به‌کارتی ثبت نشده.</div>
            ) : (
              book!.byAccount.map((a) => {
                const none = !a.accountId;
                const rowInner = (
                  <>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-800 truncate">
                        {none ? 'کارت‌به‌کارت بدون حساب' : accountTitle(bankCards, a.accountId)}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {a.count.toLocaleString('fa-IR')} واریز{none && isAdmin ? ' · برای تخصیص بزنید' : ''}
                      </div>
                    </div>
                    <span className={`text-xs font-extrabold font-mono shrink-0 ${none ? 'text-rose-600' : 'text-violet-700'}`}>
                      {formatToman(a.in)}
                    </span>
                  </>
                );
                return none && isAdmin ? (
                  <button key="none" type="button" onClick={openUnspec} className="w-full px-3 py-2.5 flex items-center justify-between gap-2 bg-amber-50/70 text-right active:bg-amber-100">
                    {rowInner}
                  </button>
                ) : (
                  <div key={a.accountId} className="px-3 py-2.5 flex items-center justify-between gap-2">
                    {rowInner}
                  </div>
                );
              })
            )}
          </div>
        </div>
        <Sheet
          open={!!editing}
          title={editing ? `اصلاح ${DRAWER_LABEL[editing]}` : ''}
          subtitle="موجودی واقعی همین الان. فاکتورها دست نمی‌خورند."
          onClose={() => !saving && setEditing(null)}
          footer={
            <div className="flex gap-2">
              {editing && adjustment(editing) && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={clearBalance}
                  className="px-3 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold disabled:opacity-50"
                >
                  برگشت به محاسبه
                </button>
              )}
              <button
                type="button"
                disabled={saving}
                onClick={saveBalance}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold disabled:opacity-50"
              >
                {saving ? 'در حال ذخیره…' : 'ذخیره موجودی'}
              </button>
            </div>
          }
        >
          <label className="block text-xs font-bold text-slate-700 mb-1">موجودی واقعی</label>
          <AmountInput value={draft} onChange={setDraft} autoFocus />
          <label className="block text-xs font-bold text-slate-700 mt-3 mb-1">توضیح</label>
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="مثلاً: شمارش صندوق"
            className="w-full px-3 py-2.5 rounded-2xl border border-slate-200 text-xs focus:outline-none focus:border-sky-500"
          />
        </Sheet>
        <Sheet
          open={unspecOpen}
          title="کارت‌به‌کارت بدون حساب"
          subtitle="این واریزها ثبت نشده پول به کدام کارت رسیده. کارت درست را انتخاب و وصل کنید."
          onClose={() => !applying && setUnspecOpen(false)}
          tall
        >
          {unspecLoading ? (
            <div className="py-8 text-center text-xs text-slate-400">در حال بارگذاری…</div>
          ) : !unspec || unspec.rows.length === 0 ? (
            <div className="py-10 text-center text-sm text-emerald-700 bg-emerald-50 rounded-2xl">
              همه واریزهای این بازه به کارت مشخص وصل‌اند. 🎉
            </div>
          ) : (
            <div className="space-y-3">
              {isAdmin && (
                <div className="rounded-2xl border border-sky-100 bg-sky-50/60 p-3 space-y-2">
                  <div className="text-[11px] font-bold text-sky-800">
                    انتقال دسته‌جمعی · {unspec.count.toLocaleString('fa-IR')} مورد · {formatToman(unspec.total)}
                  </div>
                  <AccountPicker value={bulkAccount} onChange={setBulkAccount} label="همه را بریز به این کارت" />
                  <button
                    type="button"
                    disabled={applying || !bulkAccount}
                    onClick={assignAll}
                    className="w-full py-2.5 rounded-xl bg-sky-600 text-white text-xs font-bold disabled:opacity-50"
                  >
                    {applying ? 'در حال انتقال…' : 'وصل کردن همه به این کارت'}
                  </button>
                </div>
              )}
              <div className="divide-y divide-slate-100 rounded-2xl border border-slate-100 bg-white">
                {unspec.rows.map((r) => {
                  const key = rowKey(r);
                  const picked = picking[key] || '';
                  return (
                    <div key={key} className="p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-800 truncate">{r.title}</div>
                          <div className="text-[10px] text-slate-400">
                            {formatJalali(r.date)}
                            {r.ref ? ` · ${r.ref}` : ''}
                          </div>
                          <span className="inline-block mt-1 text-[10px] font-bold text-violet-700 bg-violet-50 rounded-lg px-2 py-0.5">
                            {SOURCE_LABELS[r.source]}
                          </span>
                        </div>
                        <span className="text-xs font-extrabold font-mono text-rose-600 shrink-0">{formatToman(r.amount)}</span>
                      </div>
                      {isAdmin && (
                        <>
                          <AccountPicker
                            value={picked}
                            onChange={(id) => setPicking((p) => ({ ...p, [key]: id }))}
                            label="کارت مقصد این واریز"
                          />
                          <button
                            type="button"
                            disabled={applying || !picked}
                            onClick={() => assignRow(r)}
                            className="w-full py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold disabled:opacity-50"
                          >
                            {applying ? 'در حال ثبت…' : 'وصل کردن این واریز'}
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
              {!isAdmin && <p className="text-[10px] text-slate-400 text-center">فقط مدیر می‌تواند کارت مقصد را مشخص کند.</p>}
            </div>
          )}
        </Sheet>
      </IonContent>
    </IonPage>
  );
};
