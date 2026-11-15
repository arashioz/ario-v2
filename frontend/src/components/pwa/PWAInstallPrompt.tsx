import React, { useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { usePwaInstall } from '../../hooks/usePwaInstall';
import { useStandaloneMode } from '../../hooks/useStandaloneMode';

const DISMISS_KEY = 'ario.installPrompt.dismissed';

/** Bottom sheet offering the install action. Hidden once installed, running standalone, or dismissed. */
export const PWAInstallPrompt: React.FC = () => {
  const { canPrompt, installed, ios, install } = usePwaInstall();
  const standalone = useStandaloneMode();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [busy, setBusy] = useState(false);

  if (installed || standalone || dismissed) return null;

  const close = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* storage blocked: dismiss for this session only */
    }
  };

  const runInstall = async () => {
    setBusy(true);
    try {
      const result = await install();
      if (result.outcome === 'accepted') close();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-x-0 bottom-[calc(var(--ion-safe-area-bottom,0px)+64px)] z-[1500] px-3">
      <div className="bg-white rounded-3xl border border-sky-100 shadow-lg p-4 flex items-center gap-3">
        <img src="/icons/icon-192.png" alt="" className="w-11 h-11 rounded-2xl shrink-0" />
        <div className="min-w-0 flex-1">
          <h4 className="text-[12px] font-bold text-slate-800">آریو را روی گوشی نصب کنید</h4>
          <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
            {ios ? 'در Safari: دکمه اشتراک‌گذاری، سپس «Add to Home Screen».' : 'بدون نوار مرورگر، سریع‌تر باز می‌شود.'}
          </p>
        </div>
        {ios ? (
          <Share className="w-4 h-4 text-sky-600 shrink-0" aria-hidden="true" />
        ) : (
          <button
            type="button"
            onClick={() => void runInstall()}
            disabled={busy || !canPrompt}
            className="shrink-0 flex items-center gap-1 text-[11px] font-bold text-white bg-sky-600 rounded-xl px-3 py-2 disabled:opacity-50 active:scale-95"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            نصب
          </button>
        )}
        <button type="button" onClick={close} aria-label="بستن" className="shrink-0 text-slate-400 p-1">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
