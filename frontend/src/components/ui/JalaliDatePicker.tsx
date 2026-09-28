import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { Sheet } from './Sheet';
import {
  JALALI_MONTHS,
  JALALI_WEEKDAYS,
  addDaysYmd,
  faNum,
  formatJalali,
  jalaliMonthLength,
  jalaliToYmd,
  todayYmd,
  weekdayIndex,
  ymdToJalali,
} from '../../lib/jalali';

interface CalendarProps {
  value?: string;
  onChange: (ymd: string) => void;
  /** Days of a selected range to highlight (inclusive). */
  rangeFrom?: string;
  rangeTo?: string;
  max?: string;
}

/** Month grid on the Jalali calendar; emits Gregorian YYYY-MM-DD. */
export const JalaliCalendar: React.FC<CalendarProps> = ({ value, onChange, rangeFrom, rangeTo, max }) => {
  const today = todayYmd();
  const initial = ymdToJalali(value || today);
  const [view, setView] = useState({ jy: initial.jy, jm: initial.jm });

  useEffect(() => {
    if (!value) return;
    const j = ymdToJalali(value);
    setView({ jy: j.jy, jm: j.jm });
  }, [value]);

  const cells = useMemo(() => {
    const first = jalaliToYmd(view.jy, view.jm, 1);
    const offset = weekdayIndex(first);
    const len = jalaliMonthLength(view.jy, view.jm);
    const out: (null | { ymd: string; jd: number })[] = Array(offset).fill(null);
    for (let d = 1; d <= len; d++) out.push({ ymd: addDaysYmd(first, d - 1), jd: d });
    return out;
  }, [view]);

  const shift = (delta: number) =>
    setView((v) => {
      const idx = v.jy * 12 + (v.jm - 1) + delta;
      return { jy: Math.floor(idx / 12), jm: (idx % 12) + 1 };
    });

  const years = useMemo(() => {
    const cur = ymdToJalali(today).jy;
    return Array.from({ length: 8 }, (_, i) => cur - 5 + i);
  }, [today]);

  return (
    <div className="select-none">
      <div className="flex items-center justify-between mb-3">
        <button type="button" onClick={() => shift(-1)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-500">
          <ChevronRight className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-1.5">
          <select
            value={view.jm}
            onChange={(e) => setView((v) => ({ ...v, jm: Number(e.target.value) }))}
            className="text-sm font-bold text-slate-800 bg-transparent outline-none"
          >
            {JALALI_MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
          <select
            value={view.jy}
            onChange={(e) => setView((v) => ({ ...v, jy: Number(e.target.value) }))}
            className="text-sm font-bold text-slate-800 bg-transparent outline-none font-mono"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {faNum(y)}
              </option>
            ))}
          </select>
        </div>
        <button type="button" onClick={() => shift(1)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-500">
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {JALALI_WEEKDAYS.map((w, i) => (
          <div key={w + i} className={`text-[10px] font-bold py-1 ${i === 6 ? 'text-rose-400' : 'text-slate-400'}`}>
            {w}
          </div>
        ))}
        {cells.map((c, i) => {
          if (!c) return <div key={`e${i}`} />;
          const selected = c.ymd === value || c.ymd === rangeFrom || c.ymd === rangeTo;
          const inRange = rangeFrom && rangeTo && c.ymd > rangeFrom && c.ymd < rangeTo;
          const disabled = !!max && c.ymd > max;
          const isToday = c.ymd === today;
          const friday = i % 7 === 6;
          return (
            <button
              key={c.ymd}
              type="button"
              disabled={disabled}
              onClick={() => onChange(c.ymd)}
              className={`h-9 rounded-xl text-xs font-mono transition active:scale-95 ${
                selected
                  ? 'bg-sky-600 text-white font-bold shadow-sm shadow-sky-500/30'
                  : inRange
                    ? 'bg-sky-50 text-sky-800'
                    : disabled
                      ? 'text-slate-300'
                      : friday
                        ? 'text-rose-500 hover:bg-rose-50'
                        : 'text-slate-700 hover:bg-slate-100'
              } ${isToday && !selected ? 'ring-1 ring-sky-400' : ''}`}
            >
              {faNum(c.jd)}
            </button>
          );
        })}
      </div>
    </div>
  );
};

interface SheetProps {
  open: boolean;
  value?: string;
  title?: string;
  max?: string;
  onClose: () => void;
  onSelect: (ymd: string) => void;
}

/** Bottom sheet with quick presets and a Jalali month grid. */
export const JalaliDateSheet: React.FC<SheetProps> = ({ open, value, title = 'انتخاب تاریخ', max, onClose, onSelect }) => {
  const [draft, setDraft] = useState(value || todayYmd());
  useEffect(() => {
    if (open) setDraft(value || todayYmd());
  }, [open, value]);

  const today = todayYmd();
  const presets = [
    { label: 'امروز', ymd: today },
    { label: 'دیروز', ymd: addDaysYmd(today, -1) },
    { label: '۲ روز قبل', ymd: addDaysYmd(today, -2) },
  ];

  return (
    <Sheet
      open={open}
      title={title}
      subtitle={formatJalali(draft, { weekday: true })}
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={() => {
            onSelect(draft);
            onClose();
          }}
          className="w-full py-3 rounded-2xl bg-sky-600 text-white text-sm font-bold active:scale-[0.98] transition"
        >
          تأیید {formatJalali(draft)}
        </button>
      }
    >
      <div className="grid grid-cols-3 gap-2">
        {presets.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => setDraft(p.ymd)}
            className={`py-2 rounded-xl text-xs font-medium border transition ${
              draft === p.ymd ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-slate-200 text-slate-600'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <JalaliCalendar value={draft} onChange={setDraft} max={max} />
    </Sheet>
  );
};

interface FieldProps {
  value: string;
  onChange: (ymd: string) => void;
  title?: string;
  max?: string;
  className?: string;
}

/** Drop-in replacement for `<input type="date">` that shows and picks Jalali dates. */
export const JalaliDateField: React.FC<FieldProps> = ({ value, onChange, title, max, className }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          'w-full px-3 py-2.5 rounded-2xl border border-slate-200 text-xs text-slate-700 bg-white flex items-center justify-between gap-2 focus:outline-none focus:border-sky-500'
        }
      >
        <span className="font-mono">{value ? formatJalali(value) : 'انتخاب تاریخ'}</span>
        <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
      </button>
      <JalaliDateSheet open={open} value={value} title={title} max={max} onClose={() => setOpen(false)} onSelect={onChange} />
    </>
  );
};
