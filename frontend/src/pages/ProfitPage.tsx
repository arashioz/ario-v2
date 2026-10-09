import React, { useCallback, useEffect, useState } from 'react';
import { IonPage, IonContent, IonRefresher, IonRefresherContent } from '@ionic/react';
import type { RefresherEventDetail } from '@ionic/react';
import { AlertTriangle, CalendarDays, ChevronLeft, Coins, Info, LineChart, Package, Percent, Scale, TrendingUp, Truck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ProfitWatchCard, ProfitWatchList, useProfitWatch } from '../components/reports/ProfitWatch';
import { accountingService } from '../services/accounting.service';
import type { ProfitReport, LotRow, SuspiciousLine } from '../services/accounting.service';
import { PeriodPicker, periodPresets, periodQuery } from '../components/ui/PeriodPicker';
import type { Period } from '../components/ui/PeriodPicker';
import { Empty, KV, Mini, ReportHeader, Segments, StatCard } from '../components/reports/ReportUI';
import { useInvoiceOpener } from '../components/reports/useInvoiceOpener';
import { dateToYmd, formatJalali } from '../lib/jalali';
import { formatToman, num, percent, profitColor, toman, tons, weight } from '../lib/format';

type View = 'watch' | 'lot' | 'product' | 'day' | 'customer' | 'check';

const jDate = (iso: string) => formatJalali(dateToYmd(new Date(iso)));

type Lane = 'all' | 'shop' | 'factory';

export const ProfitPage: React.FC = () => {
  const [period, setPeriod] = useState<Period>(() => periodPresets()[0]);
  const [lane, setLane] = useState<Lane>('all');
  const [data, setData] = useState<ProfitReport | null>(null);
  const [error, setError] = useState('');
  const [view, setView] = useState<View>('lot');
  const navigate = useNavigate();
  const watch = useProfitWatch();
  const reloadWatch = watch.reload;

  const load = useCallback(async () => {
    try {
      setError('');
      setData(await accountingService.profit({ ...periodQuery(period), channel: lane }));
    } catch {
      setError('دریافت گزارش سود ناموفق بود');
    }
  }, [period, lane]);

  useEffect(() => {
    load();
  }, [load]);

  const reloadAll = useCallback(() => {
    load();
    reloadWatch();
  }, [load, reloadWatch]);

  const { open: openInvoice, modal } = useInvoiceOpener(reloadAll);

  const handleRefresh = async (e: CustomEvent<RefresherEventDetail>) => {
    await Promise.all([load(), reloadWatch()]);
    e.detail.complete();
  };

  const s = data?.summary;
  const errors = data?.suspicious.filter((x) => x.level === 'error') ?? [];

  return (
    <IonPage>
      <ReportHeader
        title="ریز سود"
        subtitle="سود واقعی هر فروش از روی قیمت همان بار خرید (FIFO)"
        right={<PeriodPicker value={period} onChange={setPeriod} />}
      />

      <IonContent fullscreen className="bg-slate-50">
        <IonRefresher slot="fixed" onIonRefresh={handleRefresh}>
          <IonRefresherContent />
        </IonRefresher>

        <div className="p-3 space-y-3 max-w-2xl mx-auto pb-8">
          {error && <div className="text-xs text-rose-700 bg-rose-50 rounded-2xl p-3">{error}</div>}

          <div className="rounded-2xl p-4 text-white bg-gradient-to-br from-emerald-600 to-teal-700 shadow-xl shadow-emerald-700/20">
            <div className="flex items-center gap-2 text-emerald-100 text-xs">
              <TrendingUp className="w-4 h-4" />
              سود ناخالص · {period.label}
            </div>
            <div className="mt-2 text-3xl font-bold font-mono">
              {toman(s?.profit)} <span className="text-sm font-normal text-emerald-100">تومان</span>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-white/15 text-center">
              <div>
                <div className="text-[10px] text-emerald-100">درصد سود از فروش</div>
                <div className="text-base font-bold font-mono">{percent(s?.marginPercent, 2)}</div>
              </div>
              <div>
                <div className="text-[10px] text-emerald-100">سود هر کیلو</div>
                <div className="text-base font-bold font-mono">{formatToman(s?.profitPerKg)}</div>
              </div>
              <div>
                <div className="text-[10px] text-emerald-100">سود هر تن</div>
                <div className="text-base font-bold font-mono">{formatToman((s?.profitPerKg ?? 0) * 1000)}</div>
              </div>
            </div>
          </div>

          <ProfitWatchCard
            report={watch.report}
            error={watch.error}
            scanning={watch.scanning}
            onRescan={watch.rescan}
            onOpen={() => setView('watch')}
          />

          <button
            onClick={() => navigate('/price-chart')}
            className="w-full flex items-center justify-between bg-white rounded-2xl border border-slate-100 shadow-sm px-3 py-3 text-right active:scale-[0.99] transition"
          >
            <span className="flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
                <LineChart className="w-4 h-4" />
              </span>
              <span>
                <span className="block text-xs font-bold text-slate-800">چارت قیمت همه کالاها</span>
                <span className="block text-[10px] text-slate-400 mt-0.5">قیمت خرید هر بار، قیمت فروش روزانه و قیمت لیست</span>
              </span>
            </span>
            <ChevronLeft className="w-4 h-4 text-slate-300" />
          </button>

          {data?.channels && (
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ['all', 'جمع کل', { profit: data.channels.shop.profit + data.channels.factory.profit, revenue: data.channels.shop.revenue + data.channels.factory.revenue, kg: data.channels.shop.kg + data.channels.factory.kg, invoices: data.channels.shop.invoices + data.channels.factory.invoices }, 'bg-emerald-50 border-emerald-100 text-emerald-950'],
                  ['shop', 'دفتر', data.channels.shop, 'bg-sky-50 border-sky-100 text-sky-950'],
                  ['factory', 'کارخانه', data.channels.factory, 'bg-amber-50 border-amber-100 text-amber-950'],
                ] as const
              ).map(([id, label, c, tone]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setLane(id)}
                  className={`rounded-2xl border p-2.5 text-right ${tone} ${lane === id ? 'ring-2 ring-offset-1 ring-slate-400' : ''}`}
                >
                  <div className="text-[11px] font-bold">{label}</div>
                  <div className="text-[13px] font-bold font-mono mt-1">{formatToman(c.profit)}</div>
                  <div className="text-[10px] mt-0.5 opacity-80 leading-4">
                    فروش {formatToman(c.revenue)}
                    <br />
                    {tons(c.kg)} تن · {num(c.invoices)} فاکتور
                  </div>
                </button>
              ))}
            </div>
          )}

          {s && s.kg > 0 && (
            <div className="flex gap-2.5 bg-sky-50 border border-sky-100 rounded-2xl p-3 text-[11px] text-sky-900 leading-6">
              <Info className="w-4 h-4 shrink-0 mt-1 text-sky-600" />
              <div>
                یعنی به‌طور میانگین هر کیلو را <b className="font-mono">{num(s.avgCostPerKg)}</b> خریده‌اید و{' '}
                <b className="font-mono">{num(s.avgSellPerKg)}</b> فروخته‌اید؛ روی هر کیلو <b className="font-mono">{num(s.profitPerKg)}</b>{' '}
                تومان سود. از هر ۱۰۰ تومان فروش <b className="font-mono">{num(s.marginPercent, 1)}</b> تومان سود ماند و روی هر ۱۰۰ تومان خرید{' '}
                <b className="font-mono">{num(s.markupPercent, 1)}</b> تومان سود گذاشتید.
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <StatCard icon={<Scale className="w-4 h-4" />} tone="sky" title="فروش" main={`${tons(s?.kg)} تن`} sub={formatToman(s?.revenue)} />
            <StatCard
              icon={<Truck className="w-4 h-4" />}
              tone="amber"
              title="بهای خرید همان بارها"
              main={formatToman(s?.cost)}
              sub={`میانگین هر کیلو ${formatToman(s?.avgCostPerKg)}`}
            />
            <StatCard
              icon={<Percent className="w-4 h-4" />}
              tone="violet"
              title="درصد سود روی خرید"
              main={percent(s?.markupPercent, 2)}
              sub="سود ÷ قیمت خرید"
            />
            <StatCard
              icon={<CalendarDays className="w-4 h-4" />}
              tone="emerald"
              title="میانگین سود روزانه"
              main={s?.days ? formatToman(s.profit / s.days) : '—'}
              sub={`${num(s?.days)} روز کاری · ${num(s?.invoices)} فاکتور`}
            />
          </div>

          {data && data.warnings.estimatedLines > 0 && (
            <div className="flex gap-2.5 bg-amber-50 border border-amber-200 rounded-2xl p-3 text-[11px] text-amber-800 leading-6">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-1" />
              <div>
                <b className="font-mono">{weight(data.warnings.estimatedKg)}</b> از فروش ({num(data.warnings.estimatedLines)} ردیف) قبل از فاکتور خریدِ همان روز است. این بخش با قیمت خریدهای بعدی ضرر حساب نمی‌شود.
              </div>
            </div>
          )}

          {errors.length > 0 && (
            <button
              onClick={() => setView('check')}
              className="w-full flex gap-2.5 bg-rose-50 border border-rose-200 rounded-2xl p-3 text-[11px] text-rose-800 leading-6 text-right"
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-1" />
              <div>
                <b>{num(errors.length)} ردیف فروش احتمالاً اشتباه ثبت شده</b> (سود بیش از ۲۵٪ یا زیان بیش از ۲۰٪). برای بررسی و اصلاح بزنید.
              </div>
            </button>
          )}

          <Segments<View>
            value={view}
            onChange={setView}
            items={[
              ['watch', `نگهبان (${num((watch.report?.counts.error ?? 0) + (watch.report?.counts.warning ?? 0))})`],
              ['lot', 'هر بار خرید'],
              ['product', 'کالا'],
              ['day', 'روزانه'],
              ['customer', 'مشتری'],
              ['check', `بررسی (${num(data?.suspicious.length ?? 0)})`],
            ]}
          />

          {view === 'watch' ? (
            <ProfitWatchList report={watch.report} onChanged={reloadWatch} onOpenInvoice={openInvoice} />
          ) : !data ? null : view === 'lot' ? (
            <div className="space-y-2.5">
              <p className="text-[11px] text-slate-500 leading-5 px-1">
                هر بار خرید جدا حساب می‌شود: فروش‌ها اول از قدیمی‌ترین بار کم می‌شوند، پس سود هر فروش با قیمت همان باری که از آن رفته حساب می‌شود.
              </p>
              {data.byLot.length === 0 ? <Empty>باری در این بازه خریداری نشده.</Empty> : data.byLot.map((l, i) => <LotCard key={`${l.invoiceId}-${i}`} lot={l} onOpen={openInvoice} />)}
            </div>
          ) : view === 'product' ? (
            <div className="space-y-2.5">
              {data.byProduct.length === 0 ? (
                <Empty>فروشی در این بازه نیست.</Empty>
              ) : (
                data.byProduct.map((p) => (
                  <div key={p.key} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Package className="w-4 h-4 text-slate-400 shrink-0" />
                        <h3 className="text-xs font-bold text-slate-800 truncate">{p.name}</h3>
                      </div>
                      <span className={`text-sm font-bold font-mono ${profitColor(p.profit)}`}>{formatToman(p.profit)}</span>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5 mt-3">
                      <Mini label="فروش" value={weight(p.kg)} />
                      <Mini label="خرید/کیلو" value={num(p.avgCostPerKg)} />
                      <Mini label="فروش/کیلو" value={num(p.avgSellPerKg)} />
                      <Mini label="سود/کیلو" value={num(p.profitPerKg)} sub={percent(p.marginPercent)} valueClass={profitColor(p.profit)} />
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : view === 'day' ? (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm divide-y divide-slate-100">
              {data.byDay.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">فروشی در این بازه نیست.</div>
              ) : (
                data.byDay.map((d) => (
                  <div key={d.key} className="flex items-center justify-between px-3.5 py-3">
                    <div>
                      <div className="text-xs font-bold text-slate-700">{formatJalali(d.date, { weekday: true })}</div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        {weight(d.kg)} · {formatToman(d.revenue)} · {num(d.invoices)} فاکتور
                      </div>
                    </div>
                    <div className="text-left">
                      <div className={`text-xs font-bold font-mono ${profitColor(d.profit)}`}>{formatToman(d.profit)}</div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        {percent(d.marginPercent)} · هر کیلو {formatToman(d.profitPerKg)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : view === 'customer' ? (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm divide-y divide-slate-100">
              {data.byCustomer.map((c, i) => (
                <div key={c.key} className="flex items-center justify-between px-3.5 py-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-6 h-6 rounded-lg bg-slate-100 text-slate-500 text-[10px] font-bold flex items-center justify-center font-mono shrink-0">
                      {num(i + 1)}
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-700 truncate">{c.name}</div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        {weight(c.kg)} · {formatToman(c.revenue)} · {num(c.invoices)} فاکتور
                      </div>
                    </div>
                  </div>
                  <div className="text-left shrink-0">
                    <div className={`text-xs font-bold font-mono ${profitColor(c.profit)}`}>{formatToman(c.profit)}</div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">{percent(c.marginPercent)}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2.5">
              <p className="text-[11px] text-slate-500 leading-5 px-1">
                ردیف‌های قرمز احتمالاً اشتباه تایپی دارند (قیمت، تعداد یا واحد). ردیف‌های زرد فروش زیر قیمت خرید هستند. با زدن هر ردیف فاکتور باز می‌شود و
                می‌توانید ویرایشش کنید؛ سود همه‌جا خودکار دوباره حساب می‌شود.
              </p>
              {data.suspicious.length === 0 ? (
                <Empty>مورد مشکوکی نیست.</Empty>
              ) : (
                data.suspicious.map((x, i) => <SuspiciousRow key={`${x.invoiceId}-${i}`} line={x} onOpen={openInvoice} />)
              )}
            </div>
          )}
        </div>
        {modal}
      </IonContent>
    </IonPage>
  );
};

const LotCard: React.FC<{ lot: LotRow; onOpen: (id: string) => void }> = ({ lot: l, onOpen }) => (
  <button onClick={() => onOpen(l.invoiceId)} className="w-full text-right bg-white rounded-2xl border border-slate-100 shadow-sm p-3">
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <h3 className="text-xs font-bold text-slate-800 truncate">{l.productName}</h3>
        <p className="text-[10px] text-slate-400 mt-0.5">
          {jDate(l.date)} · <span className="font-mono">{l.invoiceNumber}</span>
          {l.supplier ? ` · ${l.supplier}` : ''}
        </p>
      </div>
      <div className="text-left shrink-0">
        <div className={`text-sm font-bold font-mono ${profitColor(l.profit)}`}>{formatToman(l.profit)}</div>
        <div className="text-[10px] text-slate-400">{l.kgSold ? `سود ${percent(l.marginPercent)}` : 'هنوز فروش نرفته'}</div>
      </div>
    </div>

    <div className="flex items-center gap-2 mt-3 text-[11px]">
      <div className="flex-1 bg-amber-50 rounded-2xl px-2.5 py-2 text-center">
        <div className="text-[10px] text-amber-700">خرید هر کیلو</div>
        <div className="font-mono font-bold text-amber-800">{num(l.costPerKg)}</div>
      </div>
      <Coins className="w-4 h-4 text-slate-300 shrink-0" />
      <div className="flex-1 bg-sky-50 rounded-2xl px-2.5 py-2 text-center">
        <div className="text-[10px] text-sky-700">فروش هر کیلو</div>
        <div className="font-mono font-bold text-sky-800">{l.kgSold ? num(l.avgSellPerKg) : '—'}</div>
      </div>
      <div className="flex-1 bg-emerald-50 rounded-2xl px-2.5 py-2 text-center">
        <div className="text-[10px] text-emerald-700">سود هر کیلو</div>
        <div className={`font-mono font-bold ${l.kgSold ? profitColor(l.profitPerKg) : 'text-slate-400'}`}>{l.kgSold ? num(l.profitPerKg) : '—'}</div>
      </div>
    </div>

    <div className="mt-3">
      <div className="flex justify-between text-[10px] text-slate-500 mb-1">
        <span>
          فروخته <span className="font-mono">{weight(l.kgSold)}</span> از <span className="font-mono">{weight(l.kgIn)}</span>
        </span>
        <span>
          {l.kgLeft > 0 ? (
            <>
              مانده <span className="font-mono">{weight(l.kgLeft)}</span>
            </>
          ) : (
            'تمام شد'
          )}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, l.soldPercent)}%` }} />
      </div>
    </div>
    <div className="grid grid-cols-2 gap-2 mt-3 text-[11px]">
      <KV k="مبلغ خرید بار" v={formatToman(l.buyAmount)} />
      <KV k="فروش از این بار" v={formatToman(l.revenue)} />
    </div>
  </button>
);

const SuspiciousRow: React.FC<{ line: SuspiciousLine; onOpen: (id: string) => void }> = ({ line: x, onOpen }) => (
  <button
    onClick={() => onOpen(x.invoiceId)}
    className={`w-full text-right rounded-2xl border p-3 ${x.level === 'error' ? 'bg-rose-50/60 border-rose-200' : 'bg-amber-50/50 border-amber-200'}`}
  >
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <h3 className="text-xs font-bold text-slate-800 truncate">{x.productName}</h3>
        <p className="text-[10px] text-slate-500 mt-0.5">
          <span className="font-mono">{x.invoiceNumber}</span> · {jDate(x.date)} · {x.customerName}
        </p>
      </div>
      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0 ${x.level === 'error' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
        {x.level === 'error' ? 'احتمال اشتباه' : 'فروش با زیان'}
      </span>
    </div>
    <div className="grid grid-cols-4 gap-1.5 mt-3">
      <Mini label="مقدار" value={`${num(x.quantity, 2)} ${x.unit}`} sub={weight(x.kg)} />
      <Mini label="خرید/کیلو" value={num(x.costPerKg)} />
      <Mini label="فروش/کیلو" value={num(x.sellPerKg)} />
      <Mini label="سود" value={formatToman(x.profit)} sub={percent(x.marginPercent)} valueClass={profitColor(x.profit)} />
    </div>
  </button>
);
