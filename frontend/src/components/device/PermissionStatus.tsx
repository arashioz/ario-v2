import React from 'react';
import { usePermissions } from '../../hooks/usePermissions';
import { PERMISSION_REGISTRY } from '../../services/permissions';
import { PERMISSION_STATE_LABELS } from '../../types/permissions';
import type { NormalizedPermissionState } from '../../types/permissions';

const TONE: Record<NormalizedPermissionState, string> = {
  granted: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  denied: 'bg-rose-50 text-rose-600 border-rose-100',
  prompt: 'bg-amber-50 text-amber-700 border-amber-100',
  unsupported: 'bg-slate-100 text-slate-500 border-slate-200',
  unknown: 'bg-slate-100 text-slate-500 border-slate-200',
};

/**
 * Lists every permission with its normalized state. The request button is the only
 * way to prompt; the list itself only queries.
 */
export const PermissionStatus: React.FC = () => {
  const { records, loading, last, request, refresh } = usePermissions();

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-slate-500 leading-5">
          فقط با دکمه «درخواست دسترسی» پرسیده می‌شود؛ باز کردن این صفحه چیزی نمی‌پرسد.
        </p>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="shrink-0 text-[11px] font-bold text-sky-700 disabled:opacity-50"
        >
          بررسی دوباره
        </button>
      </div>

      <ul className="space-y-2">
        {Object.values(PERMISSION_REGISTRY).map((meta) => {
          const record = records[meta.key];
          const state: NormalizedPermissionState = record?.state ?? 'unknown';
          const canAsk = state === 'prompt' || state === 'unknown';
          return (
            <li key={meta.key} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-3">
              <div className="min-w-0">
                <p className="text-[12px] font-bold text-slate-800">{meta.label}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">{meta.description}</p>
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${TONE[state]}`}>
                  {PERMISSION_STATE_LABELS[state]}
                </span>
                {canAsk && meta.mechanism !== 'clipboard-write-in-tap' && (
                  <button
                    type="button"
                    onClick={() => void request(meta.key)}
                    className="text-[10px] font-bold text-white bg-sky-600 rounded-lg px-2.5 py-1 active:scale-95"
                  >
                    درخواست دسترسی
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {last && (
        <p className={`text-[11px] leading-relaxed ${last.granted ? 'text-emerald-700' : 'text-rose-600'}`}>
          {last.message}
        </p>
      )}
    </div>
  );
};
