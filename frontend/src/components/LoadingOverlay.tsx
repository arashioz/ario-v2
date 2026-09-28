import React from 'react';

interface LoadingOverlayProps {
  isOpen: boolean;
  message?: string;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  isOpen,
  message = 'در حال پردازش...',
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm select-none animate-fadeIn">
      <div className="bg-white/95 backdrop-blur-md rounded-3xl p-6 shadow-2xl flex flex-col items-center max-w-xs w-full mx-6 border border-sky-100">
        <div className="relative w-14 h-14 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full border-4 border-sky-100" />
          <div className="absolute inset-0 rounded-full border-4 border-sky-500 border-t-transparent animate-spin" />
          <img src="/ario-logo.svg" alt="Ario" className="w-6 h-6 animate-pulse" />
        </div>
        <p className="mt-4 text-sm font-semibold text-slate-700 text-center">{message}</p>
        <span className="text-[11px] text-slate-400 mt-1">لطفاً چند لحظه صبر کنید</span>
      </div>
    </div>
  );
};
