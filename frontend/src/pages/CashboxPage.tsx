import React, { useEffect, useState } from 'react';
import { IonPage, IonContent, IonRefresher, IonRefresherContent } from '@ionic/react';
import { Banknote, CreditCard, ArrowRightLeft, Pencil } from 'lucide-react';
import { cashbookService } from '../services/cashbook.service';
import type { Cashbook } from '../services/cashbook.service';
import { PeriodPicker, periodPresets } from '../components/ui/PeriodPicker';
import type { Period } from '../components/ui/PeriodPicker';
import { ReportHeader } from '../components/reports/ReportUI';
import { accountTitle } from '../components/ui/AccountPicker';
import { AmountInput } from '../components/ui/AmountInput';
import { Sheet } from '../components/ui/Sheet';
import { useSettings } from '../services/settings.service';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { apiErrorMessage } from '../services/invoices.service';
import { formatToman } from '../lib/format';

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

  const cards: { method: Drawer; label: string; hint: string; icon: typeof Banknote; tone: string }[] = [
    { method: 'cash', label: 'موجودی نقد', hint: 'صندوق مغازه', icon: Banknote, tone: 'text-emerald-700 bg-emerald-50' },
    { method: 'transfer', label: 'کارت‌به‌کارت', hint: 'واریز و حواله', icon: ArrowRightLeft, tone: 'text-violet-700 bg-violet-50' },
    { method: 'pos', label: 'پوز', hint: 'کارتخوان', icon: CreditCard, tone: 'text-sky-700 bg-sky-50' },
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
          <div className="bg-white rounded-2xl border border-slate-100 divide-y divide-slate-100">
            <div className="px-3 py-2 text-[11px] font-bold text-slate-500">واریز به کارت‌ها</div>
            {(book?.byAccount || []).length === 0 ? (
              <div className="px-3 py-4 text-xs text-slate-400">در این بازه کارت‌به‌کارتی ثبت نشده.</div>
            ) : (
              book!.byAccount.map((a) => (
                <div key={a.accountId || 'none'} className="px-3 py-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-800 truncate">
                      {a.accountId ? accountTitle(bankCards, a.accountId) : 'کارت‌به‌کارت بدون حساب'}
                    </div>
                    <div className="text-[10px] text-slate-400">{a.count.toLocaleString('fa-IR')} واریز</div>
                  </div>
                  <span className="text-xs font-extrabold font-mono text-violet-700 shrink-0">{formatToman(a.in)}</span>
                </div>
              ))
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
      </IonContent>
    </IonPage>
  );
};
