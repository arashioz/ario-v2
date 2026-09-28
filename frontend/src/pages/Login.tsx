import React, { useState } from 'react';
import { IonPage, IonContent } from '@ionic/react';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { LoadingOverlay } from '../components/LoadingOverlay';
import { Lock, User, Eye, EyeOff, ShieldCheck, Briefcase, ArrowLeft } from 'lucide-react';

interface LoginProps {
  onLoginSuccess?: () => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const { login } = useAuth();
  const { showNotification } = useNotification();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username.trim()) {
      showNotification({
        title: 'خطای اعتبارسنجی',
        message: 'لطفاً نام کاربری را وارد نمایید',
        type: 'warning',
      });
      return;
    }

    if (!password) {
      showNotification({
        title: 'خطای اعتبارسنجی',
        message: 'لطفاً رمز عبور را وارد نمایید',
        type: 'warning',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await login(username.trim(), password);
      showNotification({
        title: 'ورود موفق',
        message: 'به سیستم مدیریت آریو خوش آمدید',
        type: 'success',
      });
      if (onLoginSuccess) {
        onLoginSuccess();
      }
    } catch (err: any) {
      const errMsg =
        err.response?.data?.message || 'خطا در ارتباط با سرور. لطفاً مجدداً تلاش کنید.';
      showNotification({
        title: 'خطای ورود',
        message: Array.isArray(errMsg) ? errMsg.join(' - ') : errMsg,
        type: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const fillQuickAccount = (user: string, pass: string) => {
    setUsername(user);
    setPassword(pass);
    showNotification({
      title: `حساب ${user === 'admin' ? 'مدیر' : 'بازاریاب'} انتخاب شد`,
      message: 'می‌توانید دکمه ورود را لمس کنید',
      type: 'info',
      duration: 2000,
    });
  };

  return (
    <IonPage>
      <IonContent fullscreen className="ion-padding">
        <LoadingOverlay isOpen={isSubmitting} message="در حال تأیید اطلاعات کاربری..." />

        <div className="min-h-screen flex flex-col justify-between py-6 px-4 max-w-md mx-auto relative select-none">
          {/* Top Decorative Background Elements */}
          <div className="absolute top-0 right-1/2 translate-x-1/2 -z-10 w-96 h-96 bg-gradient-to-b from-sky-200/60 via-sky-100/30 to-transparent rounded-full blur-3xl pointer-events-none" />

          {/* Header & Logo */}
          <div className="flex flex-col items-center pt-8">
            <div className="w-20 h-20 bg-gradient-to-tr from-sky-500 to-sky-400 rounded-2xl shadow-lg shadow-sky-300/40 p-3 flex items-center justify-center border border-white/60">
              <img src="/ario-logo.svg" alt="Ario Logo" className="w-14 h-14" />
            </div>

            <h1 className="text-2xl font-black text-slate-800 mt-4 tracking-tight">
              نرم‌افزار فروشگاهی آریــو
            </h1>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              سامانه یکپارچه مدیریت فاکتور، مشتریان و حسابداری
            </p>
          </div>

          {/* Login Card Form */}
          <div className="bg-white/90 backdrop-blur-xl rounded-3xl p-6 shadow-xl shadow-sky-100/70 border border-sky-100/80 my-auto">
            <div className="mb-5 text-right">
              <h2 className="text-lg font-bold text-slate-800">ورود به حساب کاربری</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                شناسه کاربری و رمز عبور خود را وارد کنید
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Username Input */}
              <div className="space-y-1 text-right">
                <label className="text-xs font-semibold text-slate-600 block mr-1">
                  نام کاربری
                </label>
                <div className="relative flex items-center">
                  <div className="absolute right-3.5 text-sky-600 pointer-events-none">
                    <User className="w-5 h-5" />
                  </div>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="مثال: admin"
                    dir="ltr"
                    className="w-full pl-3 pr-11 py-3 text-sm rounded-2xl bg-sky-50/50 border border-sky-100 focus:bg-white focus:border-sky-400 focus:ring-2 focus:ring-sky-200 outline-none transition duration-200 text-slate-800 placeholder:text-slate-400"
                  />
                </div>
              </div>

              {/* Password Input */}
              <div className="space-y-1 text-right">
                <label className="text-xs font-semibold text-slate-600 block mr-1">
                  رمز عبور
                </label>
                <div className="relative flex items-center">
                  <div className="absolute right-3.5 text-sky-600 pointer-events-none">
                    <Lock className="w-5 h-5" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    dir="ltr"
                    className="w-full pl-11 pr-11 py-3 text-sm rounded-2xl bg-sky-50/50 border border-sky-100 focus:bg-white focus:border-sky-400 focus:ring-2 focus:ring-sky-200 outline-none transition duration-200 text-slate-800 placeholder:text-slate-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-3.5 text-slate-400 hover:text-slate-600 transition"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full mt-2 py-3.5 px-4 rounded-2xl bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700 active:scale-[0.98] text-white font-bold text-sm shadow-lg shadow-sky-400/30 transition-all flex items-center justify-center gap-2"
              >
                <span>ورود به نرم‌افزار</span>
                <ArrowLeft className="w-4 h-4" />
              </button>
            </form>

            {/* Quick Demo Access Buttons */}
            <div className="mt-6 pt-5 border-t border-slate-100">
              <span className="text-[11px] font-semibold text-slate-400 block text-center mb-3">
                ورود سریع تستی (یک کلیک)
              </span>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => fillQuickAccount('admin', 'admin123')}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-sky-50 hover:bg-sky-100/80 border border-sky-200/60 text-sky-800 text-xs font-semibold transition"
                >
                  <ShieldCheck className="w-4 h-4 text-sky-600" />
                  <span>اکانت مدیر</span>
                </button>

                <button
                  type="button"
                  onClick={() => fillQuickAccount('marketer', 'marketer123')}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold transition"
                >
                  <Briefcase className="w-4 h-4 text-slate-500" />
                  <span>اکانت بازاریاب</span>
                </button>
              </div>
            </div>
          </div>

          {/* Footer Info */}
          <div className="text-center text-[11px] text-slate-400 mt-4">
            <span>سیستم امنیتی دو سطحی آریو • مدیریت و بازاریاب</span>
          </div>
        </div>
      </IonContent>
    </IonPage>
  );
};
