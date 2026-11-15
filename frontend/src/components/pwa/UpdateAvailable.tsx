import React from 'react';
import { RefreshCw } from 'lucide-react';
import { useServiceWorkerUpdate } from '../../hooks/useServiceWorkerUpdate';

/** Shown only when a new build is waiting. Applying it reloads the app. */
export const UpdateAvailable: React.FC = () => {
  const { updateAvailable, applyUpdate } = useServiceWorkerUpdate();

  if (!updateAvailable) return null;

  return (
    <div className="fixed top-[calc(env(safe-area-inset-top,0px)+6px)] inset-x-0 z-[1900] flex justify-center px-3 pointer-events-none">
      <button
        type="button"
        onClick={applyUpdate}
        className="pointer-events-auto flex items-center gap-2 rounded-full bg-sky-700 px-4 py-2 text-[11px] font-bold text-white shadow-lg active:scale-95"
      >
        <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
        نسخه جدید آماده است — به‌روزرسانی
      </button>
    </div>
  );
};
