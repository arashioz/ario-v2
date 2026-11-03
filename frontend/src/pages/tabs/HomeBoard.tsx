import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Receipt,
  Users,
  AlertCircle,
  Tag,
  BarChart3,
  CreditCard,
  PieChart,
  TrendingUp,
  Hourglass,
  Binoculars,
  Building2,
  Eye,
  EyeOff,
  Package,
  Wallet,
  ChevronLeft,
} from 'lucide-react';
import type { CustomerStats } from '../../services/customers.service';
import type { InvoiceStats } from '../../services/invoices.service';
import type { AccountingDashboard } from '../../services/accounting.service';
import { PARENT_COMPANY, type SupplierAccount } from '../../services/suppliers.service';
import { formatJalali, todayYmd } from '../../lib/jalali';
import { formatToman, num, percent, profitCaption, tons, weight } from '../../lib/format';
import Toman from '../../components/ui/Toman';
import { FollowUpCard } from '../../components/followups/FollowUpCard';
import { StickyNotesCard } from '../../components/notes/StickyNotesCard';
import { HomeTargetCard } from '../../components/target/HomeTargetCard';
import { WatchBoardCard } from '../../components/watch/WatchBoardCard';

export const HOME_WIDGETS = [
  { id: 'warehouse', title: 'انبار', hint: 'ارزش موجودی شرکت مادر' },
  { id: 'shortcuts', title: 'دسترسی سریع', hint: 'فاکتور، بدهی، کالا و هزینه' },
  { id: 'chart', title: 'نمودار فروش', hint: 'هفت روز، تومان یا وزن' },
  { id: 'collections', title: 'پرداختی‌ها', hint: 'نقد فروش و وصول نسیه' },
  { id: 'debts', title: 'طلب از مشتری', hint: 'بدهکاران و تعداد مشتری' },
  { id: 'company', title: 'بدهی به شرکت', hint: 'حساب شرکت مادر' },
  { id: 'today', title: 'کار امروز', hint: 'فروش، نسیه و وصول' },
  { id: 'profit', title: 'سود فروش', hint: 'امروز و این ماه' },
  { id: 'followups', title: 'پیگیری', hint: 'مشتری‌هایی که باید زنگ بزنید' },
  { id: 'notes', title: 'یادداشت', hint: 'یادداشت‌های روی میز' },
  { id: 'target', title: 'تارگت فروش', hint: 'هدف ماه آریو و فروش شما' },
  { id: 'watch', title: 'پایش مشتری', hint: 'گرید، صف تماس و پیشنهاد سفارش' },
] as const;

export type HomeWidgetId = (typeof HOME_WIDGETS)[number]['id'];
export const DEFAULT_HOME: HomeWidgetId[] = ['warehouse', 'shortcuts', 'today', 'profit', 'debts', 'collections', 'company', 'chart', 'followups', 'notes'];

export const homeOrder = (layout?: string[]): HomeWidgetId[] => {
  const known = new Set<string>(HOME_WIDGETS.map((item) => item.id));
  const picked = (layout || [])
    .map((id) => (id === 'modules' ? 'shortcuts' : id))
    .filter((id): id is HomeWidgetId => known.has(id));
  const order: HomeWidgetId[] = [];
  for (const id of picked) if (!order.includes(id)) order.push(id);
  if (!order.length) return [...DEFAULT_HOME];
  if (!order.includes('shortcuts')) {
    const at = order.indexOf('warehouse');
    order.splice(at >= 0 ? at + 1 : 0, 0, 'shortcuts');
  }
  return order;
};

export interface HouseSummary {
  name: string;
  count: number;
  kg: number;
  cost: number;
  current?: number;
  empty?: number;
}

export const HomeBoard: React.FC<{
  layout?: string[];
  houses: HouseSummary[];
  warehouseNames: string[];
  ready: boolean;
  homeDate: string;
  customerStats: CustomerStats | null;
  invoiceStats: InvoiceStats | null;
  acc: AccountingDashboard | null;
  supplier: SupplierAccount | null;
  showProfit: boolean;
  onToggleProfit: () => void;
  onNewCustomer: () => void;
  refreshKey: number;
}> = ({ layout, houses, warehouseNames, ready, homeDate, customerStats, invoiceStats, acc, supplier, showProfit, onToggleProfit, onNewCustomer, refreshKey }) => {
  const navigate = useNavigate();
  const [chartMode, setChartMode] = useState<'toman' | 'tonnage'>('toman');
  const [chartDay, setChartDay] = useState<number | null>(null);
  const [showStockValue, setShowStockValue] = useState(() => localStorage.getItem('ario-show-stock-value') !== '0');
  const order = homeOrder(layout);
  const shown = useMemo(() => {
    const named = houses.filter((house) => house.name && house.name !== 'بدون شرکت');
    const pin = warehouseNames.filter((name) => name && name !== 'بدون شرکت');
    if (!pin.length) return named;
    const byName = new Map(named.map((house) => [house.name, house]));
    const first = pin.map((name) => byName.get(name)).filter((house): house is HouseSummary => !!house);
    const rest = named.filter((house) => !pin.includes(house.name));
    return [...first, ...rest];
  }, [houses, warehouseNames]);
  const defaultHouse = useMemo(() => {
    const pin = warehouseNames.find((name) => name && name !== 'بدون شرکت');
    if (pin) return shown.find((house) => house.name === pin) || shown.find((house) => house.name === PARENT_COMPANY) || shown[0];
    return shown.find((house) => house.name === PARENT_COMPANY) || shown[0];
  }, [shown, warehouseNames]);
  const stockValue = defaultHouse ? defaultHouse.current || defaultHouse.cost : 0;
  const stockKg = defaultHouse?.kg || 0;
  const openWarehouse = () => navigate(defaultHouse ? `/inventory?company=${encodeURIComponent(defaultHouse.name)}` : '/inventory');
  const money = (n: number) => (showStockValue ? formatToman(n) : '••••••••');
  const toggleStockValue = () => {
    setShowStockValue((v) => {
      localStorage.setItem('ario-show-stock-value', v ? '0' : '1');
      return !v;
    });
  };
  const chartData = invoiceStats?.chartData || [];
  const maxVal = Math.max(...chartData.map((d) => (chartMode === 'toman' ? d.amount : d.weightKg)), 1);
  const selectedDay = chartDay ?? chartData.length - 1;
  const selected = chartData[selectedDay];

  const widgets: Record<HomeWidgetId, React.ReactNode> = {
    warehouse: (
      <button
        type="button"
        onClick={openWarehouse}
        className="relative block w-full overflow-hidden rounded-[28px] text-white text-right shadow-[0_12px_40px_rgba(0,122,255,0.28)] active:scale-[0.99]"
      >
        <span className="absolute inset-0 bg-gradient-to-br from-[#64D2FF] via-[#007AFF] to-[#0040DD]" />
        <span className="pointer-events-none absolute -left-8 -top-12 h-32 w-32 rounded-full bg-white/30 blur-2xl" />
        <span className="pointer-events-none absolute -bottom-12 right-0 h-28 w-40 rounded-full bg-white/15 blur-2xl" />
        <span className="relative block px-5 pt-4 pb-4">
          <span className="flex items-center justify-between gap-2">
            <span className="min-w-0">
              <span className="block text-[12px] font-semibold text-white/80">موجودی انبار</span>
              <span className="block text-[11px] text-white/60 truncate">{defaultHouse?.name || 'انبار'}</span>
            </span>
            <span className="shrink-0 inline-flex items-center gap-0.5 text-[11px] font-bold text-white/90">
              جزئیات
              <ChevronLeft className="w-3.5 h-3.5" />
            </span>
          </span>
          <span className="mt-3 flex items-end gap-1.5">
            <span className="text-[40px] font-bold leading-none tracking-tight">{ready ? tons(stockKg) : '—'}</span>
            <span className="mb-1 text-[15px] font-semibold text-white/80">تن</span>
          </span>
          <span className="mt-3 flex items-center justify-between gap-2 border-t border-white/20 pt-3">
            <span className="text-[12px] text-white/75">ارزش همین موجودی</span>
            <span className="flex items-center gap-2 min-w-0">
              <span className="font-mono text-[15px] font-bold truncate">{ready ? money(stockValue) : '—'}</span>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleStockValue();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleStockValue();
                  }
                }}
                className="w-7 h-7 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0"
                aria-label={showStockValue ? 'مخفی کردن مبلغ' : 'نمایش مبلغ'}
              >
                {showStockValue ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </span>
            </span>
          </span>
        </span>
      </button>
    ),
    shortcuts: (
      <div className="bg-white rounded-3xl p-2.5 border border-sky-100 shadow-sm">
        <div className="grid grid-cols-4 gap-1">
          {([
            ['فاکتور', Receipt, 'bg-sky-600', () => navigate('/tabs/pos')],
            ['بدهی', AlertCircle, 'bg-rose-600', () => navigate('/tabs/customers?filter=debtors')],
            ['نسیه', Hourglass, 'bg-amber-500', () => navigate('/credit-report')],
            ['کالاها', Tag, 'bg-slate-700', () => navigate('/products')],
            ['چک‌ها', CreditCard, 'bg-indigo-600', () => navigate('/cheques')],
            ['مشتری جدید', Users, 'bg-teal-600', onNewCustomer],
            ['هزینه‌ها', PieChart, 'bg-purple-600', () => navigate('/expenses')],
            ['پایش مشتری', Binoculars, 'bg-sky-700', () => navigate('/watch')],
          ] as const).map(([label, Icon, bg, go]) => (
            <button key={label} onClick={go} className="flex flex-col items-center gap-1 py-1.5 rounded-2xl active:bg-slate-50">
              <span className={`w-8 h-8 rounded-lg ${bg} text-white flex items-center justify-center`}><Icon className="w-4 h-4" /></span>
              <span className="text-[10px] font-medium text-slate-700 leading-tight">{label}</span>
            </button>
          ))}
        </div>
      </div>
    ),
    chart: (
      <div className="bg-white rounded-[24px] p-4 shadow-[0_1px_0_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.04)] space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div className="flex items-center gap-1.5">
            <BarChart3 className="w-4 h-4 text-sky-600" />
            <h3 className="text-xs font-semibold text-slate-800">خلاصه و روند فروش هفتگی</h3>
          </div>
          <div className="flex items-center p-0.5 bg-slate-100 rounded-xl text-[10px]">
            <button type="button" onClick={() => setChartMode('toman')} className={`px-2 py-1 rounded-lg font-medium ${chartMode === 'toman' ? 'bg-sky-600 text-white' : 'text-slate-600'}`}>تومانی</button>
            <button type="button" onClick={() => setChartMode('tonnage')} className={`px-2 py-1 rounded-lg font-medium ${chartMode === 'tonnage' ? 'bg-sky-600 text-white' : 'text-slate-600'}`}>وزن</button>
          </div>
        </div>
        <div className="pt-2">
          <div className="flex items-end justify-between gap-2 h-36 px-1">
            {chartData.map((d, idx) => {
              const val = chartMode === 'toman' ? d.amount : d.weightKg;
              const heightPercent = maxVal > 0 ? Math.max(12, Math.round((val / maxVal) * 100)) : 12;
              const active = idx === selectedDay;
              return (
                <button type="button" key={idx} onClick={() => setChartDay(idx)} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                  {chartMode === 'tonnage' && <span className="text-[9px] font-mono text-slate-500 truncate max-w-full">{num(val)}</span>}
                  <div className={`w-full max-w-[28px] bg-slate-100 rounded-xl overflow-hidden flex items-end h-24 ${active ? 'ring-2 ring-offset-1 ring-sky-300' : ''}`}>
                    <div style={{ height: `${heightPercent}%` }} className={`w-full rounded-xl ${chartMode === 'toman' ? 'bg-gradient-to-t from-sky-600 to-sky-400' : 'bg-gradient-to-t from-emerald-600 to-teal-400'}`} />
                  </div>
                  <span className={`text-[10px] mt-1 ${active ? 'text-sky-700 font-bold' : 'text-slate-500'}`}>{d.dayName.slice(0, 3)}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>فروش {selected && selectedDay !== chartData.length - 1 ? selected.dayName : 'امروز'}:</span>
            <span className="font-semibold text-slate-800">
              <Toman value={selected ? selected.amount : invoiceStats?.todaySalesAmount} />
              <span className="text-slate-400 font-normal mr-1 font-mono">({num(selected ? selected.weightKg : invoiceStats?.todaySalesWeightKg)} کیلو)</span>
            </span>
          </div>
        </div>
      </div>
    ),
    collections: (
      <button type="button" onClick={() => navigate('/tabs/customers')} className="w-full bg-white rounded-[24px] shadow-[0_1px_0_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.04)] p-4 text-right">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400">پرداختی‌ها</span>
          <span className="w-7 h-7 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center"><Wallet className="w-4 h-4" /></span>
        </div>
        <div className="text-sm font-semibold text-emerald-800 mt-1">{acc?.work ? formatToman((acc.work.sold || 0) - (acc.work.credit || 0) + (acc.work.priorCollected || 0)) : '...'}</div>
        <span className="text-[10px] text-slate-400 block mt-1">
          {acc?.work ? `نقد فروش ${formatToman(Math.max(0, (acc.work.sold || 0) - (acc.work.credit || 0)))} · وصول قبلی ${formatToman(acc.work.priorCollected || 0)}` : ''}
        </span>
      </button>
    ),
    debts: (
      <div className="grid grid-cols-2 gap-3">
        <div onClick={() => navigate('/tabs/customers?filter=debtors')} className="bg-white rounded-[24px] p-4 shadow-[0_1px_0_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.04)] cursor-pointer">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400">طلب از مشتری</span>
            <div className="w-7 h-7 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600"><AlertCircle className="w-4 h-4" /></div>
          </div>
          <div className="text-sm font-semibold text-rose-600">{customerStats ? <Toman value={customerStats.totalDebt} unitClassName="text-[10px] font-normal text-slate-400" /> : '...'}</div>
          <span className="text-[10px] text-slate-400 block mt-1">{customerStats ? num(customerStats.debtorsCount) : 0} مشتری بدهکار</span>
        </div>
        <div onClick={() => navigate('/tabs/customers')} className="bg-white rounded-[24px] p-4 shadow-[0_1px_0_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.04)] cursor-pointer">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400">مشتریان</span>
            <div className="w-7 h-7 rounded-xl bg-sky-50 flex items-center justify-center text-sky-600"><Users className="w-4 h-4" /></div>
          </div>
          <div className="text-sm font-semibold font-mono text-slate-800">
            {customerStats ? num(customerStats.shopsCount ?? customerStats.totalCustomers) : '...'}
            <span className="text-[10px] font-normal mr-1 text-slate-400">نفر</span>
          </div>
          <span className="text-[10px] text-emerald-600 block mt-1 font-medium">{customerStats ? num(customerStats.settledCount) : 0} تسویه کامل</span>
        </div>
      </div>
    ),
    company: (
      <button onClick={() => navigate('/supplier-account')} className="w-full bg-white rounded-[24px] p-4 shadow-[0_1px_0_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.04)] text-right">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400">بدهی به شرکت مادر</span>
          <div className="w-7 h-7 rounded-xl bg-fuchsia-50 flex items-center justify-center text-fuchsia-600"><Building2 className="w-4 h-4" /></div>
        </div>
        <div className="text-base font-semibold text-fuchsia-700 mt-1">{supplier ? <Toman value={supplier.summary.debt} unitClassName="text-[10px] font-normal text-slate-400" /> : '...'}</div>
        <span className="text-[10px] text-slate-400 block mt-1">{supplier ? `${num(supplier.summary.openInvoices)} فاکتور خرید باز · کل پرداختی ${formatToman(supplier.summary.totalPaid)}` : ''}</span>
      </button>
    ),
    today: (
      <div className="bg-white rounded-[24px] shadow-[0_1px_0_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <Package className="w-4 h-4 text-sky-600" />
            {homeDate === todayYmd() ? 'کار امروز' : `کار ${formatJalali(homeDate, { year: false })}`}
          </h3>
          <button onClick={() => navigate('/credit-report')} className="text-[11px] font-bold text-sky-700">گزارش نسیه</button>
        </div>
        <div className="divide-y divide-slate-100 text-xs">
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <span className="text-slate-500">بار فروخته‌شده</span>
            <span className="font-bold text-slate-800 text-left">
              {acc?.work ? (
                <>
                  <span className="font-mono">{formatToman(acc.work.sold)}</span>
                  <span className="block text-[10px] font-normal text-slate-400 font-mono">
                    {weight(acc.work.soldKg)} · {num(acc.work.invoices)} فاکتور
                    {(acc.work.factoryInvoices || 0) > 0 ? ` · ${num(acc.work.factoryInvoices)} کارخانه ${formatToman(acc.work.factorySold || 0)}` : ''}
                  </span>
                </>
              ) : '...'}
            </span>
          </div>
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <span className="text-amber-700">نسیه همین فروش</span>
            <span className="font-bold font-mono text-amber-800">{acc?.work ? formatToman(acc.work.credit) : '...'}</span>
          </div>
          <button onClick={() => navigate('/credit-report')} className="w-full px-4 py-3 flex items-center justify-between gap-3 text-right">
            <span className="text-emerald-700">وصول نسیه روزهای قبل</span>
            <span className="font-bold font-mono text-emerald-800">{acc?.work ? formatToman(acc.work.priorCollected) : '...'}</span>
          </button>
        </div>
      </div>
    ),
    profit: (
      <div className="bg-white rounded-[24px] shadow-[0_1px_0_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.04)] p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5"><TrendingUp className="w-4 h-4 text-emerald-600" />سود فروش</h3>
          <button type="button" onClick={onToggleProfit} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 text-[11px] font-bold" aria-pressed={showProfit}>
            {showProfit ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {showProfit ? 'مخفی' : 'نمایش'}
          </button>
        </div>
        {showProfit ? (
          <button onClick={() => navigate('/profit')} className="w-full grid grid-cols-2 gap-3 mt-3 text-right">
            {([
              ['امروز', acc?.today, acc?.todayChannels],
              ['این ماه', acc?.month, acc?.monthChannels],
            ] as const).map(([label, s, ch]) => (
              <div key={label} className="rounded-2xl bg-emerald-50/70 p-3">
                <div className="text-[11px] text-emerald-800">{label}</div>
                <div className={`text-sm font-bold font-mono mt-0.5 ${s && s.profit > 0 ? 'text-emerald-900' : s && s.profit < 0 ? 'text-rose-800' : 'text-slate-700'}`}>
                  {s ? profitCaption(s.profit, { sold: s.revenue, unknown: s.unknownRevenue }) : '...'}
                </div>
                <div className="text-[10px] text-emerald-700/80 font-mono mt-0.5">
                  {s ? (s.revenue > 0 && Math.abs(s.profit) < 0.5 ? `فروش ${formatToman(s.revenue)}` : `${percent(s.marginPercent)} · کیلویی ${formatToman(s.profitPerKg)}`) : ''}
                </div>
                {s && (s.unknownRevenue || 0) > 0 && Math.abs(s.profit) > 0.5 && (
                  <div className="text-[10px] text-amber-800 mt-1 leading-4">بهای {formatToman(s.unknownRevenue)} فروش ثبت نشده</div>
                )}
                {ch && (ch.factory.profit !== 0 || ch.factory.revenue > 0 || (ch.factory.unknownRevenue || 0) > 0) && (
                  <div className="text-[10px] text-emerald-800/80 mt-1 leading-4">
                    مغازه {profitCaption(ch.shop.profit, { sold: ch.shop.revenue, unknown: ch.shop.unknownRevenue })}
                    <br />
                    کارخانه {profitCaption(ch.factory.profit, { sold: ch.factory.revenue, unknown: ch.factory.unknownRevenue })}
                  </div>
                )}
              </div>
            ))}
          </button>
        ) : (
          <p className="text-[11px] text-slate-400 mt-2">سود امروز و این ماه با دکمه نمایش باز می‌شود.</p>
        )}
      </div>
    ),
    followups: <FollowUpCard refreshKey={refreshKey} />,
    notes: <StickyNotesCard refreshKey={refreshKey} />,
    target: <HomeTargetCard refreshKey={refreshKey} />,
    watch: <WatchBoardCard refreshKey={refreshKey} />,
  };

  return (
    <>
      {order.map((id) => (
        <React.Fragment key={id}>{widgets[id]}</React.Fragment>
      ))}
    </>
  );
};
