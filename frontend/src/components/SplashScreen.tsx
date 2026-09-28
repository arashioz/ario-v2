import React, { useEffect, useState } from 'react';

interface SplashScreenProps {
  onFinish: () => void;
  duration?: number;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onFinish, duration = 700 }) => {
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFading(true), duration - 250);
    const finishTimer = setTimeout(onFinish, duration);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(finishTimer);
    };
  }, [duration, onFinish]);

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center gap-[18px] bg-slate-50 transition-opacity duration-200 ${
        fading ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      <img
        src="/icons/icon-192.png"
        alt="آریو"
        className="w-[84px] h-[84px] rounded-[21px] shadow-[0_12px_30px_-10px_rgba(2,132,199,.45)]"
      />
      <div className="w-[22px] h-[22px] rounded-full border-[2.5px] border-sky-200 border-t-sky-600 animate-spin" />
    </div>
  );
};
