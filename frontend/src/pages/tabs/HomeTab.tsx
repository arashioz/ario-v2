import React, { useState, useEffect, useCallback } from 'react';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonContent,
  IonRefresher,
  IonRefresherContent,
} from '@ionic/react';
import type { RefresherEventDetail } from '@ionic/react';
import { useAuth } from '../../context/AuthContext';
import { customersService } from '../../services/customers.service';
import type { CustomerStats } from '../../services/customers.service';
import { productsService } from '../../services/products.service';
import type { ProductStats } from '../../services/products.service';
import { invoicesService } from '../../services/invoices.service';
import type { InvoiceStats } from '../../services/invoices.service';
import { accountingService } from '../../services/accounting.service';
import type { AccountingDashboard } from '../../services/accounting.service';
import { formatJalali, jalaliMonthRange, todayYmd, ymdToJalali } from '../../lib/jalali';
import { JalaliDateSheet } from '../../components/ui/JalaliDatePicker';
import { formatToman, num, percent, tons, weight } from '../../lib/format';
import { suppliersService } from '../../services/suppliers.service';
import type { SupplierAccount } from '../../services/suppliers.service';
import Toman from '../../components/ui/Toman';
import { NewCustomerModal } from '../../components/customers/NewCustomerModal';
import { FollowUpCard } from '../../components/followups/FollowUpCard';
import { StickyNotesCard } from '../../components/notes/StickyNotesCard';
import { PendingProformasBanner } from '../../components/proformas/PendingProformasBanner';
import {
  Receipt,
  Users,
  AlertCircle,
  ShieldCheck,
  Briefcase,
  Wallet,
  Tag,
  Scale,
  Boxes,
  MapPin,
  BarChart3,
  CreditCard,
  PieChart,
  TrendingUp,
  Hourglass,
  Flame,
  Building2,
  Eye,
  EyeOff,
  Package,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const HomeTab: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [customerStats, setCustomerStats] = useState<CustomerStats | null>(null);
  const [productStats, setProductStats] = useState<ProductStats | null>(null);
  const [invoiceStats, setInvoiceStats] = useState<InvoiceStats | null>(null);
  const [acc, setAcc] = useState<AccountingDashboard | null>(null);
  const [supplier, setSupplier] = useState<SupplierAccount | null>(null);
  const [chartDay, setChartDay] = useState<number | null>(null);
  const [isNewCustomerOpen, setIsNewCustomerOpen] = useState(false);
  const [showProfit, setShowProfit] = useState(() => localStorage.getItem('ario-show-profit') === '1');
  const [homeDate, setHomeDate] = useState(todayYmd);
  const [dateOpen, setDateOpen] = useState(false);

  // Chart Metric Mode: 'toman' vs 'tonnage'
  const [chartMode, setChartMode] = useState<'toman' | 'tonnage'>('toman');

  const loadAllStats = useCallback(async () => {
    try {
      const today = homeDate;
      const j = ymdToJalali(today);
      const [cStats, pStats, iStats, aStats, sAcc] = await Promise.all([
        customersService.getCustomerStats().catch(() => null),
        productsService.getStats().catch(() => null),
        invoicesService.getStats().catch(() => null),
        accountingService.dashboard(today, jalaliMonthRange(j.jy, j.jm).from).catch(() => null),
        suppliersService.account().catch(() => null),
      ]);
      if (aStats) setAcc(aStats);
      if (sAcc) setSupplier(sAcc);
      if (cStats) setCustomerStats(cStats);
      if (pStats) setProductStats(pStats);
      if (iStats) setInvoiceStats(iStats);
    } catch (e) {
      console.warn('Stats load error', e);
    }
  }, [homeDate]);

  useEffect(() => {
    loadAllStats();
  }, [loadAllStats]);

  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = async (e: CustomEvent<RefresherEventDetail>) => {
    setRefreshKey((k) => k + 1);
    await loadAllStats();
    e.detail.complete();
  };

  const toggleProfit = () => {
    setShowProfit((v) => {
      localStorage.setItem('ario-show-profit', v ? '0' : '1');
      return !v;
    });
  };

  const chartData = invoiceStats?.chartData || [];
  const maxVal = Math.max(
    ...chartData.map((d) => (chartMode === 'toman' ? d.amount : d.weightKg)),
    1,
  );
  const selectedDay = chartDay ?? chartData.length - 1;
  const selected = chartData[selectedDay];

  return (
    <IonPage>
      <IonHeader className="ion-no-border">
        <IonToolbar className="bg-white/95 backdrop-blur-md px-4 py-2 border-b border-sky-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-sky-600 to-sky-400 flex items-center justify-center text-white">
                <span className="font-semibold text-xs">آ</span>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-1.5">
                  <h1 className="text-sm font-semibold text-slate-800">
                    {user?.fullName || 'کاربر گرامی'}
                  </h1>
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${
                      user?.role === 'admin'
                        ? 'bg-sky-50 text-sky-800 border border-sky-200'
                        : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    }`}
                  >
                    {user?.role === 'admin' ? (
                      <>
                        <ShieldCheck className="w-3 h-3 text-sky-600" />
                        <span>مدیر</span>
                      </>
                    ) : (
                      <>
                        <Briefcase className="w-3 h-3 text-emerald-600" />
                        <span>بازاریاب</span>
                      </>
                    )}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={() => navigate('/customers-map')}
              className="p-1.5 rounded-xl bg-sky-50 text-sky-600 hover:bg-sky-100 transition active:scale-95 border border-sky-200/60"
              title="نقشه مشتریان"
            >
              <MapPin className="w-4 h-4" />
            </button>
          </div>
        </IonToolbar>
      </IonHeader>

      <IonContent fullscreen className="bg-slate-50">
        <IonRefresher slot="fixed" onIonRefresh={handleRefresh}>
          <IonRefresherContent />
        </IonRefresher>

        <div className="p-3.5 space-y-4 max-w-md mx-auto pb-8">
          <PendingProformasBanner refreshKey={refreshKey} />

          <button
            type="button"
            onClick={() => setDateOpen(true)}
            className="w-full text-center text-xs font-medium text-slate-500 py-0.5 active:opacity-70"
          >
            {formatJalali(homeDate, { weekday: true })}
          </button>

          {/* Inventory Top Banner: Tonnage & Tomans (موجودی انبار تناژی و تومانی) */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-sky-600 via-sky-700 to-blue-700 p-4 text-white shadow-lg shadow-sky-500/20 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold flex items-center gap-1.5">
                <Boxes className="w-4 h-4" />
                موجودی انبار
              </h2>
              <button
                onClick={() => navigate('/inventory')}
                className="bg-white/20 hover:bg-white/30 text-white text-[11px] font-medium px-2.5 py-1 rounded-xl transition"
              >
                جزئیات
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5 border-t border-white/20 pt-2.5">
              <button onClick={() => navigate('/inventory')} className="bg-white/10 backdrop-blur-md p-3 rounded-2xl text-right">
                <div className="flex items-center gap-1 text-[11px] text-sky-100 mb-0.5">
                  <Scale className="w-3.5 h-3.5" />
                  <span>موجودی دقیق</span>
                </div>
                <div className="text-base font-semibold font-mono">
                  {acc ? num(acc.stockKg, 1) : '...'}
                  <span className="text-xs font-normal mr-1">کیلو</span>
                </div>
                <span className="text-[10px] text-sky-200 block mt-0.5">
                  {acc ? tons(acc.stockKg) : '...'} تن · {productStats ? num(productStats.totalProducts) : 0} قلم
                </span>
              </button>

              <button onClick={() => navigate('/inventory')} className="bg-white/10 backdrop-blur-md p-3 rounded-2xl text-right">
                <div className="flex items-center gap-1 text-[11px] text-sky-100 mb-0.5">
                  <Wallet className="w-3.5 h-3.5" />
                  <span>ارزش فعلی (عمده)</span>
                </div>
                <div className="text-base font-semibold font-mono">
                  {acc?.currentValue ? formatToman(acc.currentValue.wholesale) : '...'}
                </div>
              </button>
            </div>
          </div>

          <div className="bg-white rounded-3xl p-2.5 border border-sky-100 shadow-sm">
            <div className="grid grid-cols-4 gap-1">
              {([
                ['فاکتور', Receipt, 'bg-sky-600', () => navigate('/tabs/pos')],
                ['بدهی', AlertCircle, 'bg-rose-600', () => navigate('/tabs/customers?filter=debtors')],
                ['نسیه', Hourglass, 'bg-amber-500', () => navigate('/credit-report')],
                ['کالاها', Tag, 'bg-slate-700', () => navigate('/products')],
                ['چک‌ها', CreditCard, 'bg-indigo-600', () => navigate('/cheques')],
                ['مشتری جدید', Users, 'bg-teal-600', () => setIsNewCustomerOpen(true)],
                ['هزینه‌ها', PieChart, 'bg-purple-600', () => navigate('/expenses')],
                ['تورم', Flame, 'bg-orange-500', () => navigate('/inflation')],
              ] as const).map(([label, Icon, bg, go]) => (
                <button
                  key={label}
                  onClick={go}
                  className="flex flex-col items-center gap-1 py-1.5 rounded-2xl active:bg-slate-50 active:scale-95 transition"
                >
                  <span className={`w-8 h-8 rounded-lg ${bg} text-white flex items-center justify-center`}>
                    <Icon className="w-4 h-4" />
                  </span>
                  <span className="text-[10px] font-medium text-slate-700 leading-tight">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Sales Chart Section (فروش روی نمودار: تناژی و تومانی) */}
          <div className="bg-white rounded-3xl p-3.5 border border-sky-100 shadow-sm space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-1.5">
                <BarChart3 className="w-4 h-4 text-sky-600" />
                <h3 className="text-xs font-semibold text-slate-800">
                  خلاصه و روند فروش هفتگی
                </h3>
              </div>

              {/* Toggle: Toman vs Tonnage */}
              <div className="flex items-center p-0.5 bg-slate-100 rounded-xl text-[10px]">
                <button
                  type="button"
                  onClick={() => setChartMode('toman')}
                  className={`px-2 py-1 rounded-lg transition font-medium ${
                    chartMode === 'toman'
                      ? 'bg-sky-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  تومانی
                </button>
                <button
                  type="button"
                  onClick={() => setChartMode('tonnage')}
                  className={`px-2 py-1 rounded-lg transition font-medium ${
                    chartMode === 'tonnage'
                      ? 'bg-sky-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  وزن
                </button>
              </div>
            </div>

            {/* Interactive Bar Chart Visualization */}
            <div className="pt-2">
              <div className="flex items-end justify-between gap-2 h-36 px-1">
                {chartData.map((d, idx) => {
                  const val = chartMode === 'toman' ? d.amount : d.weightKg;
                  const heightPercent = maxVal > 0 ? Math.max(12, Math.round((val / maxVal) * 100)) : 12;

                  const active = idx === selectedDay;
                  return (
                    <button
                      type="button"
                      key={idx}
                      onClick={() => setChartDay(idx)}
                      className="flex-1 flex flex-col items-center gap-1 h-full justify-end group"
                    >
                      {chartMode === 'tonnage' && (
                        <span className="text-[9px] font-mono text-slate-500 truncate max-w-full">{num(val)}</span>
                      )}

                      {/* Bar Pillar */}
                      <div
                        className={`w-full max-w-[28px] bg-slate-100 rounded-xl overflow-hidden flex items-end h-24 ${active ? 'ring-2 ring-offset-1 ring-sky-300' : ''}`}
                      >
                        <div
                          style={{ height: `${heightPercent}%` }}
                          className={`w-full rounded-xl transition-all duration-500 ${
                            chartMode === 'toman'
                              ? 'bg-gradient-to-t from-sky-600 to-sky-400 group-hover:from-sky-700 group-hover:to-sky-500'
                              : 'bg-gradient-to-t from-emerald-600 to-teal-400 group-hover:from-emerald-700 group-hover:to-teal-500'
                          }`}
                        />
                      </div>

                      {/* Day Label */}
                      <span className={`text-[10px] font-normal mt-1 ${active ? 'text-sky-700 font-bold' : 'text-slate-500'}`}>
                        {d.dayName.slice(0, 3)}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>فروش {selected && selectedDay !== chartData.length - 1 ? selected.dayName : 'امروز'}:</span>
                <span className="font-semibold text-slate-800">
                  <Toman value={selected ? selected.amount : invoiceStats?.todaySalesAmount} />
                  <span className="text-slate-400 font-normal mr-1 font-mono">
                    ({num(selected ? selected.weightKg : invoiceStats?.todaySalesWeightKg)} کیلو)
                  </span>
                </span>
              </div>
            </div>
          </div>

          {/* Quick Metrics Grid (Market Debts & Customers) */}
          <div className="grid grid-cols-2 gap-3">
            {/* Debtors Metric Card */}
            <div
              onClick={() => navigate('/tabs/customers?filter=debtors')}
              className="bg-white rounded-2xl p-3 border border-rose-100 shadow-sm cursor-pointer hover:shadow-md transition active:scale-98"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-400 font-normal">طلب از مشتری</span>
                <div className="w-7 h-7 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600">
                  <AlertCircle className="w-4 h-4" />
                </div>
              </div>
              <div className="text-sm font-semibold text-rose-600">
                {customerStats ? <Toman value={customerStats.totalDebt} unitClassName="text-[10px] font-normal text-slate-400" /> : '...'}
              </div>
              <span className="text-[10px] text-slate-400 block mt-1">
                {customerStats ? num(customerStats.debtorsCount) : 0} مشتری بدهکار
              </span>
            </div>

            {/* Total Customers */}
            <div
              onClick={() => navigate('/tabs/customers')}
              className="bg-white rounded-2xl p-3 border border-sky-100 shadow-sm cursor-pointer hover:shadow-md transition active:scale-98"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-400 font-normal">فروشندگان (مشتریان)</span>
                <div className="w-7 h-7 rounded-xl bg-sky-50 flex items-center justify-center text-sky-600">
                  <Users className="w-4 h-4" />
                </div>
              </div>
              <div className="text-sm font-semibold font-mono text-slate-800">
                {customerStats ? num(customerStats.shopsCount ?? customerStats.totalCustomers) : '...'}
                <span className="text-[10px] font-normal mr-1 text-slate-400">نفر</span>
              </div>
              <span className="text-[10px] text-emerald-600 block mt-1 font-medium">
                {customerStats ? num(customerStats.settledCount) : 0} مشتری تسویه کامل
              </span>
            </div>

            <button
              onClick={() => navigate('/supplier-account')}
              className="col-span-2 bg-white rounded-2xl p-3 border border-fuchsia-100 shadow-sm text-right hover:shadow-md transition active:scale-98"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 font-normal">بدهی به شرکت مادر</span>
                <div className="w-7 h-7 rounded-xl bg-fuchsia-50 flex items-center justify-center text-fuchsia-600">
                  <Building2 className="w-4 h-4" />
                </div>
              </div>
              <div className="text-base font-semibold text-fuchsia-700 mt-1">
                {supplier ? <Toman value={supplier.summary.debt} unitClassName="text-[10px] font-normal text-slate-400" /> : '...'}
              </div>
              <span className="text-[10px] text-slate-400 block mt-1">
                {supplier
                  ? `${num(supplier.summary.openInvoices)} فاکتور خرید باز · کل پرداختی ${formatToman(supplier.summary.totalPaid)}`
                  : ''}
              </span>
            </button>
          </div>

          <FollowUpCard refreshKey={refreshKey} />
          <StickyNotesCard refreshKey={refreshKey} />

          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Package className="w-4 h-4 text-sky-600" />
                {homeDate === todayYmd() ? 'کار امروز' : `کار ${formatJalali(homeDate, { year: false })}`}
              </h3>
              <button onClick={() => navigate('/credit-report')} className="text-[11px] font-bold text-sky-700">
                گزارش نسیه
              </button>
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
                      </span>
                    </>
                  ) : (
                    '...'
                  )}
                </span>
              </div>
              <div className="px-4 py-3 flex items-center justify-between gap-3">
                <span className="text-amber-700">نسیه همین فروش</span>
                <span className="font-bold font-mono text-amber-800 text-left">
                  {acc?.work ? formatToman(acc.work.credit) : '...'}
                  {acc?.work && acc.work.sold > 0 && (
                    <span className="block text-[10px] font-normal text-amber-600">
                      {percent((acc.work.credit / acc.work.sold) * 100)} از فروش
                    </span>
                  )}
                </span>
              </div>
              <button
                onClick={() => navigate('/credit-report')}
                className="w-full px-4 py-3 flex items-center justify-between gap-3 text-right"
              >
                <span className="text-emerald-700">وصول نسیه روزهای قبل</span>
                <span className="font-bold font-mono text-emerald-800">
                  {acc?.work ? formatToman(acc.work.priorCollected) : '...'}
                </span>
              </button>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-emerald-100 shadow-sm p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                سود فروش
              </h3>
              <button
                type="button"
                onClick={toggleProfit}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 text-[11px] font-bold active:scale-95"
                aria-pressed={showProfit}
                aria-label={showProfit ? 'مخفی کردن سود' : 'نمایش سود'}
              >
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
                    <div className="text-sm font-bold font-mono text-emerald-900 mt-0.5">{s ? formatToman(s.profit) : '...'}</div>
                    <div className="text-[10px] text-emerald-700/80 font-mono mt-0.5">
                      {s ? `${percent(s.marginPercent)} · کیلویی ${formatToman(s.profitPerKg)}` : ''}
                    </div>
                    {ch && (ch.factory.profit !== 0 || ch.factory.revenue > 0) && (
                      <div className="text-[10px] text-emerald-800/80 mt-1 leading-4">
                        مغازه {formatToman(ch.shop.profit)}
                        <br />
                        کارخانه {formatToman(ch.factory.profit)}
                      </div>
                    )}
                  </div>
                ))}
              </button>
            ) : (
              <p className="text-[11px] text-slate-400 mt-2">سود امروز و این ماه با دکمه نمایش باز می‌شود.</p>
            )}
          </div>
        </div>

        {/* New Customer Modal */}
        <JalaliDateSheet
          open={dateOpen}
          value={homeDate}
          title="تاریخ"
          max={todayYmd()}
          onClose={() => setDateOpen(false)}
          onSelect={setHomeDate}
        />

        <NewCustomerModal
          isOpen={isNewCustomerOpen}
          onClose={() => setIsNewCustomerOpen(false)}
          onCustomerCreated={() => {
            loadAllStats();
            setIsNewCustomerOpen(false);
          }}
        />
      </IonContent>
    </IonPage>
  );
};
