import React, { useState, useEffect } from 'react';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonContent,
  IonRefresher,
  IonRefresherContent,
} from '@ionic/react';
import {
  ArrowRight,
  Plus,
  RefreshCw,
  Search,
  Wallet,
  TrendingUp,
  Truck,
  Users,
  Lightbulb,
  Building,
  HelpCircle,
  Calendar,
  AlertCircle,
  Trash2,
  PieChart,
  Lock,
  Unlock,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { expensesService } from '../services/expenses.service';
import type { ExpenseItem, ProfitLossReport } from '../services/expenses.service';
import { useNotification } from '../context/NotificationContext';
import { NewExpenseModal } from '../components/expenses/NewExpenseModal';
import { PeriodPicker, periodPresets } from '../components/ui/PeriodPicker';
import type { Period } from '../components/ui/PeriodPicker';
import { formatToman, percent, tons } from '../lib/format';

export const ExpensesPage: React.FC = () => {
  const navigate = useNavigate();
  const { showNotification } = useNotification();

  const PROFIT_PASSWORD = 'arash5Gs200';
  const [isUnlocked, setIsUnlocked] = useState<boolean>(() => {
    return sessionStorage.getItem('ario_profit_unlocked') === '1';
  });
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [showPasswordText, setShowPasswordText] = useState(false);

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput.trim() === PROFIT_PASSWORD) {
      setIsUnlocked(true);
      sessionStorage.setItem('ario_profit_unlocked', '1');
      setPasswordError('');
      setPasswordInput('');
      showNotification({
        title: 'احراز هویت موفق',
        message: 'بخش سود مغازه و برداشت شخصی مدیر باز شد.',
        type: 'success',
      });
    } else {
      setPasswordError('رمز عبور وارد شده نادرست است.');
    }
  };

  const handleLock = () => {
    setIsUnlocked(false);
    sessionStorage.removeItem('ario_profit_unlocked');
    setPasswordInput('');
    setPasswordError('');
    showNotification({
      title: 'قفل شد',
      message: 'بخش سود مغازه و برداشت شخصی مجدداً قفل شد.',
      type: 'info',
    });
  };

  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [report, setReport] = useState<ProfitLossReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'withdrawals' | 'shipping' | 'salary' | 'store'>('all');
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [defaultIsWithdrawal, setDefaultIsWithdrawal] = useState(false);

  const [period, setPeriod] = useState<Period>(() => periodPresets()[0]);

  const loadData = async () => {
    try {
      setLoading(true);
      const range = { startDate: period.from, endDate: period.to };
      const [list, rep] = await Promise.all([
        expensesService.getAll(range),
        expensesService.getProfitLoss(range),
      ]);
      setExpenses(list);
      setReport(rep);
    } catch {
      showNotification({
        title: 'خطا در بارگذاری',
        message: 'امکان اتصال به سرور جهت دریافت داده‌های هزینه‌ها وجود ندارد.',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const handleDelete = async (id: string, isWithdrawal: boolean) => {
    if (!window.confirm(`آیا از حذف این ${isWithdrawal ? 'برداشت شخصی' : 'هزینه'} اطمینان دارید؟`)) {
      return;
    }

    try {
      await expensesService.delete(id);
      showNotification({
        title: 'حذف موفق',
        message: 'مورد با موفقیت حذف شد.',
        type: 'success',
      });
      loadData();
    } catch {
      showNotification({
        title: 'خطا در حذف',
        message: 'امکان حذف هزینه وجود ندارد.',
        type: 'error',
      });
    }
  };

  // Filter list
  const filteredExpenses = expenses.filter((e) => {
    if (activeTab === 'withdrawals' && !e.isPersonalWithdrawal && e.type !== 'withdrawal') {
      return false;
    }
    if (activeTab === 'shipping' && e.type !== 'shipping') {
      return false;
    }
    if (activeTab === 'salary' && e.type !== 'salary') {
      return false;
    }
    if (activeTab === 'store' && (e.isPersonalWithdrawal || e.type === 'withdrawal')) {
      return false;
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const matchDesc = e.description?.toLowerCase().includes(q);
      const matchCat = e.categoryName?.toLowerCase().includes(q);
      const matchAmount = e.amount?.toString().includes(q);
      if (!matchDesc && !matchCat && !matchAmount) return false;
    }
    return true;
  });

  const formatDate = (isoString?: string) => {
    if (!isoString) return '-';
    try {
      const d = new Date(isoString);
      return new Intl.DateTimeFormat('fa-IR', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }).format(d);
    } catch {
      return isoString;
    }
  };

  const getCategoryIcon = (type: string, isWithdrawal: boolean) => {
    if (isWithdrawal || type === 'withdrawal') {
      return <Wallet className="w-4 h-4 text-purple-600" />;
    }
    switch (type) {
      case 'shipping':
        return <Truck className="w-4 h-4 text-sky-600" />;
      case 'salary':
        return <Users className="w-4 h-4 text-emerald-600" />;
      case 'utilities':
        return <Lightbulb className="w-4 h-4 text-amber-600" />;
      case 'rent':
        return <Building className="w-4 h-4 text-indigo-600" />;
      default:
        return <HelpCircle className="w-4 h-4 text-slate-500" />;
    }
  };

  return (
    <IonPage>
      {/* Top Header */}
      <IonHeader className="ion-no-border">
        <IonToolbar className="bg-white/85 backdrop-blur-xl px-4 py-2 border-b border-sky-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate(-1)}
                className="p-2 rounded-2xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition active:scale-95"
              >
                <ArrowRight className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-sm font-black text-slate-800">
                  سود مغازه و برداشت شخصی مدیر
                </h1>
                <p className="text-[10px] text-slate-400">
                  آنالیز سود واقعی، تفکیک هزینه‌های جاری و دخل و برداشت‌ها
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isUnlocked ? (
                <button
                  onClick={handleLock}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-2xl bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-bold transition active:scale-95"
                  title="قفل کردن بخش سود و برداشت"
                >
                  <Unlock className="w-3.5 h-3.5 text-purple-600" />
                  <span className="text-[11px]">قفل مجدد</span>
                </button>
              ) : (
                <div
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-2xl bg-slate-100 text-slate-500 text-[11px] font-bold"
                  title="بخش سود و برداشت قفل است"
                >
                  <Lock className="w-3.5 h-3.5 text-slate-400" />
                  <span>محافظت‌شده</span>
                </div>
              )}
              <button
                onClick={loadData}
                disabled={loading}
                className="p-2 rounded-2xl bg-sky-50 text-sky-600 hover:bg-sky-100 transition active:scale-95 disabled:opacity-50"
                title="به‌روزرسانی"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => {
                  setDefaultIsWithdrawal(false);
                  setIsNewModalOpen(true);
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-sky-600 hover:bg-sky-700 text-white font-extrabold text-xs shadow-md shadow-sky-600/25 transition active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>ثبت هزینه</span>
              </button>
            </div>
          </div>
        </IonToolbar>
      </IonHeader>

      <IonContent fullscreen className="bg-slate-50">
        <IonRefresher
          slot="fixed"
          onIonRefresh={(e) => {
            loadData().finally(() => e.detail.complete());
          }}
        >
          <IonRefresherContent />
        </IonRefresher>

        <div className="p-3 space-y-3 max-w-lg mx-auto pb-8" dir="rtl">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-500">بازه گزارش</span>
            <PeriodPicker value={period} onChange={setPeriod} />
          </div>
          {/* ============================================================== */}
          {/* THREE CORE METRICS REQUESTED BY USER (PROTECTED BY PASSWORD)   */}
          {/* 1. چقدر مغازم سود کرده (بدون کم کردن برداشت مدیر)             */}
          {/* 2. چقدر برداشت کردم (مجموع برداشت‌های شخصی مدیر)               */}
          {/* 3. از سود کم کنه (سود باقی‌مانده پس از برداشت)                  */}
          {/* ============================================================== */}
          {!isUnlocked ? (
            <div className="bg-white rounded-3xl p-5 border border-purple-100 shadow-sm text-center">
              <div className="w-14 h-14 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mx-auto mb-3 border border-purple-100">
                <Lock className="w-7 h-7" />
              </div>
              <h3 className="text-sm font-black text-slate-800">
                سود مغازه و برداشت شخصی مدیر
              </h3>
              <p className="text-[11px] text-slate-500 mt-1 max-w-sm mx-auto leading-relaxed">
                مشاهده سود خالص مغازه، تراز مالی و مبالغ برداشت‌های شخصی مدیر با رمز عبور محافظت شده است.
              </p>

              <form onSubmit={handleUnlock} className="mt-4 max-w-xs mx-auto space-y-2.5">
                <div className="relative">
                  <input
                    type={showPasswordText ? 'text' : 'password'}
                    value={passwordInput}
                    onChange={(e) => {
                      setPasswordInput(e.target.value);
                      setPasswordError('');
                    }}
                    placeholder="رمز عبور را وارد کنید"
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-center font-mono focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500 transition"
                    dir="ltr"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswordText(!showPasswordText)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                    tabIndex={-1}
                  >
                    {showPasswordText ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {passwordError && (
                  <p className="text-[11px] text-rose-600 font-bold">{passwordError}</p>
                )}

                <button
                  type="submit"
                  className="w-full py-2.5 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs shadow-md shadow-purple-600/25 active:scale-95 transition flex items-center justify-center gap-1.5"
                >
                  <Unlock className="w-4 h-4" />
                  <span>نمایش سود و برداشت‌ها</span>
                </button>
              </form>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3">
                {/* CARD 1: سود خالص واقعی مغازه */}
                <div className="bg-gradient-to-br from-emerald-600 to-teal-700 rounded-2xl p-4 text-white shadow-xl shadow-emerald-700/20 relative overflow-hidden border border-emerald-400/30">
                  <div className="absolute -left-6 -bottom-6 w-32 h-32 bg-white/10 rounded-full blur-xl pointer-events-none" />
                  <div className="flex items-start justify-between relative z-10">
                    <div>
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/40 text-emerald-100 text-[11px] font-extrabold backdrop-blur-md mb-2">
                        <TrendingUp className="w-3.5 h-3.5" />
                        <span>سود خالص مغازه (بدون کم کردن برداشت‌های مدیر)</span>
                      </div>
                      <h2 className="text-2xl font-black font-mono tracking-tight text-white">
                        {(report?.profitAnalysis?.netStoreProfit || 0).toLocaleString('fa-IR')}
                        <span className="text-xs font-normal text-emerald-100 mr-1.5">تومان</span>
                      </h2>
                      <p className="text-[11px] text-emerald-100/90 mt-1 font-medium leading-relaxed">
                        «چقدر مغازم سود کرده»: سود ناخالص فروشگاه منهای کلیه هزینه‌های جاری مغازه (ارسال، قبوض، حقوق پرسنل).
                      </p>
                    </div>
                  </div>
                </div>

                {/* CARD 2: مجموع برداشت‌های شخصی مدیر */}
                <div className="bg-gradient-to-br from-purple-700 to-indigo-800 rounded-2xl p-4 text-white shadow-xl shadow-purple-800/20 relative overflow-hidden border border-purple-400/30">
                  <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-white/10 rounded-full blur-xl pointer-events-none" />
                  <div className="flex items-start justify-between relative z-10">
                    <div className="w-full">
                      <div className="flex items-center justify-between mb-2">
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-500/40 text-purple-100 text-[11px] font-extrabold backdrop-blur-md">
                          <Wallet className="w-3.5 h-3.5 text-purple-200" />
                          <span>مجموع برداشت‌های شخصی مدیر</span>
                        </div>
                        <button
                          onClick={() => {
                            setDefaultIsWithdrawal(true);
                            setIsNewModalOpen(true);
                          }}
                          className="px-2.5 py-1 rounded-full bg-white/20 hover:bg-white/30 text-white text-[10px] font-bold transition flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" />
                          <span>برداشت جدید</span>
                        </button>
                      </div>

                      <h2 className="text-2xl font-black font-mono tracking-tight text-white">
                        {(report?.profitAnalysis?.managerWithdrawals || 0).toLocaleString('fa-IR')}
                        <span className="text-xs font-normal text-purple-200 mr-1.5">تومان</span>
                      </h2>
                      <div className="flex items-center justify-between text-[11px] text-purple-100/90 mt-1">
                        <span>«ببینم چقدر برداشت کردم»: مجموع برداشت‌ها از دخل و حساب</span>
                        <span className="font-mono bg-purple-900/40 px-2 py-0.5 rounded-lg border border-purple-400/20">
                          {(report?.expensesSummary?.byType?.withdrawal?.count ?? 0).toLocaleString('fa-IR')} فقره برداشت
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* CARD 3: سود نهایی پس از کسر برداشت شخصی مدیر */}
                <div className="bg-white rounded-2xl p-3 border border-slate-200 shadow-sm flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-bold text-slate-500">
                      سود انباشته پس از کسر برداشت‌های شخصی مدیر:
                    </span>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      سود مغازه منهای مجموع برداشت‌های شخصی
                    </p>
                  </div>
                  <div className="text-left font-mono">
                    <span
                      className={`text-lg font-black ${
                        (report?.profitAnalysis?.retainedProfit || 0) >= 0
                          ? 'text-emerald-600'
                          : 'text-amber-600'
                      }`}
                    >
                      {(report?.profitAnalysis?.retainedProfit || 0).toLocaleString('fa-IR')}
                    </span>
                    <span className="text-[10px] text-slate-400 mr-1">تومان</span>
                  </div>
                </div>
              </div>

              {/* Detailed Financial Overview Accordion / Summary */}
              <div className="bg-white rounded-2xl p-3 border border-sky-100 shadow-sm space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <span className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                    <PieChart className="w-4 h-4 text-sky-600" />
                    <span>ریز تراز مالی و گردش فروشگاه آریو</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {(report?.salesSummary?.salesCount ?? 0).toLocaleString('fa-IR')} فاکتور فروش
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                    <span className="text-[10px] text-slate-400 font-bold block mb-1">
                      مجموع فروش ناخالص
                    </span>
                    <span className="font-mono font-black text-slate-800">
                      {(report?.salesSummary?.totalSales || 0).toLocaleString('fa-IR')}
                    </span>
                    <span className="text-[9px] text-slate-400 mr-1">تومان</span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                    <span className="text-[10px] text-slate-400 font-bold block mb-1">
                      بهای تمام شده کالاها (خرید)
                    </span>
                    <span className="font-mono font-black text-slate-600">
                      {(report?.salesSummary?.totalCostOfGoods || 0).toLocaleString('fa-IR')}
                    </span>
                    <span className="text-[9px] text-slate-400 mr-1">تومان</span>
                  </div>

                  <div className="p-3 bg-emerald-50/60 rounded-2xl border border-emerald-100">
                    <span className="text-[10px] text-emerald-700 font-bold block mb-1">
                      سود ناخالص فروش
                    </span>
                    <span className="font-mono font-black text-emerald-700">
                      {(report?.salesSummary?.grossProfit || 0).toLocaleString('fa-IR')}
                    </span>
                    <span className="text-[9px] text-emerald-600 mr-1">تومان</span>
                  </div>

                  <div className="p-3 bg-rose-50/60 rounded-2xl border border-rose-100">
                    <span className="text-[10px] text-rose-700 font-bold block mb-1">
                      هزینه‌های جاری مغازه
                    </span>
                    <span className="font-mono font-black text-rose-700">
                      {(report?.expensesSummary?.operatingExpenses || 0).toLocaleString('fa-IR')}
                    </span>
                    <span className="text-[9px] text-rose-600 mr-1">تومان</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2.5 bg-slate-50 rounded-2xl">
                    <span className="text-[10px] text-slate-400 block">درصد سود فروش</span>
                    <span className="font-mono font-bold text-xs text-slate-800">{percent(report?.salesSummary?.grossProfitMarginPercent)}</span>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-2xl">
                    <span className="text-[10px] text-slate-400 block">سود هر کیلو</span>
                    <span className="font-mono font-bold text-xs text-slate-800">{formatToman(report?.salesSummary?.profitPerKg)}</span>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-2xl">
                    <span className="text-[10px] text-slate-400 block">تناژ فروش</span>
                    <span className="font-mono font-bold text-xs text-slate-800">{tons(report?.salesSummary?.totalSalesWeightKg)} تن</span>
                  </div>
                </div>

                <button
                  onClick={() => navigate('/profit')}
                  className="w-full text-right text-[10px] text-slate-500 bg-sky-50/60 rounded-2xl p-2.5 leading-5"
                >
                  بهای تمام‌شده از روی قیمت واقعی همان بار خریدی حساب می‌شود که کالا از آن فروش رفته (FIFO).{' '}
                  <span className="text-sky-700 font-bold">ریز سود ←</span>
                </button>
              </div>
            </>
          )}

          {/* Tab Filter */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {[
              { id: 'all', label: 'همه هزینه‌ها' },
              { id: 'withdrawals', label: 'برداشت‌های مدیر' },
              { id: 'store', label: 'هزینه‌های جاری مغازه' },
              { id: 'shipping', label: 'ارسال بار' },
              { id: 'salary', label: 'حقوق پرسنل' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3 py-2 rounded-2xl text-xs font-extrabold whitespace-nowrap transition active:scale-95 ${
                  activeTab === tab.id
                    ? tab.id === 'withdrawals'
                      ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                      : 'bg-sky-600 text-white shadow-md shadow-sky-600/30'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="جستجو در شرح هزینه، مبلغ یا دسته‌بندی..."
              className="w-full pr-10 pl-4 py-2.5 rounded-2xl border border-slate-200 bg-white text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-500 shadow-sm"
            />
          </div>

          {/* Expenses List */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-extrabold text-slate-700">
                تاریخچه تراکنش‌ها ({filteredExpenses.length})
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                مجموع این فیلتر:{' '}
                {activeTab === 'withdrawals' && !isUnlocked
                  ? 'محافظت‌شده'
                  : `${filteredExpenses
                      .reduce((sum, e) => sum + ((e.isPersonalWithdrawal || e.type === 'withdrawal') && !isUnlocked ? 0 : (e.amount || 0)), 0)
                      .toLocaleString('fa-IR')} تومان`}
              </span>
            </div>

            {activeTab === 'withdrawals' && !isUnlocked ? (
              <div className="bg-white rounded-2xl p-6 text-center border border-purple-100 space-y-2">
                <div className="w-10 h-10 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mx-auto">
                  <Lock className="w-5 h-5" />
                </div>
                <p className="text-xs font-bold text-slate-700">لیست برداشت‌های شخصی مدیر قفل است</p>
                <p className="text-[10px] text-slate-400">
                  برای مشاهده ریز برداشت‌های شخصی مدیر، لطفاً ابتدا رمز عبور را در کادر بالا وارد نمایید.
                </p>
              </div>
            ) : filteredExpenses.length === 0 ? (
              <div className="bg-white rounded-2xl p-6 text-center border border-slate-200 space-y-2">
                <AlertCircle className="w-10 h-10 text-slate-300 mx-auto" />
                <p className="text-xs font-bold text-slate-600">هیچ رکوردی با این شرایط یافت نشد.</p>
              </div>
            ) : (
              filteredExpenses.map((exp) => {
                const isWithdrawal = exp.isPersonalWithdrawal || exp.type === 'withdrawal';
                return (
                  <div
                    key={exp._id}
                    className={`bg-white rounded-2xl p-3 border transition hover:shadow-md ${
                      isWithdrawal
                        ? 'border-purple-200/80 bg-purple-50/20'
                        : 'border-slate-100 hover:border-sky-200'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 mt-0.5 ${
                            isWithdrawal
                              ? 'bg-purple-100 text-purple-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {getCategoryIcon(exp.type, isWithdrawal)}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-slate-800">
                              {exp.categoryName || 'هزینه'}
                            </span>
                            {isWithdrawal && (
                              <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                                برداشت مدیر
                              </span>
                            )}
                          </div>

                          <p className="text-[11px] text-slate-600 font-medium mt-1">
                            {isWithdrawal && !isUnlocked ? 'برداشت شخصی مدیر (محافظت‌شده)' : (exp.description || 'بدون شرح')}
                          </p>

                          <div className="flex items-center gap-3 text-[10px] text-slate-400 mt-2 font-mono">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-slate-300" />
                              <span>{formatDate(exp.date)}</span>
                            </span>
                            <span>•</span>
                            <span>{exp.paymentMethod === 'card' ? 'کارت بانکی' : 'حساب'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="text-left shrink-0">
                        <div
                          className={`font-mono font-black text-sm ${
                            isWithdrawal ? 'text-purple-700' : 'text-slate-800'
                          }`}
                        >
                          {isWithdrawal && !isUnlocked ? (
                            <span className="text-purple-400 font-mono text-xs tracking-widest">••••••••</span>
                          ) : (
                            <>
                              {exp.amount.toLocaleString('fa-IR')}
                              <span className="text-[10px] font-normal text-slate-400 mr-1">تومان</span>
                            </>
                          )}
                        </div>

                        <button
                          onClick={() => handleDelete(exp._id, isWithdrawal)}
                          className="mt-3 p-1.5 rounded-xl text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition"
                          title="حذف رکورد"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </IonContent>

      {/* New Expense Modal */}
      <NewExpenseModal
        isOpen={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
        onSuccess={loadData}
        defaultIsWithdrawal={defaultIsWithdrawal}
      />
    </IonPage>
  );
};
