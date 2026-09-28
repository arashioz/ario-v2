import React, { useEffect, useMemo, useRef, useState } from 'react';
import { dateToYmd, formatJalali } from '../../lib/jalali';
import { num } from '../../lib/format';

export interface ChartPoint {
  t: number;
  y: number;
  note?: string;
}

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
  points: ChartPoint[];
  /** `step`: the value holds until the next point (list prices). `dots`: separate events (purchases). */
  mode: 'line' | 'step' | 'dots';
  band?: { t: number; lo: number; hi: number }[];
}

const PAD = { top: 12, right: 12, bottom: 26, left: 56 };

function niceTicks(min: number, max: number, count = 4) {
  if (!(max > min)) return [min];
  const raw = (max - min) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + 1e-9; v += step) ticks.push(v);
  return ticks;
}

const shortNum = (v: number) => (Math.abs(v) >= 1000 ? `${num(v / 1000, v % 1000 ? 1 : 0)}ک` : num(v));
const dayLabel = (t: number) => formatJalali(dateToYmd(new Date(t)), { year: false });

/** Value of a series at time t: last point ≤ t for steps, nearest point otherwise. */
function valueAt(s: ChartSeries, t: number, maxGap: number): ChartPoint | null {
  if (!s.points.length) return null;
  if (s.mode === 'step') {
    let last: ChartPoint | null = null;
    for (const p of s.points) {
      if (p.t <= t) last = p;
      else break;
    }
    return last;
  }
  let best: ChartPoint | null = null;
  for (const p of s.points) if (!best || Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
  return best && Math.abs(best.t - t) <= maxGap ? best : null;
}

export const PriceChart: React.FC<{ series: ChartSeries[]; from: number; to: number; height?: number; unitLabel: string }> = ({
  series,
  from,
  to,
  height = 240,
  unitLabel,
}) => {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(360);
  const [hoverT, setHoverT] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(260, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const visible = useMemo(
    () =>
      series.map((s) => {
        const inRange = s.points.filter((p) => p.t >= from && p.t <= to);
        // A step or purchase series carries its last value from before the window into it.
        const carry = (s.mode === 'step' || s.key === 'purchase') ? [...s.points].reverse().find((p) => p.t < from) : undefined;
        return {
          ...s,
          points: carry ? [{ ...carry, t: from }, ...inRange] : inRange,
          band: s.band?.filter((b) => b.t >= from && b.t <= to),
        };
      }),
    [series, from, to],
  );

  const ys = visible.flatMap((s) => [...s.points.map((p) => p.y), ...(s.band ?? []).flatMap((b) => [b.lo, b.hi])]).filter((v) => v > 0);
  const hasData = ys.length > 0;
  const rawMin = hasData ? Math.min(...ys) : 0;
  const rawMax = hasData ? Math.max(...ys) : 1;
  const padY = (rawMax - rawMin) * 0.08 || rawMax * 0.05 || 1;
  const yMin = Math.max(0, rawMin - padY);
  const yMax = rawMax + padY;
  const innerW = width - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const x = (t: number) => PAD.left + ((t - from) / Math.max(1, to - from)) * innerW;
  const y = (v: number) => PAD.top + (1 - (v - yMin) / Math.max(1e-9, yMax - yMin)) * innerH;
  const yTicks = niceTicks(yMin, yMax);
  const xTicks = [0, 1 / 3, 2 / 3, 1].map((f) => from + f * (to - from));
  const maxGap = (to - from) / 30;

  const path = (s: ChartSeries) => {
    if (s.points.length === 0) return '';
    if (s.mode === 'step') {
      let d = '';
      s.points.forEach((p, i) => {
        d += i === 0 ? `M${x(p.t)},${y(p.y)}` : `H${x(p.t)}V${y(p.y)}`;
      });
      return `${d}H${x(to)}`;
    }
    return s.points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t)},${y(p.y)}`).join('');
  };

  const band = (s: ChartSeries) => {
    const b = s.band ?? [];
    if (b.length < 2) return '';
    return `M${b.map((p) => `${x(p.t)},${y(p.hi)}`).join('L')}L${[...b].reverse().map((p) => `${x(p.t)},${y(p.lo)}`).join('L')}Z`;
  };

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    if (px < PAD.left || px > width - PAD.right) return setHoverT(null);
    setHoverT(from + ((px - PAD.left) / innerW) * (to - from));
  };

  const readings = hoverT !== null ? visible.map((s) => ({ s, p: valueAt(s, hoverT, maxGap) })).filter((r) => r.p) : [];
  const tipLeft = hoverT !== null ? x(hoverT) : 0;

  return (
    <div ref={wrap} className="relative select-none" dir="ltr">
      {!hasData ? (
        <div className="flex items-center justify-center text-xs text-slate-400" style={{ height }} dir="rtl">
          در این بازه داده‌ای نیست.
        </div>
      ) : (
        <svg width={width} height={height} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHoverT(null)} className="touch-pan-y">
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} stroke="#e2e8f0" strokeDasharray="3 3" />
              <text x={PAD.left - 6} y={y(v) + 3} textAnchor="end" fontSize="10" fill="#94a3b8" fontFamily="Vazirmatn Variable, sans-serif">
                {shortNum(v)}
              </text>
            </g>
          ))}
          {xTicks.map((t, i) => (
            <text
              key={t}
              x={x(t)}
              y={height - 8}
              textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}
              fontSize="10"
              fill="#94a3b8"
              fontFamily="Vazirmatn Variable, sans-serif"
            >
              {dayLabel(t)}
            </text>
          ))}
          {visible.map((s) => s.band && <path key={`${s.key}-band`} d={band(s)} fill={s.color} opacity={0.12} />)}
          {visible.map((s) =>
            s.mode === 'dots' ? (
              <g key={s.key}>
                <path d={path(s)} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray="5 3" opacity={0.8} />
                {s.points.map((p) => (
                  <circle key={`${p.t}-${p.y}`} cx={x(p.t)} cy={y(p.y)} r={4} fill="white" stroke={s.color} strokeWidth={2.5} />
                ))}
              </g>
            ) : (
              <g key={s.key}>
                <path d={path(s)} fill="none" stroke={s.color} strokeWidth={s.key === 'purchase' ? 2.5 : s.mode === 'step' ? 2 : 1.75} strokeLinejoin="round" />
                {s.key === 'purchase' && s.points.map((p, idx) => (
                  <circle key={`pt-${idx}`} cx={x(p.t)} cy={y(p.y)} r={3.5} fill="white" stroke={s.color} strokeWidth={2} />
                ))}
              </g>
            ),
          )}
          {hoverT !== null && <line x1={tipLeft} x2={tipLeft} y1={PAD.top} y2={height - PAD.bottom} stroke="#64748b" strokeWidth={1} />}
          {readings.map(({ s, p }) => (
            <circle key={`h-${s.key}`} cx={x(p!.t)} cy={y(p!.y)} r={4} fill={s.color} stroke="white" strokeWidth={1.5} />
          ))}
        </svg>
      )}

      {hoverT !== null && readings.length > 0 && (
        <div
          className="absolute top-1 z-10 bg-slate-900/90 text-white rounded-xl px-2.5 py-2 text-[10px] leading-5 pointer-events-none shadow-lg min-w-[140px]"
          style={tipLeft > width / 2 ? { right: width - tipLeft + 8 } : { left: tipLeft + 8 }}
          dir="rtl"
        >
          <div className="font-bold mb-0.5">{formatJalali(dateToYmd(new Date(hoverT)))}</div>
          {readings.map(({ s, p }) => (
            <div key={s.key} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                {s.label}
              </span>
              <span className="font-mono">{num(p!.y)}</span>
            </div>
          ))}
          {readings.find((r) => r.p?.note) && <div className="text-slate-300 mt-0.5">{readings.find((r) => r.p?.note)!.p!.note}</div>}
          <div className="text-slate-400 mt-0.5">تومان · {unitLabel}</div>
        </div>
      )}
    </div>
  );
};
