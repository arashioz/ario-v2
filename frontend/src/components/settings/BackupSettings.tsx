import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, DatabaseBackup, Download, FileSpreadsheet, Loader2, Trash2 } from 'lucide-react';
import { backupService, type BackupFile } from '../../services/backup.service';
import { apiErrorMessage } from '../../services/invoices.service';
import { settingsService, type BackupSettings as BackupPrefs } from '../../services/settings.service';
import { useNotification } from '../../context/NotificationContext';
import { JalaliDateField } from '../ui/JalaliDatePicker';
import { addDaysYmd, faNum, formatJalali, formatJalaliIso, todayYmd } from '../../lib/jalali';

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const KEEP = [7, 14, 30, 60, 90];

const size = (b: number) => (b >= 1024 * 1024 ? `${faNum((b / 1024 / 1024).toFixed(1))} مگ` : `${faNum(Math.max(1, Math.round(b / 1024)))} کیلو`);
/** The day a file covers is in its name (an invoice export is written the morning after). */
const fileDay = (name: string) => /\d{4}-\d{2}-\d{2}/.exec(name)?.[0];
const time = (iso: string) => faNum(new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));

const select = 'px-2 py-1.5 rounded-xl bg-slate-100 text-xs font-bold text-slate-700 focus:outline-none disabled:opacity-50';

export const BackupSettings: React.FC<{ prefs: BackupPrefs; isAdmin: boolean }> = ({ prefs, isAdmin }) => {
  const { showNotification } = useNotification();
  const [files, setFiles] = useState<BackupFile[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [day, setDay] = useState(() => addDaysYmd(todayYmd(), -1));

  const load = useCallback(() => {
    if (!isAdmin) return;
    backupService
      .status()
      .then((s) => {
        setFiles(s.files);
        setLastError(s.lastError);
      })
      .catch(() => undefined);
  }, [isAdmin]);

  useEffect(load, [load]);

  const fail = (title: string) => (err: unknown) =>
    showNotification({ title, message: apiErrorMessage(err, 'دوباره تلاش کنید'), type: 'error' });

  const task = async (key: string, fn: () => Promise<unknown>, errorTitle: string) => {
    setBusy(key);
    try {
      await fn();
    } catch (err) {
      fail(errorTitle)(err);
    } finally {
      setBusy(null);
    }
  };

  const setPrefs = (patch: Partial<BackupPrefs>) => settingsService.update({ backup: patch }).catch(fail('ذخیره نشد'));

  const runNow = () =>
    task(
      'run',
      async () => {
        const f = await backupService.run();
        showNotification({ title: 'نسخه پشتیبان گرفته شد', message: size(f.size), type: 'success' });
        load();
      },
      'پشتیبان گرفته نشد',
    );

  const remove = (name: string) =>
    task(
      `del:${name}`,
      async () => {
        await backupService.remove(name);
        load();
      },
      'حذف نشد',
    );

  if (!isAdmin) return <p className="text-[11px] text-slate-400 py-2">فقط مدیر به پشتیبان‌ها دسترسی دارد.</p>;

  const latest = files.find((f) => f.kind === 'backup');

  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-slate-50 p-2.5 flex items-center gap-2.5">
        <DatabaseBackup className={`w-5 h-5 shrink-0 ${latest ? 'text-emerald-600' : 'text-slate-400'}`} />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold text-slate-700">{latest ? 'آخرین نسخه' : 'هنوز نسخه‌ای نیست'}</div>
          {latest && (
            <div className="text-[10px] text-slate-400">
              {formatJalaliIso(latest.createdAt)} · {time(latest.createdAt)} · {size(latest.size)}
            </div>
          )}
        </div>
        <button
          onClick={runNow}
          disabled={!!busy}
          className="px-3 py-2 rounded-xl bg-sky-600 text-white text-[11px] font-bold flex items-center gap-1.5 disabled:opacity-50 shrink-0"
        >
          {busy === 'run' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <DatabaseBackup className="w-3.5 h-3.5" />}
          الان بگیر
        </button>
      </div>

      {lastError && (
        <div className="rounded-xl bg-rose-50 text-rose-700 text-[11px] p-2 flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> پشتیبان خودکار ناموفق بود: {lastError}
        </div>
      )}

      <div className="divide-y divide-slate-100">
        <label className="flex items-center justify-between py-2">
          <span className="text-xs text-slate-700">پشتیبان خودکار روزانه</span>
          <button
            type="button"
            onClick={() => setPrefs({ enabled: !prefs.enabled })}
            className={`w-10 h-6 rounded-full p-0.5 transition ${prefs.enabled ? 'bg-sky-600' : 'bg-slate-200'}`}
          >
            <span className={`block w-5 h-5 rounded-full bg-white shadow transition ${prefs.enabled ? '-translate-x-4' : ''}`} />
          </button>
        </label>
        <label className="flex items-center justify-between py-2">
          <span className="text-xs text-slate-700">ساعت</span>
          <select className={select} disabled={!prefs.enabled} value={prefs.hour} onChange={(e) => setPrefs({ hour: Number(e.target.value) })}>
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {faNum(String(h).padStart(2, '0'))}:۰۰
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center justify-between py-2">
          <span className="text-xs text-slate-700">نگه‌داری</span>
          <select className={select} value={prefs.keepDays} onChange={(e) => setPrefs({ keepDays: Number(e.target.value) })}>
            {KEEP.map((d) => (
              <option key={d} value={d}>
                {faNum(d)} روز
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="rounded-2xl border border-slate-100 p-2.5 space-y-2">
        <div className="text-[11px] font-bold text-slate-600 flex items-center gap-1.5">
          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" /> خروجی اکسل فاکتورهای یک روز
        </div>
        <div className="flex gap-2">
          <div className="flex-1 min-w-0">
            <JalaliDateField value={day} onChange={setDay} max={todayYmd()} title="روز خروجی" />
          </div>
          <button
            onClick={() => task('export', () => backupService.exportDay(day), 'خروجی گرفته نشد')}
            disabled={!!busy}
            className="px-3 rounded-2xl bg-emerald-600 text-white text-[11px] font-bold flex items-center gap-1.5 disabled:opacity-50 shrink-0"
          >
            {busy === 'export' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            دریافت
          </button>
        </div>
      </div>

      {files.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] text-slate-400">فایل‌های روی سرور</div>
          {files.map((f) => (
            <div key={f.name} className="flex items-center gap-2 py-1.5">
              {f.kind === 'backup' ? (
                <DatabaseBackup className="w-4 h-4 text-sky-600 shrink-0" />
              ) : (
                <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-bold text-slate-700">
                  {f.kind === 'backup' ? 'پشتیبان کامل' : 'فاکتورهای روز'} · {formatJalali(fileDay(f.name))}
                </div>
                <div className="text-[10px] text-slate-400">
                  {time(f.createdAt)} · {size(f.size)}
                </div>
              </div>
              <button
                onClick={() => task(`dl:${f.name}`, () => backupService.download(f.name), 'دانلود نشد')}
                disabled={!!busy}
                className="p-2 rounded-xl bg-slate-100 text-slate-600 disabled:opacity-40"
                aria-label="دانلود"
              >
                {busy === `dl:${f.name}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              </button>
              <button
                onClick={() => remove(f.name)}
                disabled={!!busy}
                className="p-2 rounded-xl bg-rose-50 text-rose-600 disabled:opacity-40"
                aria-label="حذف"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
