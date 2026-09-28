import React, { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

export const OfflineBanner: React.FC = () => {
  const [offline, setOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      className="fixed top-0 inset-x-0 z-[2000] flex justify-center pointer-events-none"
      style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 6px)' }}
    >
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-800 text-white text-[11px] font-bold shadow-lg">
        <WifiOff className="w-3.5 h-3.5" />
        <span>آفلاین — آخرین اطلاعات ذخیره‌شده نمایش داده می‌شود</span>
      </div>
    </div>
  );
};
