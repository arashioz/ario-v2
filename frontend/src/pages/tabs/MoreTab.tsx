import React, { useState } from 'react';
import { IonPage, IonHeader, IonToolbar, IonContent } from '@ionic/react';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';
import { useNavigate } from 'react-router-dom';
import {
  User,
  ShieldCheck,
  Briefcase,
  Tag,
  PhoneCall,
  Wallet,
  LogOut,
  ChevronLeft,
  ChevronDown,
  Scale,
  TrendingUp,
  Hourglass,
  Flame,
  Building2,
  PieChart,
  MapPin,
  Download,
  Info,
  ClipboardList,
  Settings,
  LineChart,
  Users,
  History,
  KeyRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { usePwaInstall } from '../../hooks/usePwaInstall';

type Item = {
  path: string;
  title: string;
  desc: string;
  icon: LucideIcon;
  tone: string;
};

const ACCOUNTS: Item[] = [
  {
    path: '/supplier-account',
    title: 'حساب شرکت مادر',
    desc: 'چقدر بدهکاریم، چقدر دادیم، کدام فاکتور خرید باز است',
    icon: Building2,
    tone: 'bg-rose-100 text-rose-600',
  },
  {
    path: '/suppliers',
    title: 'حساب تأمین‌کننده‌ها',
    desc: 'بدهی و پرداخت هر شرکت، جدا از شرکت مادر',
    icon: Building2,
    tone: 'bg-sky-100 text-sky-600',
  },
];

const REPORTS: Item[] = [
  {
    path: '/profit',
    title: 'سود فروش',
    desc: 'سود هر بار، هر کالا و هر روز',
    icon: TrendingUp,
    tone: 'bg-emerald-100 text-emerald-600',
  },
  {
    path: '/price-chart',
    title: 'چارت قیمت',
    desc: 'نمودار قیمت خرید، فروش و قیمت لیست هر کالا',
    icon: LineChart,
    tone: 'bg-sky-100 text-sky-600',
  },
  {
    path: '/credit-report',
    title: 'نسیه و وصول',
    desc: 'بار نسیه، و پولی که از نسیه روزهای قبل برگشته',
    icon: Hourglass,
    tone: 'bg-amber-100 text-amber-600',
  },
  {
    path: '/expenses',
    title: 'خرج و برداشت',
    desc: 'هزینه مغازه، برداشت شخصی و سود مانده',
    icon: PieChart,
    tone: 'bg-violet-100 text-violet-600',
  },
  {
    path: '/inflation',
    title: 'گرانی بار',
    desc: 'سود خرید و فروش، جدا از گران شدن کالا',
    icon: Flame,
    tone: 'bg-orange-100 text-orange-600',
  },
  {
    path: '/inventory',
    title: 'موجودی انبار',
    desc: 'وزن موجود و ارزش خرید کالاها',
    icon: Scale,
    tone: 'bg-sky-100 text-sky-600',
  },
];

const SHOP: Item[] = [
  {
    path: '/products',
    title: 'مدیریت کالاها',
    desc: 'ویرایش کالا، عکس، قیمت و موجودی',
    icon: Tag,
    tone: 'bg-sky-100 text-sky-600',
  },
  {
    path: '/settings',
    title: 'چیدمان فروش',
    desc: 'اسم سردسته‌ها، ترتیب دسته‌ها و ظاهر صفحه فروش',
    icon: Settings,
    tone: 'bg-slate-100 text-slate-700',
  },
  {
    path: '/proformas',
    title: 'پیش‌فاکتور',
    desc: 'فاکتورهایی که هنوز بارشان نرفته',
    icon: ClipboardList,
    tone: 'bg-teal-100 text-teal-700',
  },
  {
    path: '/cheques',
    title: 'چک‌ها',
    desc: 'چک دریافتی و پرداختی، و سررسید',
    icon: Wallet,
    tone: 'bg-indigo-100 text-indigo-600',
  },
  {
    path: '/follow-ups',
    title: 'پیگیری مشتری',
    desc: 'کسانی که باید امروز زنگ بزنیم',
    icon: PhoneCall,
    tone: 'bg-emerald-100 text-emerald-600',
  },
  {
    path: '/customers-map',
    title: 'نقشه مشتریان',
    desc: 'جای سوپرمارکت‌ها و بدهکارها روی نقشه مپ',
    icon: MapPin,
    tone: 'bg-fuchsia-100 text-fuchsia-600',
  },
];

const ADMIN: Item[] = [
  {
    path: '/users',
    title: 'کاربران و دسترسی',
    desc: 'ساخت حساب برای همکاران، نقش، غیرفعال کردن و ریست رمز',
    icon: Users,
    tone: 'bg-sky-100 text-sky-600',
  },
  {
    path: '/logs',
    title: 'گزارش رویدادها (لاگ)',
    desc: 'هر ثبت، ویرایش و حذف: چه کسی، کی و چه چیزی',
    icon: History,
    tone: 'bg-rose-100 text-rose-600',
  },
];

const STAFF: Item[] = [
  {
    path: '/users',
    title: 'تغییر رمز من',
    desc: 'رمز ورود؛ برای تأیید هر حذف هم پرسیده می‌شود',
    icon: KeyRound,
    tone: 'bg-violet-100 text-violet-600',
  },
];

const Row: React.FC<{ item: Item; onOpen: (path: string) => void }> = ({ item, onOpen }) => {
  const Icon = item.icon;
  return (
    <button
      onClick={() => onOpen(item.path)}
      className="w-full flex items-center justify-between gap-3 px-3.5 py-3 hover:bg-slate-50 transition text-right"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 ${item.tone}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <h4 className="text-[13px] font-bold text-slate-800">{item.title}</h4>
          <p className="text-[11px] text-slate-400 mt-0.5 leading-5">{item.desc}</p>
        </div>
      </div>
      <ChevronLeft className="w-4 h-4 text-slate-300 shrink-0" />
    </button>
  );
};

const Group: React.FC<{
  title: string;
  hint: string;
  tone: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}> = ({ title, hint, tone, open, onToggle, children }) => (
  <section className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
    <button onClick={onToggle} className="w-full flex items-center justify-between px-3.5 py-3 text-right">
      <div>
        <div className={`text-[13px] font-extrabold ${tone}`}>{title}</div>
        <p className="text-[11px] text-slate-400 mt-0.5">{hint}</p>
      </div>
      <ChevronDown className={`w-4 h-4 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
    </button>
    {open && <div className="divide-y divide-slate-100 border-t border-slate-100">{children}</div>}
  </section>
);

export const MoreTab: React.FC = () => {
  const { user, logout } = useAuth();
  const { showNotification } = useNotification();
  const navigate = useNavigate();
  const pwa = usePwaInstall();
  const [open, setOpen] = useState({ money: true, shop: true, security: true });
  const isAdmin = user?.role === 'admin';

  const handleInstall = async () => {
    if (pwa.canPrompt) {
      await pwa.install();
      return;
    }
    showNotification({
      title: 'نصب اپ',
      message: pwa.ios
        ? 'در Safari دکمه اشتراک‌گذاری را بزنید و «Add to Home Screen» را انتخاب کنید.'
        : 'از منوی مرورگر گزینه «نصب برنامه» یا «Add to Home screen» را بزنید.',
      type: 'info',
    });
  };

  const handleLogout = () => {
    logout();
    showNotification({
      title: 'خروج از حساب',
      message: 'از حساب خارج شدید.',
      type: 'info',
    });
  };

  return (
    <IonPage>
      <IonHeader className="ion-no-border">
        <IonToolbar className="bg-white/80 backdrop-blur-md px-4 py-2 border-b border-sky-100">
          <h1 className="text-sm font-extrabold text-slate-800">بیشتر</h1>
        </IonToolbar>
      </IonHeader>

      <IonContent fullscreen className="bg-slate-50">
        <div className="p-3.5 space-y-4 max-w-md mx-auto pb-8">
          <div className="bg-white rounded-3xl p-3.5 border border-sky-100 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-sky-100 border border-sky-200 flex items-center justify-center text-sky-600">
                <User className="w-5 h-5" />
              </div>
              <div className="text-right">
                <h3 className="text-sm font-extrabold text-slate-800">{user?.fullName || 'کاربر سیستم'}</h3>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-[11px] text-slate-400 font-mono">@{user?.username}</span>
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      user?.role === 'admin' ? 'bg-sky-100 text-sky-800' : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {user?.role === 'admin' ? <ShieldCheck className="w-3 h-3" /> : <Briefcase className="w-3 h-3" />}
                    <span>{user?.role === 'admin' ? 'مدیر' : 'بازاریاب'}</span>
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="p-2.5 rounded-2xl bg-rose-50 text-rose-600 active:scale-95"
              title="خروج"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>

          <Group
            title="حساب و گزارش"
            hint="شرکت مادر، تأمین‌کننده‌ها، سود و نسیه"
            tone="text-emerald-800"
            open={open.money}
            onToggle={() => setOpen((s) => ({ ...s, money: !s.money }))}
          >
            <div className="px-4 pt-3 pb-1">
              <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md">حساب‌ها</span>
            </div>
            {ACCOUNTS.map((item) => (
              <Row key={item.path} item={item} onOpen={navigate} />
            ))}
            <div className="px-4 pt-3 pb-1">
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">گزارش‌ها</span>
            </div>
            {REPORTS.map((item) => (
              <Row key={item.path} item={item} onOpen={navigate} />
            ))}
          </Group>

          <Group
            title="کار مغازه"
            hint="کالا، چیدمان فروش، چک و نقشه"
            tone="text-sky-800"
            open={open.shop}
            onToggle={() => setOpen((s) => ({ ...s, shop: !s.shop }))}
          >
            {SHOP.map((item) => (
              <Row key={item.path} item={item} onOpen={navigate} />
            ))}
          </Group>

          <Group
            title="مدیریت و امنیت"
            hint={isAdmin ? 'کاربران، لاگ همه رویدادها و رمز' : 'رمز حساب شما'}
            tone="text-rose-800"
            open={open.security}
            onToggle={() => setOpen((s) => ({ ...s, security: !s.security }))}
          >
            {(isAdmin ? ADMIN : STAFF).map((item) => (
              <Row key={item.path} item={item} onOpen={navigate} />
            ))}
          </Group>

          {!pwa.installed && (
            <button
              onClick={handleInstall}
              className="w-full bg-white rounded-3xl border border-sky-100 shadow-sm p-4 flex items-center justify-between text-right active:scale-[0.98] transition"
            >
              <div className="flex items-center gap-3">
                <img src="/icons/icon-192.png" alt="" className="w-10 h-10 rounded-xl" />
                <div>
                  <h4 className="text-[13px] font-bold text-slate-800">نصب روی گوشی</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">مثل اپ، بدون نوار مرورگر</p>
                </div>
              </div>
              <Download className="w-4 h-4 text-sky-600" />
            </button>
          )}

          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-4 flex items-center justify-between text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-sky-500" />
              <span>نسخه آریو</span>
            </div>
            <span className="font-mono font-bold text-sky-700">1.0.0</span>
          </div>

          <button
            onClick={handleLogout}
            className="w-full py-3.5 px-4 rounded-2xl bg-rose-50 text-rose-600 font-bold text-xs flex items-center justify-center gap-2 border border-rose-100 active:scale-98"
          >
            <LogOut className="w-4 h-4" />
            <span>خروج</span>
          </button>
        </div>
      </IonContent>
    </IonPage>
  );
};
