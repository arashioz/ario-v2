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
  ArrowDownLeft,
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
  const [asking, setAsking] = useState(false);
  const [reveal, setReveal] = useState(false);

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput.trim() === PROFIT_PASSWORD) {
      setIsUnlocked(true);
      sessionStorage.setItem('ario_profit_unlocked', '1');
      setPasswordError('');
      setPasswordInput('');
      setAsking(false);
      setReveal(true);
    } else {
      setPasswordError('نادرست');
    }
  };

  const handleLock = () => {
    setIsUnlocked(false);
    sessionStorage.removeItem('ario_profit_unlocked');
    setPasswordInput('');
    setPasswordError('');
    setAsking(false);
    setReveal(false);
    setActiveTab('all');
  };

  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [report, setReport] = useState<ProfitLossReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'withdrawals' | 'shipping' | 'salary' | 'store'>('all');
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [entryKind, setEntryKind] = useState<'store' | 'withdrawal' | 'deposit'>('store');

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
    const personal = e.type === 'deposit' || e.type === 'withdrawal' || e.isPersonalWithdrawal;
    if (!isUnlocked && personal) return false;
    if (activeTab === 'withdrawals' && !personal) {
      return false;
    }
    if (activeTab === 'shipping' && e.type !== 'shipping') {
      return false;
    }
    if (activeTab === 'salary' && e.type !== 'salary') {
      return false;
    }
    if (activeTab === 'store' && personal) {
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
    if (type === 'deposit') return <ArrowDownLeft className="w-4 h-4 text-emerald-600" />;
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
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(-1)}
              className="p-2 rounded-2xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition active:scale-95"
            >
              <ArrowRight className="w-5 h-5" />
            </button>
            <h1 className="text-sm font-black text-slate-800">خرج و برداشت</h1>
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

        <div className={`p-3 space-y-3 max-w-lg mx-auto pb-8 ${reveal ? 'animate-slide-up' : ''}`} dir="rtl">
          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              disabled={loading}
              className="p-2 rounded-2xl bg-white border border-slate-200 text-sky-600 active:scale-95 disabled:opacity-50"
              title="به‌روزرسانی"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => {
                setEntryKind('store');
                setIsNewModalOpen(true);
              }}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl bg-sky-600 text-white font-bold text-xs active:scale-[0.98]"
            >
              <Plus className="w-4 h-4" />
              ثبت هزینه
            </button>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-500">بازه گزارش</span>
            <PeriodPicker value={period} onChange={setPeriod} />
          </div>
          <div className="bg-white rounded-3xl border border-slate-100 p-4 flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={() => (isUnlocked ? handleLock() : setAsking(true))}
              className="w-14 h-14 rounded-2xl bg-slate-50 text-slate-500 border border-slate-200 flex items-center justify-center active:scale-95"
            >
              {isUnlocked ? <Unlock className="w-6 h-6" /> : <Lock className="w-6 h-6" />}
            </button>
            {asking && !isUnlocked && (
              <form onSubmit={handleUnlock} className="w-full max-w-[220px]">
                <input
                  type="password"
                  autoFocus
                  value={passwordInput}
                  onChange={(e) => {
                    setPasswordInput(e.target.value);
                    setPasswordError('');
                  }}
                  className={`w-full px-3 py-2.5 rounded-2xl bg-slate-50 border text-center font-mono text-sm focus:outline-none ${passwordError ? 'border-rose-400' : 'border-slate-200 focus:border-slate-400'}`}
                  dir="ltr"
                  autoComplete="current-password"
                />
              </form>
            )}
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
                      جمع سود فاکتورها
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

                {(report?.salesSummary?.shop || report?.salesSummary?.factory) && (
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="p-2.5 rounded-2xl bg-sky-50 border border-sky-100">
                      <div className="text-sky-800 font-bold">از مغازه</div>
                      <div className="font-mono font-bold text-slate-800 mt-0.5">{formatToman(report?.salesSummary?.shop?.revenue)}</div>
                      <div className="text-emerald-700 font-mono">سود {formatToman(report?.salesSummary?.shop?.profit)}</div>
                    </div>
                    <div className="p-2.5 rounded-2xl bg-amber-50 border border-amber-100">
                      <div className="text-amber-800 font-bold">از کارخانه</div>
                      <div className="font-mono font-bold text-slate-800 mt-0.5">{formatToman(report?.salesSummary?.factory?.revenue)}</div>
                      <div className="text-emerald-700 font-mono">سود {formatToman(report?.salesSummary?.factory?.profit)}</div>
                    </div>
                  </div>
                )}

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

                <div className="pt-2 border-t border-slate-100 space-y-1.5">
                  <div className="text-xs font-extrabold text-slate-800">۲۰ فاکتور آخر — قیمت فروش</div>
                  {(report?.recentSales || []).length === 0 ? (
                    <p className="text-[11px] text-slate-400">فاکتور فروشی در این بازه نیست.</p>
                  ) : (
                    report!.recentSales!.map((inv) => (
                      <div key={inv.id} className="flex items-center justify-between gap-2 text-[11px]">
                        <div className="min-w-0">
                          <span className="font-mono font-bold text-slate-700" dir="ltr">{inv.invoiceNumber}</span>
                          <span className="text-slate-400 mr-1.5">{inv.customerName}</span>
                          {inv.fulfillment === 'factory' && <span className="text-[9px] font-bold text-amber-700">کارخانه</span>}
                        </div>
                        <div className="text-left shrink-0">
                          <div className="font-mono font-bold text-slate-800">{formatToman(inv.sellAmount)}</div>
                          <div className="text-[10px] text-emerald-700">سود {formatToman(inv.profit)}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <button
                  onClick={() => navigate('/profit')}
                  className="w-full text-right text-[10px] text-slate-500 bg-sky-50/60 rounded-2xl p-2.5 leading-5"
                >
                  بهای تمام‌شده از روی قیمت واقعی همان بار خریدی حساب می‌شود که کالا از آن فروش رفته (FIFO).{' '}
                  <span className="text-sky-700 font-bold">ریز سود ←</span>
                </button>
              </div>
          {/* Tab Filter */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {[
              { id: 'all', label: 'همه هزینه‌ها' },
              ...(isUnlocked ? [{ id: 'withdrawals', label: 'برداشت و واریز مدیر' }] : []),
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
                مجموع این فیلتر: {filteredExpenses.reduce((sum, e) => sum + (e.amount || 0), 0).toLocaleString('fa-IR')} تومان
              </span>
            </div>

            {filteredExpenses.length === 0 ? (
              <div className="bg-white rounded-2xl p-6 text-center border border-slate-200 space-y-2">
                <AlertCircle className="w-10 h-10 text-slate-300 mx-auto" />
                <p className="text-xs font-bold text-slate-600">هیچ رکوردی با این شرایط یافت نشد.</p>
              </div>
            ) : (
              filteredExpenses.map((exp) => {
                const isDeposit = exp.type === 'deposit';
                const isWithdrawal = !isDeposit && (exp.isPersonalWithdrawal || exp.type === 'withdrawal');
                return (
                  <div
                    key={exp._id}
                    className={`bg-white rounded-2xl p-3 border transition hover:shadow-md ${
                      isDeposit ? 'border-emerald-200 bg-emerald-50/30' : isWithdrawal ? 'border-purple-200/80 bg-purple-50/20' : 'border-slate-100 hover:border-sky-200'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 mt-0.5 ${
                            isDeposit ? 'bg-emerald-100 text-emerald-700' : isWithdrawal ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {getCategoryIcon(exp.type, isWithdrawal)}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-slate-800">
                              {exp.categoryName || 'هزینه'}
                            </span>
                            {isDeposit && (
                              <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                                واریز
                              </span>
                            )}
                            {isWithdrawal && (
                              <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                                برداشت مدیر
                              </span>
                            )}
                          </div>

                          <p className="text-[11px] text-slate-600 font-medium mt-1">
                            {(isWithdrawal || isDeposit) && !isUnlocked ? 'حساب مدیر (محافظت‌شده)' : (exp.description || 'بدون شرح')}
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
                            isDeposit ? 'text-emerald-700' : isWithdrawal ? 'text-purple-700' : 'text-slate-800'
                          }`}
                        >
                          {(isWithdrawal || isDeposit) && !isUnlocked ? (
                            <span className="text-purple-400 font-mono text-xs tracking-widest">••••••••</span>
                          ) : (
                            <>
                              {isDeposit ? '+' : isWithdrawal ? '−' : ''}
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
        defaultKind={entryKind}
      />
    </IonPage>
  );
};
