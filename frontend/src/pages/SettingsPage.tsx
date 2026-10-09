import React, { useEffect, useMemo, useState } from 'react';
import { IonPage, IonContent } from '@ionic/react';
import { useSearchParams } from 'react-router-dom';
import {
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  CreditCard,
  DatabaseBackup,
  Grid3x3,
  LayoutGrid,
  LayoutList,
  MessageSquareText,
  Plus,
  RefreshCw,
  Rows3,
  Save,
  Scale,
  Store,
  Tags,
} from 'lucide-react';
import { ReportHeader } from '../components/reports/ReportUI';
import { ProductBrowser } from '../components/pos/ProductBrowser';
import { productsService, type Product } from '../services/products.service';
import { num } from '../lib/format';
import { apiErrorMessage, invoicesService } from '../services/invoices.service';
import { settingsService, useSettings, type PosLayout, type PosView } from '../services/settings.service';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { BankAccountsSettings } from '../components/settings/BankAccountsSettings';
import { SmsTemplatesSettings } from '../components/settings/SmsTemplatesSettings';
import { PosSectionsSettings } from '../components/settings/PosSectionsSettings';
import { BackupSettings } from '../components/settings/BackupSettings';

const LAYOUTS: { id: PosLayout; label: string; icon: React.ElementType }[] = [
  { id: 'grid', label: 'کارتی', icon: LayoutGrid },
  { id: 'tiles', label: 'ریز', icon: Grid3x3 },
  { id: 'list', label: 'لیستی', icon: LayoutList },
];

const TONES = {
  sky: 'bg-sky-500',
  violet: 'bg-violet-500',
  amber: 'bg-amber-500',
  emerald: 'bg-emerald-500',
  indigo: 'bg-indigo-500',
  teal: 'bg-teal-500',
  rose: 'bg-rose-500',
} as const;

const Toggle: React.FC<{ label: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }> = ({
  label,
  checked,
  disabled,
  onChange,
}) => (
  <button
    type="button"
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className="w-full flex items-center justify-between py-2 text-right disabled:opacity-50"
  >
    <span className="text-xs text-slate-700">{label}</span>
    <span className={`w-10 h-6 rounded-full p-0.5 transition shrink-0 ${checked ? 'bg-sky-600' : 'bg-slate-200'}`}>
      <span className={`block w-5 h-5 rounded-full bg-white shadow transition ${checked ? '-translate-x-4' : ''}`} />
    </span>
  </button>
);

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block">
    <span className="text-[10px] text-slate-500 block mb-1">{label}</span>
    {children}
  </label>
);

const input = 'w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-sky-400 disabled:bg-slate-50';

/**
 * Child setting cards carry their own frame and heading; inside a row they sit flat and the
 * row title replaces the heading.
 */
const EMBED = '[&_section]:border-0 [&_section]:shadow-none [&_section]:p-0 [&_section]:rounded-none [&_section]:bg-transparent [&_section_h2]:hidden';

interface RowProps {
  id: string;
  title: string;
  hint?: string;
  icon: React.ElementType;
  tone: keyof typeof TONES;
  open: string | null;
  setOpen: (id: string | null) => void;
  children: React.ReactNode;
}

const Row: React.FC<RowProps> = ({ id, title, hint, icon: Icon, tone, open, setOpen, children }) => {
  const expanded = open === id;
  return (
    <div>
      <button onClick={() => setOpen(expanded ? null : id)} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-right active:bg-slate-50">
        <span className={`w-7 h-7 rounded-lg ${TONES[tone]} text-white flex items-center justify-center shrink-0`}>
          <Icon className="w-4 h-4" />
        </span>
        <span className="flex-1 min-w-0 text-[13px] text-slate-800">{title}</span>
        {hint && <span className="text-[11px] text-slate-400 truncate max-w-[45%]">{hint}</span>}
        <ChevronLeft className={`w-4 h-4 text-slate-300 shrink-0 transition ${expanded ? '-rotate-90' : ''}`} />
      </button>
      {expanded && <div className={`px-3 pb-3 pt-1 ${EMBED}`}>{children}</div>}
    </div>
  );
};

const Group: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div>
    <div className="text-[11px] text-slate-400 px-3 mb-1">{title}</div>
    <div className="bg-white rounded-2xl border border-slate-100 divide-y divide-slate-100 overflow-hidden">{children}</div>
  </div>
);

const SaveButton: React.FC<{ saving: boolean; onClick: () => void }> = ({ saving, onClick }) => (
  <button
    onClick={onClick}
    disabled={saving}
    className="w-full py-2.5 rounded-xl bg-sky-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
  >
    <Save className="w-3.5 h-3.5" /> {saving ? 'در حال ذخیره…' : 'ذخیره'}
  </button>
);

export const SettingsPage: React.FC = () => {
  const settings = useSettings();
  const { user } = useAuth();
  const { showNotification } = useNotification();
  const isAdmin = user?.role === 'admin';
  const [open, setOpen] = useState<string | null>(null);
  const [sample, setSample] = useState<Product[]>([]);
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [shop, setShop] = useState({ shopName: '', shopPhone: '', shopAddress: '', invoiceFooter: '', supermarketMinKg: 0, wholesaleMinKg: 0 });
  const [saving, setSaving] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [expandedSubs, setExpandedSubs] = useState<Set<string>>(new Set());
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newSubName, setNewSubName] = useState<Record<string, string>>({});

  const toggleSub = (key: string) => {
    setExpandedSubs((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  useEffect(() => {
    setShop({
      shopName: settings.shopName,
      shopPhone: settings.shopPhone,
      shopAddress: settings.shopAddress,
      invoiceFooter: settings.invoiceFooter,
      supermarketMinKg: settings.supermarketMinKg,
      wholesaleMinKg: settings.wholesaleMinKg,
    });
  }, [settings.shopName, settings.shopPhone, settings.shopAddress, settings.invoiceFooter, settings.supermarketMinKg, settings.wholesaleMinKg]);

  useEffect(() => {
    productsService
      .getAll()
      .then((ps) => {
        setCatalog(ps);
        setSample(ps.filter((p) => p.stock > 0).slice(0, 4));
      })
      .catch(() => undefined);
  }, []);

  const save = async (patch: Parameters<typeof settingsService.update>[0], silent = false) => {
    try {
      await settingsService.update(patch);
      if (!silent) showNotification({ title: 'ذخیره شد', message: 'تنظیمات به‌روز شد.', type: 'success' });
    } catch (err) {
      showNotification({ title: 'ذخیره نشد', message: apiErrorMessage(err, 'خطا در ذخیره تنظیمات'), type: 'error' });
    }
  };

  const setPos = (patch: Partial<PosView>) => save({ posView: patch }, true);

  const saveWith = async (patch: Parameters<typeof settingsService.update>[0]) => {
    setSaving(true);
    await save(patch);
    setSaving(false);
  };

  const groups = useMemo(() => {
    const map = new Map<string, { count: number; subs: Map<string, Product[]> }>();
    const ensure = (c: string) => {
      const g = map.get(c) ?? { count: 0, subs: new Map<string, Product[]>() };
      map.set(c, g);
      return g;
    };
    for (const name of settings.categoryOrder || []) if (name) ensure(name);
    for (const [cat, subs] of Object.entries(settings.subcategoryOrder || {})) {
      const g = ensure(cat);
      for (const s of subs || []) if (s && !g.subs.has(s)) g.subs.set(s, []);
    }
    for (const p of catalog) {
      const c = p.category || 'سایر';
      const g = ensure(c);
      g.count += 1;
      const s = p.subcategory || 'اصلی';
      if (!g.subs.has(s)) g.subs.set(s, []);
      g.subs.get(s)!.push(p);
    }
    for (const g of map.values()) if (g.subs.size === 0) g.subs.set('اصلی', []);
    const known = [...map.keys()];
    const ordered = (settings.categoryOrder || []).filter((n) => known.includes(n));
    const rest = known.filter((n) => !ordered.includes(n)).sort((a, b) => a.localeCompare(b, 'fa'));
    const prodOrder = settings.productOrder || [];
    const subOrder = settings.subcategoryOrder || {};

    return [...ordered, ...rest].map((catName) => {
      const g = map.get(catName)!;
      const knownSubs = [...g.subs.keys()];
      const prefSubs = (subOrder[catName] || []).filter((s) => knownSubs.includes(s));
      const restSubs = knownSubs.filter((s) => !prefSubs.includes(s)).sort((a, b) => a.localeCompare(b, 'fa'));
      const sortedSubs = [...prefSubs, ...restSubs].map((subName) => {
        const ps = g.subs.get(subName) || [];
        const sortedProducts = [...ps].sort((a, b) => {
          const ia = prodOrder.indexOf(a._id);
          const ib = prodOrder.indexOf(b._id);
          if (ia !== -1 && ib !== -1) return ia - ib;
          if (ia !== -1) return -1;
          if (ib !== -1) return 1;
          return a.name.localeCompare(b.name, 'fa');
        });
        return { name: subName, count: ps.length, products: sortedProducts };
      });
      return { name: catName, count: g.count, subs: sortedSubs };
    });
  }, [catalog, settings.categoryOrder, settings.subcategoryOrder, settings.productOrder]);

  const moveCategory = (name: string, dir: -1 | 1) => {
    const list = groups.map((g) => g.name);
    const i = list.indexOf(name);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    save({ categoryOrder: list }, true);
  };

  const moveSubcategory = (catName: string, subName: string, dir: -1 | 1) => {
    const catGroup = groups.find((g) => g.name === catName);
    if (!catGroup) return;
    const currentSubs = catGroup.subs.map((s) => s.name);
    const i = currentSubs.indexOf(subName);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= currentSubs.length) return;
    const nextSubs = [...currentSubs];
    [nextSubs[i], nextSubs[j]] = [nextSubs[j], nextSubs[i]];
    save({ subcategoryOrder: { ...(settings.subcategoryOrder || {}), [catName]: nextSubs } }, true);
  };

  const moveProduct = (subProducts: Product[], prodId: string, dir: -1 | 1) => {
    const currentList = subProducts.map((p) => p._id);
    const i = currentList.indexOf(prodId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= currentList.length) return;
    const nextList = [...currentList];
    [nextList[i], nextList[j]] = [nextList[j], nextList[i]];
    const existingOther = (settings.productOrder || []).filter((id) => !currentList.includes(id));
    save({ productOrder: [...existingOther, ...nextList] }, true);
  };

  const addCategory = () => {
    const name = newCategoryName.trim();
    if (!name) return;
    if (groups.some((g) => g.name === name)) {
      showNotification({ title: 'این دسته هست', message: `«${name}» از قبل وجود دارد.`, type: 'warning' });
      return;
    }
    save({ categoryOrder: [...groups.map((g) => g.name), name] }, true);
    setNewCategoryName('');
  };

  const addSubcategory = (catName: string) => {
    const name = (newSubName[catName] || '').trim();
    if (!name) return;
    const cat = groups.find((g) => g.name === catName);
    if (!cat) return;
    if (cat.subs.some((s) => s.name === name)) {
      showNotification({ title: 'این زیردسته هست', message: `«${name}» در «${catName}» هست.`, type: 'warning' });
      return;
    }
    save(
      { subcategoryOrder: { ...(settings.subcategoryOrder || {}), [catName]: [...cat.subs.map((s) => s.name), name] } },
      true,
    );
    setNewSubName((d) => ({ ...d, [catName]: '' }));
  };

  const removeCategory = (name: string) => {
    const sub = { ...(settings.subcategoryOrder || {}) };
    delete sub[name];
    save({ categoryOrder: groups.map((g) => g.name).filter((n) => n !== name), subcategoryOrder: sub }, true);
  };

  const removeSubcategory = (catName: string, subName: string) => {
    const cat = groups.find((g) => g.name === catName);
    if (!cat) return;
    save(
      {
        subcategoryOrder: {
          ...(settings.subcategoryOrder || {}),
          [catName]: cat.subs.map((s) => s.name).filter((n) => n !== subName),
        },
      },
      true,
    );
  };

  const moveProductTo = async (p: Product, target: string) => {
    const [category, sub] = target.split('\t');
    if (!category) return;
    const subcategory = !sub || sub === 'اصلی' ? '' : sub;
    if ((p.category || 'سایر') === category && (p.subcategory || '') === subcategory) return;
    try {
      const updated = await productsService.update(p._id, { category, subcategory });
      setCatalog((list) => list.map((x) => (x._id === p._id ? { ...x, ...updated } : x)));
    } catch (err) {
      showNotification({ title: 'جابه‌جا نشد', message: apiErrorMessage(err, 'خطا در تغییر دسته'), type: 'error' });
    }
  };

  const rename = async (from: string, parent?: string) => {
    const key = parent ? `${parent}::${from}` : from;
    const to = (draft[key] ?? from).trim();
    if (!to || to === from) return;
    try {
      const res = await productsService.renameCategory(from, to, parent ? 'subcategory' : 'category', parent);
      if (!parent) {
        const order = groups.map((g) => (g.name === from ? to : g.name));
        await settingsService.update({ categoryOrder: order });
      }
      setCatalog(await productsService.getAll());
      setDraft((d) => {
        const next = { ...d };
        delete next[key];
        return next;
      });
      showNotification({ title: 'نام عوض شد', message: `${num(res.modified)} کالا به‌روز شد.`, type: 'success' });
    } catch (err) {
      showNotification({ title: 'نام عوض نشد', message: apiErrorMessage(err, 'خطا در تغییر دسته'), type: 'error' });
    }
  };

  const [params] = useSearchParams();
  const adminPart = params.get('part') === 'admin';
  const pos = settings.posView;
  const preview = useMemo(() => new Map<string, number>(sample[0] ? [[sample[0]._id, 2]] : []), [sample]);
  const row = { open, setOpen };
  const visibleSections = settings.posSections.filter((s) => s.visible).length;

  return (
    <IonPage>
      <ReportHeader
        title={adminPart ? 'تنظیمات و پشتیبان' : 'چیدمان فروش'}
        subtitle={isAdmin ? settings.shopName : 'فقط مدیر می‌تواند تغییر دهد'}
      />
      <IonContent fullscreen className="bg-slate-50">
        <div className="p-3 space-y-4 max-w-md mx-auto pb-8">
          {!adminPart && <Group title="صفحه فروش">
            <Row id="layout" title="نمایش کالاها" hint={LAYOUTS.find((l) => l.id === pos.layout)?.label} icon={LayoutGrid} tone="sky" {...row}>
              <div className="space-y-2.5">
                <div className="grid grid-cols-3 gap-1.5">
                  {LAYOUTS.map((l) => (
                    <button
                      key={l.id}
                      disabled={!isAdmin}
                      onClick={() => setPos({ layout: l.id })}
                      className={`rounded-xl border py-2 flex flex-col items-center gap-1 transition disabled:opacity-60 ${
                        pos.layout === l.id ? 'bg-sky-600 border-sky-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      <l.icon className="w-4 h-4" />
                      <span className="text-[11px] font-bold">{l.label}</span>
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-700">اندازه اعداد</span>
                  <div className="flex p-0.5 rounded-xl bg-slate-100">
                    {([
                      ['sm', 'ریز'],
                      ['md', 'معمولی'],
                    ] as const).map(([id, label]) => (
                      <button
                        key={id}
                        disabled={!isAdmin}
                        onClick={() => setPos({ size: id })}
                        className={`px-3 py-1 rounded-lg text-[11px] font-bold ${pos.size === id ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-500'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="divide-y divide-slate-100 border-t border-slate-100">
                  <Toggle label="عکس" checked={pos.showImages} disabled={!isAdmin} onChange={(v) => setPos({ showImages: v })} />
                  <Toggle label="قیمت کیلویی" checked={pos.showPerKg} disabled={!isAdmin} onChange={(v) => setPos({ showPerKg: v })} />
                  <Toggle label="موجودی" checked={pos.showStock} disabled={!isAdmin} onChange={(v) => setPos({ showStock: v })} />
                </div>
                {sample.length > 0 && (
                  <div className="rounded-xl bg-slate-50 p-2">
                    <ProductBrowser products={sample} saleType="retail" inCart={preview} onPick={() => undefined} view={pos} bare />
                  </div>
                )}
              </div>
            </Row>

            <Row id="sections" title="ترتیب بخش‌ها" hint={`${num(visibleSections)} بخش`} icon={Rows3} tone="violet" {...row}>
              <PosSectionsSettings sections={settings.posSections} isAdmin={isAdmin} />
            </Row>

            <Row id="categories" title="دسته‌ها و کالاها" hint={`${num(groups.length)} دسته`} icon={Tags} tone="amber" {...row}>
              <div className="space-y-2">
                <p className="text-[11px] text-slate-400 leading-relaxed px-0.5">
                  دسته و زیردستهٔ جدید بسازید، کالا را به زیردستهٔ دیگری ببرید، و با فلش‌ها ترتیب نمایش در صفحه فروش را عوض کنید.
                </p>
                {isAdmin && (
                  <div className="flex gap-1.5">
                    <input
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="نام دسته جدید"
                      className="flex-1 min-w-0 px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-sky-400"
                    />
                    <button
                      type="button"
                      onClick={addCategory}
                      className="px-2.5 py-1.5 rounded-xl bg-amber-600 text-white text-[10px] font-bold shrink-0 flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      دسته جدید
                    </button>
                  </div>
                )}
                {groups.length === 0 ? (
                  <p className="text-[11px] text-slate-400">دسته‌ای ثبت نشده.</p>
                ) : (
                  groups.map((g, i) => {
                    const key = g.name;
                    const typed = draft[key] ?? g.name;
                    return (
                      <div key={g.name} className="rounded-2xl border border-slate-200/80 p-2.5 space-y-2 bg-slate-50/60">
                        <div className="flex items-center gap-1.5">
                          <input
                            value={typed}
                            disabled={!isAdmin}
                            onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                            className="flex-1 min-w-0 px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs font-bold focus:outline-none focus:border-sky-400 disabled:bg-slate-50"
                          />
                          <span className="text-[10px] text-slate-400 shrink-0 font-mono">{num(g.count)} کالا</span>
                          {isAdmin && typed.trim() && typed.trim() !== g.name && (
                            <button onClick={() => rename(g.name)} className="px-2 py-1.5 rounded-xl bg-sky-600 text-white text-[10px] font-bold shrink-0">
                              ذخیره
                            </button>
                          )}
                          <button
                            disabled={!isAdmin || i === 0}
                            onClick={() => moveCategory(g.name, -1)}
                            className="p-1.5 rounded-xl bg-white border border-slate-200 text-slate-600 disabled:opacity-30"
                            aria-label="دسته بالاتر"
                            title="دسته بالاتر"
                          >
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            disabled={!isAdmin || i === groups.length - 1}
                            onClick={() => moveCategory(g.name, 1)}
                            className="p-1.5 rounded-xl bg-white border border-slate-200 text-slate-600 disabled:opacity-30"
                            aria-label="دسته پایین‌تر"
                            title="دسته پایین‌تر"
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                          {isAdmin && g.count === 0 && (
                            <button
                              type="button"
                              onClick={() => removeCategory(g.name)}
                              className="text-[10px] font-bold text-rose-600 shrink-0"
                            >
                              حذف
                            </button>
                          )}
                        </div>

                        {/* Subcategories list */}
                        <div className="space-y-2 pr-2 border-r-2 border-sky-300">
                          {g.subs.map((sub, si) => {
                            const sk = `${g.name}::${sub.name}`;
                            const subTyped = draft[sk] ?? sub.name;
                            const isExpanded = expandedSubs.has(sk);
                            return (
                              <div key={sub.name} className="rounded-xl border border-slate-200 bg-white p-2 space-y-2 shadow-2xs">
                                <div className="flex items-center gap-1.5">
                                  <input
                                    value={subTyped}
                                    disabled={!isAdmin}
                                    onChange={(e) => setDraft((d) => ({ ...d, [sk]: e.target.value }))}
                                    className="flex-1 min-w-0 px-2.5 py-1 rounded-lg border border-slate-100 text-[11px] font-medium focus:outline-none focus:border-sky-400 disabled:bg-slate-50"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => toggleSub(sk)}
                                    className={`text-[10px] font-bold px-2 py-1 rounded-lg flex items-center gap-1 transition shrink-0 ${
                                      isExpanded ? 'bg-sky-100 text-sky-800' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    }`}
                                  >
                                    <span>{num(sub.count)} کالا</span>
                                    <ChevronDown className={`w-3 h-3 transition ${isExpanded ? 'rotate-180' : ''}`} />
                                  </button>
                                  {isAdmin && subTyped.trim() && subTyped.trim() !== sub.name && (
                                    <button onClick={() => rename(sub.name, g.name)} className="text-[10px] font-bold text-sky-700 shrink-0">
                                      ذخیره
                                    </button>
                                  )}
                                  <button
                                    disabled={!isAdmin || si === 0}
                                    onClick={() => moveSubcategory(g.name, sub.name, -1)}
                                    className="p-1 rounded-lg bg-slate-100 text-slate-600 disabled:opacity-30"
                                    aria-label="زیردسته بالاتر"
                                    title="زیردسته بالاتر"
                                  >
                                    <ChevronUp className="w-3 h-3" />
                                  </button>
                                  <button
                                    disabled={!isAdmin || si === g.subs.length - 1}
                                    onClick={() => moveSubcategory(g.name, sub.name, 1)}
                                    className="p-1 rounded-lg bg-slate-100 text-slate-600 disabled:opacity-30"
                                    aria-label="زیردسته پایین‌تر"
                                    title="زیردسته پایین‌تر"
                                  >
                                    <ChevronDown className="w-3 h-3" />
                                  </button>
                                  {isAdmin && sub.products.length === 0 && !(sub.name === 'اصلی' && g.subs.length === 1) && (
                                    <button
                                      type="button"
                                      onClick={() => removeSubcategory(g.name, sub.name)}
                                      className="text-[10px] font-bold text-rose-600 shrink-0"
                                    >
                                      حذف
                                    </button>
                                  )}
                                </div>

                                {/* Products inside this subcategory */}
                                {isExpanded && (
                                  <div className="pt-2 border-t border-slate-100 space-y-1.5">
                                    <div className="text-[10px] text-slate-400 font-medium px-0.5">
                                      ترتیب نمایش کالاها در این زیردسته:
                                    </div>
                                    {sub.products.map((p, pi) => (
                                      <div
                                        key={p._id}
                                        className="flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-100 text-[11px]"
                                      >
                                        <div className="flex-1 min-w-0">
                                          <span className="font-semibold text-slate-800 block truncate">{p.name}</span>
                                          <span className="text-[9px] text-slate-400">
                                            {p.unit} · موجودی: {num(p.stock)}
                                          </span>
                                        </div>
                                        <select
                                          disabled={!isAdmin}
                                          value={`${p.category || 'سایر'}\t${p.subcategory || 'اصلی'}`}
                                          onChange={(e) => moveProductTo(p, e.target.value)}
                                          className="max-w-[48%] text-[10px] rounded-lg border border-slate-200 bg-white px-1 py-1 text-slate-700"
                                          aria-label="انتقال به دسته"
                                        >
                                          {groups.flatMap((cat) =>
                                            cat.subs.map((s) => (
                                              <option key={`${cat.name}\t${s.name}`} value={`${cat.name}\t${s.name}`}>
                                                {cat.name} · {s.name}
                                              </option>
                                            )),
                                          )}
                                        </select>
                                        <div className="flex items-center gap-1 shrink-0">
                                          <button
                                            disabled={!isAdmin || pi === 0}
                                            onClick={() => moveProduct(sub.products, p._id, -1)}
                                            className="p-1 rounded bg-white border border-slate-200 text-slate-600 disabled:opacity-30 hover:bg-slate-100"
                                            title="کالا بالاتر"
                                          >
                                            <ChevronUp className="w-3 h-3" />
                                          </button>
                                          <button
                                            disabled={!isAdmin || pi === sub.products.length - 1}
                                            onClick={() => moveProduct(sub.products, p._id, 1)}
                                            className="p-1 rounded bg-white border border-slate-200 text-slate-600 disabled:opacity-30 hover:bg-slate-100"
                                            title="کالا پایین‌تر"
                                          >
                                            <ChevronDown className="w-3 h-3" />
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          {isAdmin && (
                            <div className="flex gap-1.5">
                              <input
                                value={newSubName[g.name] || ''}
                                onChange={(e) => setNewSubName((d) => ({ ...d, [g.name]: e.target.value }))}
                                placeholder="زیردسته جدید"
                                className="flex-1 min-w-0 px-2.5 py-1 rounded-lg border border-slate-200 text-[11px] focus:outline-none focus:border-sky-400"
                              />
                              <button
                                type="button"
                                onClick={() => addSubcategory(g.name)}
                                className="px-2 py-1 rounded-lg bg-sky-600 text-white text-[10px] font-bold shrink-0"
                              >
                                افزودن
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Row>

            <Row
              id="pricing"
              title="سطح قیمت"
              hint={`${num(settings.supermarketMinKg)} / ${num(settings.wholesaleMinKg)} کیلو`}
              icon={Scale}
              tone="emerald"
              {...row}
            >
              <div className="space-y-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <Field label="سوپرمارکت از (کیلو)">
                    <input
                      className={`${input} font-mono`}
                      inputMode="numeric"
                      disabled={!isAdmin}
                      value={shop.supermarketMinKg}
                      onChange={(e) => setShop({ ...shop, supermarketMinKg: Number(e.target.value.replace(/\D/g, '')) })}
                    />
                  </Field>
                  <Field label="عمده از (کیلو)">
                    <input
                      className={`${input} font-mono`}
                      inputMode="numeric"
                      disabled={!isAdmin}
                      value={shop.wholesaleMinKg}
                      onChange={(e) => setShop({ ...shop, wholesaleMinKg: Number(e.target.value.replace(/\D/g, '')) })}
                    />
                  </Field>
                </div>
                <div className="divide-y divide-slate-100 border-t border-slate-100">
                  <Toggle label="انتخاب خودکار با وزن" checked={settings.autoSaleType} disabled={!isAdmin} onChange={(v) => save({ autoSaleType: v }, true)} />
                  <Toggle label="عمده و سوپرمارکت اول پیش‌فاکتور" checked={settings.proformaForBulk} disabled={!isAdmin} onChange={(v) => save({ proformaForBulk: v }, true)} />
                </div>
                {isAdmin && (
                  <SaveButton
                    saving={saving}
                    onClick={() => saveWith({ supermarketMinKg: Number(shop.supermarketMinKg), wholesaleMinKg: Number(shop.wholesaleMinKg) })}
                  />
                )}
              </div>
            </Row>
          </Group>}

          {adminPart && <Group title="فروشگاه">
            <Row id="shop" title="مشخصات" hint={settings.shopName} icon={Store} tone="sky" {...row}>
              <div className="space-y-2">
                <Field label="نام">
                  <input className={input} disabled={!isAdmin} value={shop.shopName} onChange={(e) => setShop({ ...shop, shopName: e.target.value })} />
                </Field>
                <Field label="تلفن">
                  <input
                    className={`${input} font-mono text-left`}
                    dir="ltr"
                    inputMode="tel"
                    disabled={!isAdmin}
                    value={shop.shopPhone}
                    onChange={(e) => setShop({ ...shop, shopPhone: e.target.value })}
                  />
                </Field>
                <Field label="آدرس">
                  <input className={input} disabled={!isAdmin} value={shop.shopAddress} onChange={(e) => setShop({ ...shop, shopAddress: e.target.value })} />
                </Field>
                <Field label="پایین فاکتور">
                  <input className={input} disabled={!isAdmin} value={shop.invoiceFooter} onChange={(e) => setShop({ ...shop, invoiceFooter: e.target.value })} />
                </Field>
                {isAdmin && (
                  <SaveButton
                    saving={saving}
                    onClick={() =>
                      saveWith({ shopName: shop.shopName, shopPhone: shop.shopPhone, shopAddress: shop.shopAddress, invoiceFooter: shop.invoiceFooter })
                    }
                  />
                )}
              </div>
            </Row>

            <Row id="bank" title="حساب‌های بانکی" hint={`${num(settings.bankCards.length)} حساب`} icon={CreditCard} tone="indigo" {...row}>
              <BankAccountsSettings cards={settings.bankCards} isAdmin={isAdmin} />
            </Row>

            <Row id="sms" title="متن پیامک‌ها" icon={MessageSquareText} tone="teal" {...row}>
              <SmsTemplatesSettings settings={settings} isAdmin={isAdmin} />
            </Row>
          </Group>}

          {adminPart && <Group title="انبار">
            <Row id="stock" title="محاسبه مجدد انبار" hint="از روی فاکتورهای خرید و فروش" icon={RefreshCw} tone="emerald" {...row}>
              <p className="text-[11px] text-slate-500 leading-5 mb-2">
                موجودی هر کالا دوباره حساب می‌شود: خریدهایی که تحویل شده‌اند، منهای فروش‌هایی که از موجودی آریو رفته‌اند. فروش از شرکت و باری که هنوز تحویل نشده وارد این حساب نمی‌شود.
              </p>
              <button
                disabled={rebuilding}
                onClick={() => {
                  if (!window.confirm('موجودی انبار از روی فاکتورهای خرید و فروش دوباره نوشته شود؟')) return;
                  setRebuilding(true);
                  invoicesService
                    .rebuildStock()
                    .then((res) => {
                      showNotification({
                        title: 'انبار به‌روز شد',
                        message: `${res.changed.toLocaleString('fa-IR')} کالا اصلاح شد. ${res.purchases.toLocaleString('fa-IR')} فاکتور خرید و ${res.sales.toLocaleString('fa-IR')} فاکتور فروش حساب شد.`,
                        type: 'success',
                      });
                    })
                    .catch((err) => {
                      showNotification({ title: 'انبار به‌روز نشد', message: apiErrorMessage(err, 'محاسبه انبار انجام نشد'), type: 'error' });
                    })
                    .finally(() => setRebuilding(false));
                }}
                className="w-full py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold disabled:opacity-50"
              >
                {rebuilding ? 'در حال محاسبه…' : 'محاسبه و به‌روزرسانی انبار'}
              </button>
            </Row>
          </Group>}

          {adminPart && <Group title="پشتیبان">
            <Row
              id="backup"
              title="پشتیبان و خروجی"
              hint={settings.backup.enabled ? `هر روز ${num(settings.backup.hour)}:۰۰` : 'خاموش'}
              icon={DatabaseBackup}
              tone="rose"
              {...row}
            >
              <BackupSettings prefs={settings.backup} isAdmin={isAdmin} />
            </Row>
          </Group>}
        </div>
      </IonContent>
    </IonPage>
  );
};
