import React, { useEffect, useState } from 'react';
import {
  X,
  Wallet,
  ArrowDownLeft,
  TrendingDown,
  Truck,
  Users,
  Lightbulb,
  Building,
  HelpCircle,
  CheckCircle2,
} from 'lucide-react';
import { expensesService } from '../../services/expenses.service';
import { JalaliDateField } from '../ui/JalaliDatePicker';
import { todayYmd } from '../../lib/jalali';
import { useNotification } from '../../context/NotificationContext';
import { formatToman, parseToman } from '../../lib/format';

type EntryKind = 'store' | 'withdrawal' | 'deposit';

interface NewExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  defaultKind?: EntryKind;
}

export const NewExpenseModal: React.FC<NewExpenseModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  defaultKind = 'store',
}) => {
  const { showNotification } = useNotification();

  const [kind, setKind] = useState<EntryKind>(defaultKind);
  const [expenseType, setExpenseType] = useState<
    'shipping' | 'salary' | 'utilities' | 'rent' | 'other'
  >('shipping');
  const [amountStr, setAmountStr] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [date, setDate] = useState<string>(todayYmd());
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'transfer' | 'cash'>('card');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setKind(defaultKind);
    setAmountStr('');
    setDescription('');
    setDate(todayYmd());
  }, [isOpen, defaultKind]);

  if (!isOpen) return null;

  const isWithdrawal = kind === 'withdrawal';
  const isDeposit = kind === 'deposit';
  const personal = isWithdrawal || isDeposit;

  const rawAmount = parseInt(amountStr.replace(/[^0-9]/g, ''), 10) || 0;

  const quickWithdrawalTags = [
    'برداشت شخصی از دخل',
    'هزینه منزل و خرید خانگی',
    'قسط وام و بدهی شخصی',
    'تعمیرات خودرو و موتور',
    'پیش‌پرداخت شخصی',
    'خرید وسایل و پوشاک',
  ];
  const quickDepositTags = ['واریز درآمد دیگر', 'بازگشت برداشت', 'تسویه بدهی مدیر'];

  const unlockPersonal = () => {
    if (sessionStorage.getItem('ario_profit_unlocked') === '1') return true;
    const pass = window.prompt('برای حساب مدیر، رمز عبور را وارد کنید:');
    if (pass !== 'arash5Gs200') {
      if (pass !== null) {
        showNotification({ title: 'رمز اشتباه', message: 'رمز عبور وارد شده نادرست است.', type: 'error' });
      }
      return false;
    }
    sessionStorage.setItem('ario_profit_unlocked', '1');
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rawAmount <= 0) {
      showNotification({
        title: 'مبلغ نامعتبر',
        message: 'لطفاً مبلغ معتبری وارد کنید.',
        type: 'warning',
      });
      return;
    }

    try {
      setLoading(true);
      await expensesService.create({
        type: isDeposit ? 'deposit' : isWithdrawal ? 'withdrawal' : expenseType,
        amount: rawAmount,
        description: description.trim(),
        date,
        isPersonalWithdrawal: isWithdrawal,
        paymentMethod,
      });

      showNotification({
        title: 'ثبت موفق',
        message: isDeposit
          ? 'واریز ثبت شد و از بدهی برداشت مدیر کم می‌شود.'
          : isWithdrawal
            ? 'برداشت شخصی مدیر با موفقیت ثبت گردید.'
            : 'هزینه فروشگاه با موفقیت در سیستم ثبت شد.',
        type: 'success',
      });

      onSuccess();
      onClose();
    } catch {
      showNotification({
        title: 'خطا در ثبت',
        message: 'امکان ثبت هزینه وجود ندارد. لطفاً ارتباط با سرور را بررسی کنید.',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div
        className="bg-white rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-sky-100 p-4 relative"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                isDeposit ? 'bg-emerald-100 text-emerald-700' : isWithdrawal ? 'bg-purple-100 text-purple-700' : 'bg-rose-100 text-rose-700'
              }`}
            >
              {isDeposit ? <ArrowDownLeft className="w-5 h-5" /> : isWithdrawal ? <Wallet className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-800">
                {isDeposit ? 'ثبت واریز' : isWithdrawal ? 'ثبت برداشت شخصی مدیر' : 'ثبت هزینه جاری مغازه'}
              </h2>
              <p className="text-[11px] text-slate-400">
                {isDeposit
                  ? 'درآمد دیگر یا پولی که برمی‌گردد؛ از بدهی برداشت مدیر کم می‌شود'
                  : isWithdrawal
                    ? 'برداشت مدیر از دخل یا حساب'
                    : 'هزینه‌های عملیاتی جهت کسر از سود ناخالص فروشگاه'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Switcher: Withdrawal vs Store Expense */}
        <div className="mt-3 p-1.5 bg-slate-100 rounded-2xl grid grid-cols-3 gap-1">
          <button
            type="button"
            onClick={() => setKind('store')}
            className={`py-2.5 rounded-xl text-[11px] font-extrabold flex items-center justify-center gap-1 transition ${
              kind === 'store' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500'
            }`}
          >
            <TrendingDown className="w-3.5 h-3.5" />
            هزینه
          </button>
          <button
            type="button"
            onClick={() => unlockPersonal() && setKind('withdrawal')}
            className={`py-2.5 rounded-xl text-[11px] font-extrabold flex items-center justify-center gap-1 transition ${
              kind === 'withdrawal' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-500'
            }`}
          >
            <Wallet className="w-3.5 h-3.5" />
            برداشت
          </button>
          <button
            type="button"
            onClick={() => unlockPersonal() && setKind('deposit')}
            className={`py-2.5 rounded-xl text-[11px] font-extrabold flex items-center justify-center gap-1 transition ${
              kind === 'deposit' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500'
            }`}
          >
            <ArrowDownLeft className="w-3.5 h-3.5" />
            واریز
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-3 space-y-3">
          {/* Store Expense Categories Selector */}
          {kind === 'store' && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2">دسته‌بندی هزینه</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { id: 'shipping', label: 'ارسال بار و کرایه', icon: Truck, color: 'text-sky-600' },
                  { id: 'salary', label: 'حقوق و دستمزد', icon: Users, color: 'text-emerald-600' },
                  { id: 'utilities', label: 'قبوض و انرژی', icon: Lightbulb, color: 'text-amber-600' },
                  { id: 'rent', label: 'اجاره انبار / مغازه', icon: Building, color: 'text-indigo-600' },
                  { id: 'other', label: 'سایر ملزومات', icon: HelpCircle, color: 'text-slate-600' },
                ].map((item) => {
                  const Icon = item.icon;
                  const isSelected = expenseType === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setExpenseType(item.id as any)}
                      className={`p-2.5 rounded-2xl border text-right transition flex items-center gap-2 ${
                        isSelected
                          ? 'border-sky-500 bg-sky-50/70 shadow-sm'
                          : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <Icon className={`w-4 h-4 ${item.color}`} />
                      <span className="text-[11px] font-bold">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Manager Quick Tags */}
          {personal && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2">
                {isDeposit ? 'بابت واریز' : 'برچسب‌های پرتکرار برداشت مدیر'}
              </label>
              <div className="flex flex-wrap gap-1.5">
                {(isDeposit ? quickDepositTags : quickWithdrawalTags).map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setDescription(tag)}
                    className={`text-[10px] font-bold px-2.5 py-1 rounded-full border transition active:scale-95 ${
                      isDeposit ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-purple-50 text-purple-700 border-purple-200'
                    }`}
                  >
                    + {tag}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Amount Input */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              مبلغ (تومان) <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={amountStr ? Number(amountStr.replace(/[^0-9]/g, '')).toLocaleString('fa-IR') : ''}
                onChange={(e) => {
                  const val = parseToman(e.target.value);
                  setAmountStr(val ? String(val) : '');
                }}
                placeholder="مثال: ۵٬۰۰۰٬۰۰۰"
                className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-left font-mono font-bold text-slate-800 text-lg focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                dir="ltr"
                required
              />
              <span className="absolute right-3.5 top-3.5 text-xs text-slate-400 font-bold">تومان</span>
            </div>
            {rawAmount > 0 && (
              <p className="text-[11px] text-sky-600 mt-1 font-bold">
                {formatToman(rawAmount)}
              </p>
            )}
          </div>

          {/* Date & Payment Method */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">تاریخ</label>
              <JalaliDateField value={date} onChange={setDate} title="تاریخ هزینه" max={todayYmd()} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">{isDeposit ? 'واریز به' : 'محل پرداخت'}</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as any)}
                className="w-full px-3 py-2.5 rounded-2xl border border-slate-200 text-xs font-bold text-slate-700 focus:outline-none focus:border-sky-500 bg-white"
              >
                <option value="card">کارت بانکی / کارتخوان</option>
                <option value="transfer">کارت‌به‌کارت / حواله</option>
                <option value="cash">صندوق نقدی مغازه</option>
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              شرح دقیق {isDeposit ? 'واریز' : isWithdrawal ? 'برداشت' : 'هزینه'}
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                isDeposit
                  ? 'مثلاً: درآمد دیگر، یا پولی که بابت برداشت قبلی برگشته'
                  : isWithdrawal
                    ? 'مثلاً: برداشت ارش بابت قسط وام، هزینه خرید برای خانه...'
                    : 'مثلاً: کرایه اسنپ باربری به مقصد طبس...'
              }
              className="w-full px-3 py-2.5 rounded-2xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-sky-500"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || rawAmount <= 0}
            className={`w-full py-3.5 rounded-2xl font-extrabold text-sm text-white shadow-lg flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-50 disabled:pointer-events-none ${
              isDeposit ? 'bg-emerald-600 shadow-emerald-600/30' : isWithdrawal ? 'bg-purple-600 shadow-purple-600/30' : 'bg-sky-600 shadow-sky-600/30'
            }`}
          >
            <CheckCircle2 className="w-5 h-5" />
            <span>{loading ? 'در حال ثبت...' : 'ثبت قطعی در سیستم'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
