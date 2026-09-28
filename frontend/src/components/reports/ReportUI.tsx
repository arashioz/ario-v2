import React from 'react';
import { ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { IonHeader, IonToolbar } from '@ionic/react';

const TONES = {
  amber: 'bg-amber-100 text-amber-700',
  sky: 'bg-sky-100 text-sky-700',
  emerald: 'bg-emerald-100 text-emerald-700',
  slate: 'bg-slate-100 text-slate-600',
  rose: 'bg-rose-100 text-rose-700',
  violet: 'bg-violet-100 text-violet-700',
} as const;

export const ReportHeader: React.FC<{ title: string; subtitle: string; right?: React.ReactNode }> = ({ title, subtitle, right }) => {
  const navigate = useNavigate();
  return (
    <IonHeader className="ion-no-border">
      <IonToolbar className="bg-white/95 backdrop-blur-md border-b border-slate-100">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <button onClick={() => navigate(-1)} className="p-1 rounded-lg bg-slate-50 text-slate-700 active:scale-95 shrink-0">
              <ArrowRight className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-slate-800">{title}</h1>
              <p className="text-[10px] text-slate-400 truncate">{subtitle}</p>
            </div>
          </div>
          {right}
        </div>
      </IonToolbar>
    </IonHeader>
  );
};

export const StatCard: React.FC<{
  icon: React.ReactNode;
  tone: keyof typeof TONES;
  title: string;
  main: React.ReactNode;
  sub?: React.ReactNode;
  mainClass?: string;
}> = ({ icon, tone, title, main, sub, mainClass }) => (
  <div className="bg-white rounded-2xl p-3.5 border border-slate-100 shadow-sm">
    <div className="flex items-center gap-2">
      <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${TONES[tone]}`}>{icon}</div>
      <span className="text-[11px] text-slate-500 leading-4">{title}</span>
    </div>
    <div className={`mt-2 text-base font-bold font-mono ${mainClass ?? 'text-slate-800'}`}>{main}</div>
    {sub && <div className="text-[10px] text-slate-400 mt-0.5 font-mono">{sub}</div>}
  </div>
);

export const Mini: React.FC<{ label: string; value: React.ReactNode; sub?: React.ReactNode; valueClass?: string }> = ({ label, value, sub, valueClass }) => (
  <div className="bg-slate-50 rounded-2xl py-2 px-1 text-center">
    <div className="text-[10px] text-slate-400">{label}</div>
    <div className={`text-[11px] font-bold font-mono mt-0.5 break-words ${valueClass ?? 'text-slate-700'}`}>{value}</div>
    {sub && <div className="text-[9px] text-slate-400 font-mono mt-0.5">{sub}</div>}
  </div>
);

export const KV: React.FC<{ k: string; v: React.ReactNode; vClass?: string }> = ({ k, v, vClass }) => (
  <div className="bg-slate-50 rounded-xl px-2.5 py-2">
    <div className="text-[10px] text-slate-400">{k}</div>
    <div className={`font-mono font-bold mt-0.5 ${vClass ?? 'text-slate-700'}`}>{v}</div>
  </div>
);

export function Segments<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (v: T) => void;
  items: [T, string][];
}) {
  return (
    <div className="flex gap-1 p-1 bg-slate-200/70 rounded-2xl overflow-x-auto no-scrollbar">
      {items.map(([k, label]) => (
        <button
          key={k}
          onClick={() => onChange(k)}
          className={`flex-1 whitespace-nowrap px-2.5 py-2 rounded-xl text-[11px] font-bold transition ${
            value === k ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="bg-white rounded-2xl p-6 text-center border border-dashed border-slate-200 text-xs text-slate-400">{children}</div>
);
