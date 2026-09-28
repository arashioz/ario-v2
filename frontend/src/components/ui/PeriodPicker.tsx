import React, { useState } from 'react';
import { CalendarRange, ChevronDown } from 'lucide-react';
import { Sheet } from './Sheet';
import { JalaliCalendar } from './JalaliDatePicker';
import { addDaysYmd, formatJalali, jalaliMonthRange, todayYmd, weekdayIndex, ymdToJalali, JALALI_MONTHS, faNum } from '../../lib/jalali';

export interface Period {
  from?: string;
  to?: string;
  label: string;
}

export function periodPresets(): Period[] {
  const today = todayYmd();
  const j = ymdToJalali(today);
  const thisMonth = jalaliMonthRange(j.jy, j.jm);
  const prevIdx = j.jy * 12 + j.jm - 2;
  const pj = { jy: Math.floor(prevIdx / 12), jm: (prevIdx % 12) + 1 };
  const prevMonth = jalaliMonthRange(pj.jy, pj.jm);
  return [
    { label: 'کل دوره', from: undefined, to: undefined },
    { label: 'امروز', from: today, to: today },
    { label: 'دیروز', from: addDaysYmd(today, -1), to: addDaysYmd(today, -1) },
    { label: 'این هفته', from: addDaysYmd(today, -weekdayIndex(today)), to: today },
    { label: `ماه ${JALALI_MONTHS[j.jm - 1]}`, ...thisMonth },
    { label: `ماه ${JALALI_MONTHS[pj.jm - 1]}`, ...prevMonth },
    { label: '۳۰ روز اخیر', from: addDaysYmd(today, -29), to: today },
    { label: `سال ${faNum(j.jy)}`, from: jalaliMonthRange(j.jy, 1).from, to: today },
  ];
}

export const periodQuery = (p: Period) => ({ from: p.from, to: p.to });

interface Props {
  value: Period;
  onChange: (p: Period) => void;
}

/** Chip showing the current report period; opens presets + custom Jalali range. */
export const PeriodPicker: React.FC<Props> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState<string | undefined>(value.from);
  const [to, setTo] = useState<string | undefined>(value.to);

  const pick = (ymd: string) => {
    if (!from || (from && to)) {
      setFrom(ymd);
      setTo(undefined);
    } else if (ymd < from) {
      setTo(from);
      setFrom(ymd);
    } else {
      setTo(ymd);
    }
  };

  const applyCustom = () => {
    if (!from) return;
    const end = to ?? from;
    onChange({ from, to: end, label: from === end ? formatJalali(from) : `${formatJalali(from, { year: false })} تا ${formatJalali(end, { year: false })}` });
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setFrom(value.from);
          setTo(value.to);
          setOpen(true);
        }}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-white border border-slate-200 text-xs font-medium text-slate-700 active:scale-95 transition"
      >
        <CalendarRange className="w-3.5 h-3.5 text-sky-600" />
        <span>{value.label}</span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
      </button>

      <Sheet
        open={open}
        title="بازه گزارش"
        subtitle={
          from ? `${formatJalali(from)}${to && to !== from ? ` تا ${formatJalali(to)}` : ''}` : 'یک بازه آماده یا روزهای دلخواه را انتخاب کنید'
        }
        onClose={() => setOpen(false)}
        footer={
          <button
            type="button"
            disabled={!from}
            onClick={applyCustom}
            className="w-full py-3 rounded-2xl bg-sky-600 disabled:bg-slate-300 text-white text-sm font-bold"
          >
            اعمال بازه دلخواه
          </button>
        }
      >
        <div className="grid grid-cols-2 gap-2">
          {periodPresets().map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                onChange(p);
                setOpen(false);
              }}
              className={`py-2.5 rounded-xl text-xs font-medium border transition ${
                value.label === p.label ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-slate-200 text-slate-600'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="pt-2 border-t border-slate-100">
          <p className="text-[11px] text-slate-400 mb-2">روز شروع و سپس روز پایان را بزنید</p>
          <JalaliCalendar value={undefined} rangeFrom={from} rangeTo={to} onChange={pick} max={todayYmd()} />
        </div>
      </Sheet>
    </>
  );
};
