import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IonPage, IonContent, IonRefresher, IonRefresherContent } from '@ionic/react';
import type { RefresherEventDetail } from '@ionic/react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  Ban,
  ChevronDown,
  LogIn,
  LogOut,
  KeyRound,
  Pencil,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
  Zap,
  X,
} from 'lucide-react';
import { auditService, ACTION_LABELS, fieldLabel } from '../services/audit.service';
import type { AuditAction, AuditLog, AuditQuery, AuditStats } from '../services/audit.service';
import { apiErrorMessage } from '../services/invoices.service';
import { useAuth } from '../context/AuthContext';
import { ReportHeader, StatCard, KV, Segments, Empty } from '../components/reports/ReportUI';
import { PeriodPicker } from '../components/ui/PeriodPicker';
import type { Period } from '../components/ui/PeriodPicker';
import { Sheet } from '../components/ui/Sheet';
import { formatJalaliIso } from '../lib/jalali';
import { num, formatToman } from '../lib/format';

type Filter = 'all' | 'delete' | 'update' | 'create' | 'auth' | 'alert' | 'failed';

const FILTERS: [Filter, string][] = [
  ['all', 'همه'],
  ['delete', 'حذف'],
  ['update', 'ویرایش'],
  ['create', 'ثبت'],
  ['auth', 'ورود/خروج'],
  ['alert', 'هشدار'],
  ['failed', 'ناموفق'],
];

const filterQuery = (f: Filter): Partial<AuditQuery> => {
  switch (f) {
    case 'delete':
      return { action: 'delete' };
    case 'update':
      return { action: 'update,action' };
    case 'create':
      return { action: 'create' };
    case 'auth':
      return { action: 'login,login_failed,logout,password' };
    case 'alert':
      return { action: 'alert' };
    case 'failed':
      return { failed: true };
    default:
      return {};
  }
};

const ACTION_STYLE: Record<AuditAction, { icon: React.ElementType; cls: string }> = {
  create: { icon: Plus, cls: 'bg-emerald-100 text-emerald-600' },
  update: { icon: Pencil, cls: 'bg-sky-100 text-sky-600' },
  action: { icon: Zap, cls: 'bg-indigo-100 text-indigo-600' },
  delete: { icon: Trash2, cls: 'bg-rose-100 text-rose-600' },
  login: { icon: LogIn, cls: 'bg-slate-100 text-slate-600' },
  login_failed: { icon: ShieldAlert, cls: 'bg-amber-100 text-amber-700' },
  logout: { icon: LogOut, cls: 'bg-slate-100 text-slate-500' },
  password: { icon: KeyRound, cls: 'bg-violet-100 text-violet-600' },
  alert: { icon: AlertTriangle, cls: 'bg-orange-100 text-orange-600' },
};

const timeFa = (iso: string) =>
  new Date(iso).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Tehran' });

const ROLE_FA: Record<string, string> = { admin: 'مدیر', marketer: 'بازاریاب', system: 'خودکار' };

const dayKey = (iso: string) => formatJalaliIso(iso);

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function formatValue(v: unknown): string {
  if (v === undefined || v === null || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'بله' : 'خیر';
  if (typeof v === 'number') return num(v);
  if (typeof v === 'string') return ISO_RE.test(v) ? `${formatJalaliIso(v)} ${timeFa(v)}` : v;
  if (Array.isArray(v)) return `${num(v.length)} مورد`;
  return JSON.stringify(v);
}

function shortDevice(ua: string) {
  if (!ua) return '—';
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'اندروید' : /Mac OS/.test(ua) ? 'مک' : /Windows/.test(ua) ? 'ویندوز' : /Linux/.test(ua) ? 'لینوکس' : '';
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
  return [os, br].filter(Boolean).join(' · ') || ua.slice(0, 40);
}

const HIDDEN_KEYS = new Set(['_id', '__v', 'createdAt', 'updatedAt', 'items', 'createdBy', 'image', 'priceHistory', 'payments']);

/** Readable view of a whole record snapshot (e.g. what was deleted). */
const Snapshot: React.FC<{ data: unknown; title: string; tone: string }> = ({ data, title, tone }) => {
  const [raw, setRaw] = useState(false);
  if (!data || typeof data !== 'object') return null;
  const rec = data as Record<string, unknown>;
  const fields = Object.entries(rec).filter(([k, v]) => !HIDDEN_KEYS.has(k) && v !== null && v !== '' && typeof v !== 'object');
  const items = Array.isArray(rec.items) ? (rec.items as Record<string, unknown>[]) : [];

  return (
    <div className={`rounded-2xl border p-3 space-y-2 ${tone}`}>
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-extrabold">{title}</h4>
        <button onClick={() => setRaw((r) => !r)} className="text-[10px] font-bold underline opacity-70">
          {raw ? 'نمای خوانا' : 'داده خام'}
        </button>
      </div>
      {raw ? (
        <pre dir="ltr" className="text-[10px] bg-white/70 rounded-xl p-2 overflow-x-auto max-h-80 text-left">
          {JSON.stringify(data, null, 2)}
        </pre>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-1.5 text-[11px]">
            {fields.map(([k, v]) => (
              <KV key={k} k={fieldLabel(k)} v={formatValue(v)} />
            ))}
          </div>
          {items.length > 0 && (
            <div className="bg-white/70 rounded-xl overflow-hidden">
              <div className="text-[10px] font-bold px-2.5 py-1.5 border-b border-black/5">اقلام ({num(items.length)})</div>
              {items.map((it, i) => (
                <div key={i} className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-[11px] border-b border-black/5 last:border-0">
                  <span className="truncate">{String(it.productName ?? it.name ?? `ردیف ${i + 1}`)}</span>
                  <span className="font-mono shrink-0 text-slate-500">
                    {num(Number(it.quantity) || 0)} × {num(Number(it.unitPrice) || 0)} = <b className="text-slate-700">{num(Number(it.totalPrice) || 0)}</b>
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

const LogDetail: React.FC<{ id: string | null; onClose: () => void }> = ({ id, onClose }) => {
  const [log, setLog] = useState<AuditLog | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    setLog(null);
    setError('');
    auditService
      .get(id)
      .then(setLog)
      .catch((err) => setError(apiErrorMessage(err, 'دریافت جزئیات ناموفق بود')));
  }, [id]);

  const alertFindings =
    log?.action === 'alert' && Array.isArray(log.body) ? (log.body as { title?: string; detail?: string; invoiceNumber?: string }[]) : [];

  return (
    <Sheet open={!!id} onClose={onClose} title={log?.title || 'جزئیات رویداد'} subtitle={log ? `${ACTION_LABELS[log.action]} · ${log.entityLabel || log.entity}` : undefined}>
      {error && <div className="text-xs text-rose-700 bg-rose-50 rounded-2xl p-3">{error}</div>}
      {!log && !error && <div className="text-center text-xs text-slate-400 py-8">در حال بارگذاری…</div>}
      {log && (
        <>
          {!log.success && (
            <div className="flex items-start gap-2 text-xs text-rose-800 bg-rose-50 border border-rose-100 rounded-2xl p-3">
              <Ban className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <b>انجام نشد</b>
                {log.statusCode ? ` (کد ${log.statusCode})` : ''}
                {log.error && <div className="mt-1 leading-5">{log.error}</div>}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-1.5 text-[11px]">
            <KV k="توسط" v={log.userFullName || log.username || 'سیستم'} />
            <KV k="نام کاربری / نقش" v={`${log.username || '—'}${log.userRole ? ` · ${ROLE_FA[log.userRole] ?? log.userRole}` : ''}`} />
            <KV k="تاریخ" v={formatJalaliIso(log.createdAt)} />
            <KV k="ساعت" v={timeFa(log.createdAt)} />
            {log.amount !== undefined && log.amount !== null && <KV k="مبلغ" v={formatToman(log.amount)} />}
            <KV k="دستگاه" v={shortDevice(log.userAgent)} />
            <KV k="IP" v={log.ip || '—'} />
            <KV k="مدت پاسخ" v={log.durationMs !== undefined ? `${num(log.durationMs)} ms` : '—'} />
          </div>
          {log.path && (
            <div dir="ltr" className="text-[10px] font-mono text-slate-400 bg-slate-50 rounded-xl px-2.5 py-1.5 text-left break-all">
              {log.method} {log.path}
            </div>
          )}

          {log.changes && log.changes.length > 0 && (
            <div className="rounded-2xl border border-sky-100 bg-sky-50/50 overflow-hidden">
              <div className="text-xs font-extrabold text-sky-900 px-3 py-2 border-b border-sky-100">تغییرات ({num(log.changes.length)})</div>
              {log.changes.map((c, i) => (
                <div key={i} className="px-3 py-2 border-b border-sky-100/70 last:border-0 text-[11px]">
                  <div className="text-slate-500 font-bold">{fieldLabel(c.path)}</div>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <span className="px-2 py-0.5 rounded-lg bg-rose-50 text-rose-700 line-through decoration-rose-300 break-all">{formatValue(c.from)}</span>
                    <span className="text-slate-400">←</span>
                    <span className="px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 font-bold break-all">{formatValue(c.to)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {alertFindings.length > 0 && (
            <div className="rounded-2xl border border-orange-100 bg-orange-50/60 p-3 space-y-1.5">
              <h4 className="text-xs font-extrabold text-orange-900">موارد پیدا شده</h4>
              {alertFindings.map((f, i) => (
                <div key={i} className="text-[11px] text-orange-900 leading-5">
                  • {f.invoiceNumber && <b className="font-mono">{f.invoiceNumber} </b>}
                  {f.title}
                  {f.detail && <div className="text-[10px] opacity-70 pr-3">{f.detail}</div>}
                </div>
              ))}
            </div>
          )}

          {log.action === 'delete' && <Snapshot data={log.before} title="اطلاعات حذف‌شده (نسخه قبل از حذف)" tone="border-rose-100 bg-rose-50/50 text-rose-900" />}
          {log.action === 'create' && <Snapshot data={log.after} title="اطلاعات ثبت‌شده" tone="border-emerald-100 bg-emerald-50/50 text-emerald-900" />}
          {(log.action === 'update' || log.action === 'action') && !log.changes?.length && (
            <Snapshot data={log.after ?? log.before} title="وضعیت رکورد" tone="border-slate-100 bg-slate-50 text-slate-800" />
          )}
        </>
      )}
    </Sheet>
  );
};

const PAGE_SIZE = 50;

export const LogsPage: React.FC = () => {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [filter, setFilter] = useState<Filter>('all');
  const [userId, setUserId] = useState(params.get('userId') ?? '');
  const [entity, setEntity] = useState('');
  const [period, setPeriod] = useState<Period>({ label: 'کل دوره' });
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [items, setItems] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const reqId = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const query = useMemo<AuditQuery>(
    () => ({ ...filterQuery(filter), userId: userId || undefined, entity: entity || undefined, from: period.from, to: period.to, search: search || undefined }),
    [filter, userId, entity, period, search],
  );

  const load = useCallback(
    async (p: number) => {
      const id = ++reqId.current;
      try {
        setLoading(true);
        setError('');
        const res = await auditService.list({ ...query, page: p, limit: PAGE_SIZE });
        if (id !== reqId.current) return;
        setItems((prev) => (p === 1 ? res.items : [...prev, ...res.items]));
        setTotal(res.total);
        setPage(res.page);
        setPages(res.pages);
      } catch (err) {
        if (id === reqId.current) setError(apiErrorMessage(err, 'دریافت رویدادها ناموفق بود'));
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    [query],
  );

  const loadStats = useCallback(() => auditService.stats().then(setStats).catch(() => undefined), []);

  useEffect(() => {
    load(1);
  }, [load]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const handleRefresh = async (e: CustomEvent<RefresherEventDetail>) => {
    await Promise.all([load(1), loadStats()]);
    e.detail.complete();
  };

  const groups = useMemo(() => {
    const out: { day: string; logs: AuditLog[] }[] = [];
    for (const l of items) {
      const d = dayKey(l.createdAt);
      if (out.length && out[out.length - 1].day === d) out[out.length - 1].logs.push(l);
      else out.push({ day: d, logs: [l] });
    }
    return out;
  }, [items]);

  if (user?.role !== 'admin') {
    return (
      <IonPage>
        <ReportHeader title="گزارش رویدادها" subtitle="فقط برای مدیر" />
        <IonContent className="bg-slate-50">
          <div className="p-3">
            <Empty>دیدن لاگ‌ها فقط با حساب مدیر ممکن است.</Empty>
          </div>
        </IonContent>
      </IonPage>
    );
  }

  const s = stats?.last24h;
  const hasExtraFilter = !!(userId || entity || search || period.from || period.to);

  return (
    <IonPage>
      <ReportHeader title="گزارش رویدادها" subtitle={`همه ثبت، ویرایش و حذف‌ها — ${num(stats?.total ?? 0)} رویداد`} />
      <IonContent fullscreen className="bg-slate-50">
        <IonRefresher slot="fixed" onIonRefresh={handleRefresh}>
          <IonRefresherContent />
        </IonRefresher>
        <div className="p-3 space-y-3 max-w-2xl mx-auto pb-8">
          <div className="text-[11px] font-bold text-slate-500 px-1">۲۴ ساعت گذشته</div>
          <div className="grid grid-cols-3 gap-2">
            <StatCard icon={<Plus className="w-4 h-4" />} tone="emerald" title="ثبت" main={num(s?.create ?? 0)} />
            <StatCard icon={<Pencil className="w-4 h-4" />} tone="sky" title="ویرایش" main={num(s?.update ?? 0)} />
            <StatCard icon={<Trash2 className="w-4 h-4" />} tone="rose" title="حذف" main={num(s?.delete ?? 0)} />
            <StatCard icon={<Ban className="w-4 h-4" />} tone="amber" title="ناموفق" main={num(s?.failed ?? 0)} />
            <StatCard icon={<ShieldAlert className="w-4 h-4" />} tone="amber" title="ورود ناموفق" main={num(s?.loginFailed ?? 0)} />
            <StatCard icon={<AlertTriangle className="w-4 h-4" />} tone="rose" title="هشدار نگهبان" main={num(s?.alerts ?? 0)} />
          </div>

          <Segments<Filter> value={filter} onChange={setFilter} items={FILTERS} />

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="جستجو: شماره فاکتور، نام، کاربر…"
              className="w-full pr-9 pl-9 py-2.5 rounded-2xl border border-slate-200 bg-white text-xs focus:outline-none focus:border-sky-400"
            />
            {searchInput && (
              <button onClick={() => setSearchInput('')} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex gap-2 overflow-x-auto no-scrollbar items-center">
            <PeriodPicker value={period} onChange={setPeriod} />
            <div className="relative shrink-0">
              <select value={userId} onChange={(e) => setUserId(e.target.value)} className="appearance-none pl-7 pr-3 py-2 rounded-full bg-white border border-slate-200 text-[11px] font-bold text-slate-700">
                <option value="">همه کاربران</option>
                {stats?.users.map((u) => (
                  <option key={u.userId} value={u.userId}>
                    {u.name || u.username} ({num(u.count)})
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
            <div className="relative shrink-0">
              <select value={entity} onChange={(e) => setEntity(e.target.value)} className="appearance-none pl-7 pr-3 py-2 rounded-full bg-white border border-slate-200 text-[11px] font-bold text-slate-700">
                <option value="">همه بخش‌ها</option>
                {stats?.entities.map((en) => (
                  <option key={en.entity} value={en.entity}>
                    {en.label} ({num(en.count)})
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
            {hasExtraFilter && (
              <button
                onClick={() => {
                  setUserId('');
                  setEntity('');
                  setSearchInput('');
                  setPeriod({ label: 'کل دوره' });
                }}
                className="shrink-0 text-[11px] font-bold text-rose-600 px-2"
              >
                پاک کردن فیلترها
              </button>
            )}
          </div>

          <div className="text-[11px] text-slate-400 px-1">{num(total)} رویداد پیدا شد · لاگ‌ها قابل حذف یا ویرایش نیستند</div>

          {error && <div className="text-xs text-rose-700 bg-rose-50 rounded-2xl p-3">{error}</div>}
          {!loading && !error && items.length === 0 && <Empty>رویدادی با این فیلترها پیدا نشد.</Empty>}

          {groups.map((g) => (
            <div key={g.day} className="space-y-1.5">
              <div className="sticky top-0 z-10 text-[11px] font-extrabold text-slate-500 bg-slate-50/95 backdrop-blur py-1 px-1">{g.day}</div>
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                {g.logs.map((l) => {
                  const st = ACTION_STYLE[l.action] ?? ACTION_STYLE.action;
                  const Icon = st.icon;
                  return (
                    <button
                      key={l._id}
                      onClick={() => setOpenId(l._id)}
                      className="w-full flex items-start gap-3 px-3.5 py-3 border-b border-slate-50 last:border-0 text-right active:bg-slate-50"
                    >
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${st.cls}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[12px] font-bold text-slate-800 truncate">{l.title}</span>
                          {!l.success && <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700">ناموفق</span>}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 text-[10px] text-slate-400 flex-wrap">
                          <span className="font-bold text-slate-500">{l.userFullName || l.username || 'سیستم'}</span>
                          <span>·</span>
                          <span className="font-mono">{timeFa(l.createdAt)}</span>
                          {l.entityLabel && (
                            <>
                              <span>·</span>
                              <span>{l.entityLabel}</span>
                            </>
                          )}
                          {!!l.changesCount && <span className="px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-700 font-bold">{num(l.changesCount)} تغییر</span>}
                        </div>
                        {!l.success && l.error && <div className="text-[10px] text-rose-600 mt-1 truncate">{l.error}</div>}
                      </div>
                      {l.amount !== undefined && l.amount !== null && l.amount !== 0 && (
                        <span className="text-[11px] font-mono font-bold text-slate-600 shrink-0 mt-0.5">{num(l.amount)}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {loading && <div className="text-center text-xs text-slate-400 py-4">در حال بارگذاری…</div>}
          {!loading && page < pages && (
            <button onClick={() => load(page + 1)} className="w-full py-3 rounded-2xl bg-white border border-slate-200 text-xs font-bold text-slate-600 active:scale-[0.98]">
              نمایش بیشتر ({num(total - items.length)} مورد دیگر)
            </button>
          )}
        </div>
        <LogDetail id={openId} onClose={() => setOpenId(null)} />
      </IonContent>
    </IonPage>
  );
};
