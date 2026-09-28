import React, { useCallback, useEffect, useState } from 'react';
import { IonPage, IonContent, IonRefresher, IonRefresherContent } from '@ionic/react';
import type { RefresherEventDetail } from '@ionic/react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, History, KeyRound, Pencil, Phone, ShieldCheck, UserPlus, UserX } from 'lucide-react';
import { usersService, ROLE_LABELS } from '../services/users.service';
import type { AppUser, UserInput, UserRole } from '../services/users.service';
import { auditService } from '../services/audit.service';
import { apiErrorMessage } from '../services/invoices.service';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { ReportHeader, Segments } from '../components/reports/ReportUI';
import { Sheet } from '../components/ui/Sheet';
import { formatJalaliIso } from '../lib/jalali';
import { num } from '../lib/format';

const ROLE_HELP: Record<UserRole, string> = {
  admin: 'دسترسی کامل: ساخت حساب برای دیگران، دیدن گزارش رویدادها و تنظیمات',
  marketer: 'کار روزانه: فروش، مشتری، فاکتور و گزارش‌ها؛ بدون مدیریت کاربران و لاگ',
};

const inputCls = 'w-full px-4 py-3 rounded-2xl border border-slate-200 text-sm focus:outline-none focus:border-sky-400 bg-white';

const Field: React.FC<{ label: string; children: React.ReactNode; hint?: string }> = ({ label, children, hint }) => (
  <div>
    <label className="text-xs font-bold text-slate-700 block mb-1.5">{label}</label>
    {children}
    {hint && <p className="text-[10px] text-slate-400 mt-1">{hint}</p>}
  </div>
);

interface FormState {
  fullName: string;
  username: string;
  password: string;
  phoneNumber: string;
  role: UserRole;
  isActive: boolean;
}

const emptyForm: FormState = { fullName: '', username: '', password: '', phoneNumber: '', role: 'marketer', isActive: true };

const UserSheet: React.FC<{ user: AppUser | null; open: boolean; selfId?: string; onClose: () => void; onSaved: () => void }> = ({
  user,
  open,
  selfId,
  onClose,
  onSaved,
}) => {
  const { showNotification } = useNotification();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const isSelf = !!user && user._id === selfId;

  useEffect(() => {
    if (!open) return;
    setForm(
      user
        ? { fullName: user.fullName, username: user.username, password: '', phoneNumber: user.phoneNumber || '', role: user.role, isActive: user.isActive }
        : emptyForm,
    );
  }, [open, user]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const valid = form.fullName.trim() && form.username.trim() && (user ? !form.password || form.password.length >= 6 : form.password.length >= 6);

  const save = async () => {
    try {
      setSaving(true);
      if (user) {
        const input: UserInput = { fullName: form.fullName.trim(), username: form.username.trim(), phoneNumber: form.phoneNumber.trim() };
        if (!isSelf) {
          input.role = form.role;
          input.isActive = form.isActive;
        }
        if (form.password) input.password = form.password;
        await usersService.update(user._id, input);
      } else {
        await usersService.create({
          fullName: form.fullName.trim(),
          username: form.username.trim(),
          password: form.password,
          phoneNumber: form.phoneNumber.trim() || undefined,
          role: form.role,
        });
      }
      showNotification({ title: user ? 'ذخیره شد' : 'حساب ساخته شد', message: `${form.fullName} — نام کاربری ${form.username}`, type: 'success' });
      onSaved();
      onClose();
    } catch (err) {
      showNotification({ title: 'خطا', message: apiErrorMessage(err, 'ذخیره نشد'), type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={user ? `ویرایش ${user.fullName}` : 'ساخت حساب جدید'}
      subtitle={user ? `@${user.username}` : 'برای همکار یا کارمند خود حساب جداگانه بسازید'}
      footer={
        <button onClick={save} disabled={!valid || saving} className="w-full py-3 rounded-2xl bg-sky-600 text-white text-sm font-bold disabled:opacity-40 active:scale-[0.98]">
          {saving ? 'در حال ذخیره…' : user ? 'ذخیره تغییرات' : 'ساخت حساب'}
        </button>
      }
    >
      <Field label="نام و نام خانوادگی">
        <input value={form.fullName} onChange={(e) => set('fullName', e.target.value)} className={inputCls} />
      </Field>
      <Field label="نام کاربری" hint="با این نام وارد اپ می‌شود (حروف انگلیسی)">
        <input value={form.username} onChange={(e) => set('username', e.target.value.toLowerCase())} className={inputCls} dir="ltr" autoCapitalize="none" />
      </Field>
      <Field label={user ? 'رمز عبور جدید (اختیاری)' : 'رمز عبور'} hint="حداقل ۶ کاراکتر">
        <input type="password" value={form.password} onChange={(e) => set('password', e.target.value)} className={inputCls} dir="ltr" autoComplete="new-password" />
      </Field>
      <Field label="شماره تلفن">
        <input value={form.phoneNumber} onChange={(e) => set('phoneNumber', e.target.value)} className={inputCls} dir="ltr" inputMode="tel" />
      </Field>
      <Field label="نقش" hint={isSelf ? 'نقش و وضعیت حساب خودتان را نمی‌توانید تغییر دهید' : ROLE_HELP[form.role]}>
        <div className={isSelf ? 'opacity-50 pointer-events-none' : ''}>
          <Segments<UserRole> value={form.role} onChange={(v) => set('role', v)} items={[['marketer', ROLE_LABELS.marketer], ['admin', ROLE_LABELS.admin]]} />
        </div>
      </Field>
      {user && !isSelf && (
        <label className="flex items-center justify-between bg-slate-50 rounded-2xl px-4 py-3">
          <span className="text-xs font-bold text-slate-700">حساب فعال است</span>
          <input type="checkbox" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} className="w-5 h-5 accent-sky-600" />
        </label>
      )}
    </Sheet>
  );
};

const MyPassword: React.FC = () => {
  const { showNotification } = useNotification();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [saving, setSaving] = useState(false);
  const mismatch = !!repeat && next !== repeat;

  const save = async () => {
    try {
      setSaving(true);
      const res = await usersService.changeMyPassword(current, next);
      showNotification({ title: 'انجام شد', message: res.message, type: 'success' });
      setCurrent('');
      setNext('');
      setRepeat('');
    } catch (err) {
      showNotification({ title: 'خطا', message: apiErrorMessage(err, 'رمز تغییر نکرد'), type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3 space-y-3">
      <div className="flex items-center gap-2">
        <KeyRound className="w-4 h-4 text-sky-600" />
        <h3 className="text-[13px] font-extrabold text-slate-800">تغییر رمز من</h3>
      </div>
      <p className="text-[11px] text-slate-400 leading-5">همین رمز برای تأیید هر حذف در اپ پرسیده می‌شود.</p>
      <input type="password" placeholder="رمز فعلی" value={current} onChange={(e) => setCurrent(e.target.value)} className={inputCls} dir="ltr" autoComplete="current-password" />
      <input type="password" placeholder="رمز جدید (حداقل ۶ کاراکتر)" value={next} onChange={(e) => setNext(e.target.value)} className={inputCls} dir="ltr" autoComplete="new-password" />
      <input type="password" placeholder="تکرار رمز جدید" value={repeat} onChange={(e) => setRepeat(e.target.value)} className={inputCls} dir="ltr" autoComplete="new-password" />
      {mismatch && <p className="text-[11px] text-rose-600">تکرار رمز یکسان نیست</p>}
      <button
        onClick={save}
        disabled={saving || !current || next.length < 6 || next !== repeat}
        className="w-full py-3 rounded-2xl bg-slate-900 text-white text-sm font-bold disabled:opacity-40 active:scale-[0.98]"
      >
        {saving ? 'در حال ذخیره…' : 'تغییر رمز'}
      </button>
    </div>
  );
};

export const UsersPage: React.FC = () => {
  const { user: me } = useAuth();
  const navigate = useNavigate();
  const isAdmin = me?.role === 'admin';
  const [users, setUsers] = useState<AppUser[]>([]);
  const [activity, setActivity] = useState<Record<string, number>>({});
  const [editing, setEditing] = useState<AppUser | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!isAdmin) return;
    try {
      setError('');
      const [list, stats] = await Promise.all([usersService.list(), auditService.stats().catch(() => null)]);
      setUsers(list);
      setActivity(Object.fromEntries((stats?.users ?? []).map((u) => [u.userId, u.count])));
    } catch (err) {
      setError(apiErrorMessage(err, 'دریافت کاربران ناموفق بود'));
    }
  }, [isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRefresh = async (e: CustomEvent<RefresherEventDetail>) => {
    await load();
    e.detail.complete();
  };

  const openSheet = (u: AppUser | null) => {
    setEditing(u);
    setSheetOpen(true);
  };

  return (
    <IonPage>
      <ReportHeader
        title={isAdmin ? 'کاربران و دسترسی' : 'حساب من'}
        subtitle={isAdmin ? 'ساخت حساب برای همکاران، نقش و رمز' : 'تغییر رمز عبور'}
        right={
          isAdmin ? (
            <button onClick={() => openSheet(null)} className="flex items-center gap-1 px-3 py-2 rounded-2xl bg-sky-600 text-white text-[11px] font-bold active:scale-95">
              <UserPlus className="w-4 h-4" />
              حساب جدید
            </button>
          ) : undefined
        }
      />
      <IonContent fullscreen className="bg-slate-50">
        <IonRefresher slot="fixed" onIonRefresh={handleRefresh}>
          <IonRefresherContent />
        </IonRefresher>
        <div className="p-3 space-y-3 max-w-2xl mx-auto pb-8">
          {error && <div className="text-xs text-rose-700 bg-rose-50 rounded-2xl p-3">{error}</div>}

          {isAdmin &&
            users.map((u) => (
              <div key={u._id} className={`bg-white rounded-2xl border shadow-sm p-3 ${u.isActive ? 'border-slate-100' : 'border-slate-200 opacity-60'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${u.role === 'admin' ? 'bg-sky-100 text-sky-600' : 'bg-emerald-100 text-emerald-600'}`}>
                      {u.role === 'admin' ? <ShieldCheck className="w-5 h-5" /> : <Briefcase className="w-5 h-5" />}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-[13px] font-extrabold text-slate-800 truncate">
                        {u.fullName}
                        {u._id === me?.id && <span className="text-[10px] font-bold text-sky-600 mr-1.5">(شما)</span>}
                      </h3>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[10px]">
                        <span className="text-slate-400 font-mono">@{u.username}</span>
                        <span className={`px-2 py-0.5 rounded-full font-bold ${u.role === 'admin' ? 'bg-sky-100 text-sky-800' : 'bg-emerald-100 text-emerald-800'}`}>{ROLE_LABELS[u.role]}</span>
                        {!u.isActive && (
                          <span className="px-2 py-0.5 rounded-full font-bold bg-slate-200 text-slate-600 flex items-center gap-0.5">
                            <UserX className="w-3 h-3" />
                            غیرفعال
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => openSheet(u)} className="p-2 rounded-xl bg-slate-50 text-slate-600 active:scale-95">
                    <Pencil className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center justify-between mt-3 text-[10px] text-slate-400">
                  <span className="flex items-center gap-1">
                    {u.phoneNumber && (
                      <>
                        <Phone className="w-3 h-3" />
                        <span className="font-mono">{u.phoneNumber}</span> ·
                      </>
                    )}
                    عضو از {formatJalaliIso(u.createdAt)}
                  </span>
                  <button onClick={() => navigate(`/logs?userId=${u._id}`)} className="flex items-center gap-1 text-sky-700 font-bold">
                    <History className="w-3 h-3" />
                    {num(activity[u._id] ?? 0)} رویداد
                  </button>
                </div>
              </div>
            ))}

          <MyPassword />
        </div>
        <UserSheet user={editing} open={sheetOpen} selfId={me?.id} onClose={() => setSheetOpen(false)} onSaved={load} />
      </IonContent>
    </IonPage>
  );
};
