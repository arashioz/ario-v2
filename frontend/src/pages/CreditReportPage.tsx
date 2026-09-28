import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { IonPage, IonContent, IonRefresher, IonRefresherContent } from '@ionic/react';
import type { RefresherEventDetail } from '@ionic/react';
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, ChevronDown, Clock, FileText, Hourglass, Info, TrendingUp } from 'lucide-react';
import { accountingService } from '../services/accounting.service';
import type { CreditInvoiceRow, CreditReport } from '../services/accounting.service';
import { PeriodPicker, periodPresets, periodQuery } from '../components/ui/PeriodPicker';
import type { Period } from '../components/ui/PeriodPicker';
import { Empty, KV, ReportHeader, Segments, StatCard } from '../components/reports/ReportUI';
import { useInvoiceOpener } from '../components/reports/useInvoiceOpener';
import { dateToYmd, formatJalali } from '../lib/jalali';
import { formatToman, num, percent, toman } from '../lib/format';

type View = 'days' | 'open' | 'settled';

const jDate = (iso: string) => formatJalali(dateToYmd(new Date(iso)));

const METHOD: Record<string, string> = { pos: 'کارتخوان', cash: 'نقد', transfer: 'کارت‌به‌کارت', cheque: 'چک', card: 'کارت' };

export const CreditReportPage: React.FC = () => {
  const [period, setPeriod] = useState<Period>(() => periodPresets()[0]);
  const [data, setData] = useState<CreditReport | null>(null);
  const [error, setError] = useState('');
  const [view, setView] = useState<View>('days');

  const load = useCallback(async () => {
    try {
      setError('');
      setData(await accountingService.credit(periodQuery(period)));
    } catch {
      setError('دریافت گزارش نسیه ناموفق بود');
    }
  }, [period]);

  useEffect(() => {
    load();
  }, [load]);

  const { open: openInvoice, modal } = useInvoiceOpener(load);

  const handleRefresh = async (e: CustomEvent<RefresherEventDetail>) => {
    await load();
    e.detail.complete();
  };

  const s = data?.summary;
  const open = useMemo(() => (data?.invoices ?? []).filter((i) => i.remaining > 0).sort((a, b) => b.ageDays - a.ageDays), [data]);
  const settled = useMemo(
    () =>
      (data?.invoices ?? [])
        .filter((i) => i.settledAt)
        .sort((a, b) => new Date(b.settledAt!).getTime() - new Date(a.settledAt!).getTime()),
    [data],
  );

  return (
    <IonPage>
      <ReportHeader
        title="گزارش نسیه"
        subtitle="بار نسیه چه روزی رفت، کی تسویه شد و سودش کی به دست آمد"
        right={<PeriodPicker value={period} onChange={setPeriod} />}
      />

      <IonContent fullscreen className="bg-slate-50">
        <IonRefresher slot="fixed" onIonRefresh={handleRefresh}>
          <IonRefresherContent />
        </IonRefresher>

        <div className="p-3 space-y-3 max-w-2xl mx-auto pb-8">
          {error && <div className="text-xs text-rose-700 bg-rose-50 rounded-2xl p-3">{error}</div>}

          <div className="rounded-2xl p-4 text-white bg-gradient-to-br from-amber-500 to-orange-600 shadow-xl shadow-orange-600/20">
            <div className="flex items-center gap-2 text-amber-50 text-xs">
              <Hourglass className="w-4 h-4" />
              نسیه‌های باز (همین الان)
            </div>
            <div className="mt-2 text-3xl font-bold font-mono">
              {toman(s?.outstanding)} <span className="text-sm font-normal text-amber-50">تومان</span>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-white/20">
              <div>
                <div className="text-[10px] text-amber-50">فاکتور باز</div>
                <div className="text-base font-bold font-mono">{num(s?.openInvoices)}</div>
              </div>
              <div>
                <div className="text-[10px] text-amber-50">سودی که هنوز نقد نشده</div>
                <div className="text-base font-bold font-mono">{formatToman(s?.unrealizedProfit)}</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <StatCard
              icon={<ArrowUpRight className="w-4 h-4" />}
              tone="amber"
              title={`نسیه ارسال‌شده · ${period.label}`}
              main={formatToman(s?.creditSent)}
              sub={`${num(s?.creditInvoices)} فاکتور · سود ${formatToman(s?.creditSentProfit)}`}
            />
            <StatCard
              icon={<ArrowDownLeft className="w-4 h-4" />}
              tone="sky"
              title="وصول نسیه در همین بازه"
              main={formatToman(s?.collected)}
              sub={`از روزهای قبل: ${formatToman(s?.collectedPrior)}`}
            />
            <StatCard
              icon={<TrendingUp className="w-4 h-4" />}
              tone="emerald"
              title="سود محقق‌شده از وصول‌ها"
              main={formatToman(s?.realizedProfit)}
              sub="سهم سود پول‌های دریافتی"
            />
            <StatCard
              icon={<Clock className="w-4 h-4" />}
              tone="violet"
              title="میانگین مدت تسویه"
              main={s?.avgDaysToSettle != null ? `${num(s.avgDaysToSettle, 1)} روز` : '—'}
              sub="از روز فروش تا آخرین پرداخت"
            />
          </div>

          <div className="flex gap-2.5 bg-sky-50 border border-sky-100 rounded-2xl p-3 text-[11px] text-sky-900 leading-6">
            <Info className="w-4 h-4 shrink-0 mt-1 text-sky-600" />
            <div>
              سود فاکتور نسیه به نسبت پولی که می‌رسد به دست می‌آید. مثلاً فاکتور ۱۰ میلیونی با ۵۰۰ هزار سود: اگر ۴ میلیون بدهد، همان روز ۲۰۰ هزار سود
              محقق شده و ۳۰۰ هزار هنوز در دست مشتری است.
            </div>
          </div>

          <Segments<View>
            value={view}
            onChange={setView}
            items={[
              ['days', 'روزانه'],
              ['open', `باز (${num(open.length)})`],
              ['settled', `تسویه‌شده (${num(settled.length)})`],
            ]}
          />

          {!data ? null : view === 'days' ? (
            data.days.length === 0 ? (
              <Empty>در این بازه نسیه‌ای نرفته و وصولی نبوده.</Empty>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm divide-y divide-slate-100">
                {data.days.map((d) => (
                  <div key={d.date} className="px-3.5 py-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700">{formatJalali(d.date, { weekday: true })}</span>
                      {d.settled > 0 && (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                          {num(d.settled)} فاکتور تسویه شد
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-2 text-[11px]">
                      <div className={`rounded-xl px-2.5 py-2 ${d.creditSent ? 'bg-amber-50' : 'bg-slate-50'}`}>
                        <div className="text-[10px] text-amber-700 flex items-center gap-1">
                          <ArrowUpRight className="w-3 h-3" /> نسیه رفت
                        </div>
                        <div className="font-mono font-bold text-slate-800">{d.creditSent ? toman(d.creditSent) : '—'}</div>
                        {d.creditSent > 0 && (
                          <div className="text-[10px] text-slate-400 font-mono">
                            {num(d.creditInvoices)} فاکتور · سود {formatToman(d.creditSentProfit)}
                          </div>
                        )}
                      </div>
                      <div className={`rounded-xl px-2.5 py-2 ${d.collected ? 'bg-emerald-50' : 'bg-slate-50'}`}>
                        <div className="text-[10px] text-emerald-700 flex items-center gap-1">
                          <ArrowDownLeft className="w-3 h-3" /> وصول شد
                        </div>
                        <div className="font-mono font-bold text-slate-800">{d.collected ? toman(d.collected) : '—'}</div>
                        <div className="text-[10px] text-emerald-700 font-mono">
                          نسیه روزهای قبل: {d.collectedPrior ? toman(d.collectedPrior) : '۰'}
                        </div>
                        {d.collected > 0 && <div className="text-[10px] text-emerald-600 font-mono">سود محقق {formatToman(d.realizedProfit)}</div>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            <div className="space-y-2.5">
              {(view === 'open' ? open : settled).length === 0 ? (
                <Empty>{view === 'open' ? 'نسیه بازی نیست.' : 'در این بازه فاکتوری تسویه نشده.'}</Empty>
              ) : (
                (view === 'open' ? open : settled).map((inv) => <CreditCard key={inv.invoiceId} inv={inv} onOpen={openInvoice} />)
              )}
            </div>
          )}
        </div>
        {modal}
      </IonContent>
    </IonPage>
  );
};

const CreditCard: React.FC<{ inv: CreditInvoiceRow; onOpen: (id: string) => void }> = ({ inv, onOpen }) => {
  const [expanded, setExpanded] = useState(false);
  const paidShare = inv.credit ? Math.min(100, (inv.paidLater / inv.credit) * 100) : 0;
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <button onClick={() => setExpanded((v) => !v)} className="w-full p-3 text-right">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-xs font-bold text-slate-800 truncate">{inv.customerName}</h3>
            <p className="text-[10px] text-slate-400 mt-0.5">
              <span className="font-mono">{inv.invoiceNumber}</span> · فروش {jDate(inv.date)}
            </p>
          </div>
          {inv.settledAt ? (
            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md flex items-center gap-1 shrink-0">
              <CheckCircle2 className="w-3 h-3" />
              {num(inv.daysToSettle ?? 0)} روزه تسویه
            </span>
          ) : (
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0 ${
                inv.ageDays > 30 ? 'bg-rose-50 text-rose-700' : inv.ageDays > 14 ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {num(inv.ageDays)} روز گذشته
            </span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-1.5 mt-3 text-center">
          <div className="bg-slate-50 rounded-2xl py-2">
            <div className="text-[10px] text-slate-400">نسیه</div>
            <div className="text-[11px] font-bold font-mono text-slate-700">{formatToman(inv.credit)}</div>
          </div>
          <div className="bg-emerald-50 rounded-2xl py-2">
            <div className="text-[10px] text-emerald-700">وصول‌شده</div>
            <div className="text-[11px] font-bold font-mono text-emerald-800">{formatToman(inv.paidLater)}</div>
          </div>
          <div className={`rounded-2xl py-2 ${inv.remaining > 0 ? 'bg-amber-50' : 'bg-slate-50'}`}>
            <div className="text-[10px] text-amber-700">مانده</div>
            <div className="text-[11px] font-bold font-mono text-amber-800">{inv.remaining > 0 ? formatToman(inv.remaining) : '۰'}</div>
          </div>
        </div>
        <div className="mt-2.5 h-1.5 rounded-full bg-slate-100 overflow-hidden">
          <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${paidShare}%` }} />
        </div>
        <div className="flex items-center justify-between mt-2 text-[10px] text-slate-500">
          <span>
            سود فاکتور <b className="font-mono text-slate-700">{formatToman(inv.profit)}</b> ({percent(inv.marginPercent)})
          </span>
          <ChevronDown className={`w-4 h-4 text-slate-300 transition ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {expanded && (
        <div className="px-3.5 pb-3.5 pt-3 border-t border-slate-100 space-y-2.5">
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <KV k="مبلغ فاکتور" v={formatToman(inv.amount)} />
            <KV k="پرداخت همان روز" v={formatToman(inv.upfront)} />
            <KV k="سود به‌دست‌آمده" v={formatToman(inv.realizedProfit)} vClass="text-emerald-700" />
            <KV k="سود در انتظار وصول" v={formatToman(inv.unrealizedProfit)} vClass="text-amber-700" />
          </div>

          <div className="text-[11px] font-bold text-slate-600">روند پرداخت و سود</div>
          <div className="relative pr-4 space-y-2.5">
            <div className="absolute right-1.5 top-1 bottom-1 w-px bg-slate-200" />
            <TimelineItem color="bg-amber-500" title={`فروش نسیه · ${jDate(inv.date)}`} detail={`${formatToman(inv.credit)} نسیه رفت`} />
            {inv.payments.map((p, i) => (
              <TimelineItem
                key={i}
                color="bg-emerald-500"
                title={`${jDate(p.date)} · ${METHOD[p.method ?? ''] ?? 'پرداخت'}`}
                detail={`${formatToman(p.amount)} دریافت شد · سود محقق ${formatToman(p.profit)}`}
              />
            ))}
            {inv.remaining > 0 && (
              <TimelineItem color="bg-slate-300" title="در انتظار" detail={`${formatToman(inv.remaining)} مانده`} />
            )}
          </div>

          <button
            onClick={() => onOpen(inv.invoiceId)}
            className="w-full py-2.5 rounded-2xl bg-slate-100 text-slate-700 text-xs font-bold flex items-center justify-center gap-1.5"
          >
            <FileText className="w-4 h-4" />
            مشاهده فاکتور
          </button>
        </div>
      )}
    </div>
  );
};

const TimelineItem: React.FC<{ color: string; title: string; detail: string }> = ({ color, title, detail }) => (
  <div className="relative">
    <span className={`absolute -right-[13px] top-1.5 w-2.5 h-2.5 rounded-full ring-2 ring-white ${color}`} />
    <div className="text-[11px] font-bold text-slate-700">{title}</div>
    <div className="text-[10px] text-slate-500 font-mono">{detail}</div>
  </div>
);
