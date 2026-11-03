import React, { useEffect, useMemo, useState } from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { Check, ChevronDown, ChevronUp, LayoutGrid } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { productsService } from '../services/products.service';
import { useSettings } from '../services/settings.service';
import { api } from '../services/api';
import { DEFAULT_HOME, HOME_WIDGETS, homeOrder } from './tabs/HomeBoard';
import type { HomeWidgetId } from './tabs/HomeBoard';
import { ReportHeader } from '../components/reports/ReportUI';

export const HomeLayoutPage: React.FC = () => {
  const { user, patchUser } = useAuth();
  const settings = useSettings();
  const { showNotification } = useNotification();
  const [layout, setLayout] = useState<HomeWidgetId[]>(() => homeOrder(user?.homeLayout));
  const [houses, setHouses] = useState<string[]>([]);
  const [picked, setPicked] = useState<string[]>(() => user?.homeWarehouses?.length ? user.homeWarehouses : settings.homeWarehouses || []);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    productsService.getForSale().then((goods) => {
      const names = [...new Set(goods.map((p) => (p.supplierName || '').trim() || 'بدون شرکت'))];
      setHouses(names.sort((a, b) => a.localeCompare(b, 'fa')));
    }).catch(() => setHouses([]));
  }, []);

  const unused = useMemo(() => HOME_WIDGETS.filter((item) => !layout.includes(item.id)), [layout]);
  const meta = (id: HomeWidgetId) => HOME_WIDGETS.find((item) => item.id === id)!;

  const save = async (nextLayout: HomeWidgetId[], nextHouses: string[]) => {
    setSaving(true);
    try {
      const saved = await api.patch('/auth/home', { homeLayout: nextLayout, homeWarehouses: nextHouses });
      patchUser({ homeLayout: saved.data.homeLayout, homeWarehouses: saved.data.homeWarehouses });
      showNotification({ title: 'ذخیره شد', message: 'چیدمان صفحه اول همین کاربر عوض شد.', type: 'success' });
    } catch {
      showNotification({ title: 'ذخیره نشد', message: 'دوباره تلاش کنید.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const move = (index: number, dir: -1 | 1) => {
    const next = [...layout];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setLayout(next);
  };

  const toggleHouse = (name: string) => {
    setPicked((prev) => {
      if (prev.includes(name)) return prev.filter((item) => item !== name);
      if (prev.length === 0) return [name];
      return [...prev, name];
    });
  };

  return (
    <IonPage>
      <ReportHeader title="چیدمان صفحه اول" subtitle="فقط برای حساب شما ذخیره می‌شود" />
      <IonContent fullscreen className="bg-slate-50">
        <div className="p-3 space-y-3 max-w-lg mx-auto pb-10">
          <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3.5 space-y-2">
            <div className="flex items-center gap-2">
              <LayoutGrid className="w-4 h-4 text-sky-600" />
              <h2 className="text-[13px] font-bold text-slate-800">قالب</h2>
            </div>
            <p className="text-[11px] text-slate-400 leading-5">قالب پیش‌فرض همان صفحه اول فعلی است. می‌توانید کارت‌ها را بالا و پایین ببرید، برداریم، یا دوباره اضافه کنید.</p>
            <button
              type="button"
              disabled={saving}
              onClick={() => setLayout([...DEFAULT_HOME])}
              className="text-[12px] font-bold text-sky-700"
            >
              برگشت به قالب پیش‌فرض
            </button>
          </section>

          <section className="space-y-2">
            <h2 className="text-[12px] font-bold text-slate-500 px-1">کارت‌های صفحه اول</h2>
            {layout.map((id, index) => (
              <div key={id} className="bg-white rounded-2xl border border-slate-100 px-3 py-2.5 flex items-center gap-2">
                <div className="flex flex-col">
                  <button type="button" disabled={index === 0} onClick={() => move(index, -1)} className="p-1 text-slate-400 disabled:opacity-20"><ChevronUp className="w-4 h-4" /></button>
                  <button type="button" disabled={index === layout.length - 1} onClick={() => move(index, 1)} className="p-1 text-slate-400 disabled:opacity-20"><ChevronDown className="w-4 h-4" /></button>
                </div>
                <div className="min-w-0 flex-1 text-right">
                  <div className="text-[13px] font-bold text-slate-800">{meta(id).title}</div>
                  <div className="text-[11px] text-slate-400">{meta(id).hint}</div>
                </div>
                <button type="button" onClick={() => setLayout((prev) => prev.filter((item) => item !== id))} className="text-[11px] font-bold text-rose-600">حذف</button>
              </div>
            ))}
            {unused.length > 0 && (
              <div className="pt-1 space-y-1.5">
                <div className="text-[11px] text-slate-400 px-1">کارت‌هایی که روی صفحه نیستند</div>
                {unused.map((item) => (
                  <button key={item.id} type="button" onClick={() => setLayout((prev) => [...prev, item.id])} className="w-full bg-slate-50 rounded-2xl border border-dashed border-slate-200 px-3 py-2.5 text-right">
                    <span className="block text-[13px] font-bold text-slate-700">+ {item.title}</span>
                    <span className="block text-[11px] text-slate-400 mt-0.5">{item.hint}</span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3.5 space-y-2">
            <h2 className="text-[13px] font-bold text-slate-800">انبار روی صفحه اول</h2>
            <p className="text-[11px] text-slate-400 leading-5">اولین موردِ تیک‌خورده، انبار پیش‌فرض کارت است. بقیه را هم می‌توانید روی همان کارت بگذارید.</p>
            {houses.length === 0 ? (
              <p className="text-[12px] text-slate-400">شرکتی در کالاها نیست.</p>
            ) : houses.map((name) => {
              const on = picked.includes(name);
              const isDefault = on && picked[0] === name;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => toggleHouse(name)}
                  className={`w-full flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-right border ${on ? 'border-sky-200 bg-sky-50' : 'border-slate-100 bg-slate-50'}`}
                >
                  <span className="min-w-0">
                    <span className="block text-[13px] font-bold text-slate-800 truncate">{name}</span>
                    {isDefault && <span className="block text-[10px] text-sky-700 mt-0.5">پیش‌فرض کارت</span>}
                  </span>
                  {on && <Check className="w-4 h-4 text-sky-700 shrink-0" />}
                </button>
              );
            })}
            {picked.length > 1 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {picked.map((name, index) => (
                  <button
                    key={name}
                    type="button"
                    disabled={index === 0}
                    onClick={() => setPicked((prev) => {
                      const next = [...prev];
                      [next[index - 1], next[index]] = [next[index], next[index - 1]];
                      return next;
                    })}
                    className="text-[11px] px-2 py-1 rounded-lg bg-slate-100 text-slate-600 disabled:opacity-40"
                  >
                    {index === 0 ? 'اول' : 'بالا'} · {name}
                  </button>
                ))}
              </div>
            )}
          </section>

          <button
            type="button"
            disabled={saving}
            onClick={() => save(layout, picked)}
            className="w-full py-3 rounded-2xl bg-slate-900 text-white text-sm font-bold disabled:opacity-50"
          >
            {saving ? 'در حال ذخیره…' : 'ذخیره چیدمان من'}
          </button>
        </div>
      </IonContent>
    </IonPage>
  );
};
