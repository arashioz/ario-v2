import React from 'react';
import { ChevronDown, ChevronUp, Eye, EyeOff, RotateCcw } from 'lucide-react';
import {
  DEFAULT_POS_SECTIONS,
  POS_SECTION_LABELS,
  settingsService,
  type PosSection,
} from '../../services/settings.service';
import { apiErrorMessage } from '../../services/invoices.service';
import { useNotification } from '../../context/NotificationContext';

/** Order and visibility of the blocks on the sales screen. */
export const PosSectionsSettings: React.FC<{ sections: PosSection[]; isAdmin: boolean }> = ({ sections, isAdmin }) => {
  const { showNotification } = useNotification();

  const save = async (next: PosSection[]) => {
    try {
      await settingsService.update({ posSections: next });
    } catch (err) {
      showNotification({ title: 'ذخیره نشد', message: apiErrorMessage(err, 'خطا در ذخیره چینش'), type: 'error' });
    }
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= sections.length) return;
    const next = [...sections];
    [next[i], next[j]] = [next[j], next[i]];
    save(next);
  };

  const toggle = (i: number) => {
    const next = sections.map((s, idx) => (idx === i ? { ...s, visible: !s.visible } : s));
    if (!next.find((s) => s.id === 'products')?.visible) {
      showNotification({ title: 'لیست کالاها لازم است', message: 'بدون لیست کالا نمی‌توان فروش ثبت کرد.', type: 'warning' });
      return;
    }
    save(next);
  };

  return (
    <section className="bg-white rounded-3xl border border-slate-100 shadow-sm p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold text-slate-800">ترتیب بخش‌های صفحه فروش</h2>
        {isAdmin && (
          <button onClick={() => save(DEFAULT_POS_SECTIONS)} className="text-[11px] text-slate-500 flex items-center gap-1">
            <RotateCcw className="w-3.5 h-3.5" /> پیش‌فرض
          </button>
        )}
      </div>
      <p className="text-[11px] text-slate-400 leading-5">با فلش جابه‌جا کنید؛ با چشم نمایش هر بخش را روشن یا خاموش کنید. همان ترتیب از بالا به پایین در صفحه فروش دیده می‌شود.</p>
      <div className="space-y-1.5">
        {sections.map((s, i) => (
          <div
            key={s.id}
            className={`flex items-center gap-1.5 rounded-2xl border px-3 py-2 ${s.visible ? 'border-slate-200 bg-white' : 'border-dashed border-slate-200 bg-slate-50'}`}
          >
            <span className="w-5 h-5 rounded-full bg-sky-100 text-sky-700 text-[10px] font-bold flex items-center justify-center shrink-0 font-mono">
              {(i + 1).toLocaleString('fa-IR')}
            </span>
            <span className={`flex-1 text-xs ${s.visible ? 'text-slate-700 font-bold' : 'text-slate-400 line-through'}`}>{POS_SECTION_LABELS[s.id]}</span>
            <button disabled={!isAdmin} onClick={() => toggle(i)} className={`p-1.5 rounded-lg ${s.visible ? 'text-sky-600' : 'text-slate-400'}`} title={s.visible ? 'پنهان کردن' : 'نمایش'}>
              {s.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>
            <button disabled={!isAdmin || i === 0} onClick={() => move(i, -1)} className="p-1.5 rounded-lg bg-slate-100 text-slate-600 disabled:opacity-30" title="بالاتر">
              <ChevronUp className="w-4 h-4" />
            </button>
            <button
              disabled={!isAdmin || i === sections.length - 1}
              onClick={() => move(i, 1)}
              className="p-1.5 rounded-lg bg-slate-100 text-slate-600 disabled:opacity-30"
              title="پایین‌تر"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
};
