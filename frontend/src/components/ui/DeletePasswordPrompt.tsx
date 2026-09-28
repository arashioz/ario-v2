import React, { useEffect, useRef, useState } from 'react';
import { Lock } from 'lucide-react';
import { Sheet } from './Sheet';
import { cancelledError, registerPasswordPrompt } from '../../services/confirmPassword';
import type { PasswordRequest } from '../../services/confirmPassword';

/** Mounted once at the app root; every DELETE request waits for the password typed here. */
export const DeletePasswordPrompt: React.FC = () => {
  const [req, setReq] = useState<PasswordRequest | null>(null);
  const [password, setPassword] = useState('');
  const reqRef = useRef<PasswordRequest | null>(null);

  useEffect(
    () =>
      registerPasswordPrompt((next) => {
        reqRef.current?.reject(cancelledError());
        reqRef.current = next;
        setPassword('');
        setReq(next);
      }),
    [],
  );

  const close = (value?: string) => {
    const current = reqRef.current;
    reqRef.current = null;
    setReq(null);
    setPassword('');
    if (!current) return;
    if (value) current.resolve(value);
    else current.reject(cancelledError());
  };

  return (
    <Sheet
      open={!!req}
      onClose={() => close()}
      title={req?.title ?? 'تأیید حذف'}
      subtitle="هیچ حذفی بدون رمز انجام نمی‌شود و در گزارش رویدادها ثبت می‌شود"
      footer={
        <div className="flex gap-2">
          <button onClick={() => close()} className="flex-1 py-3 rounded-2xl bg-slate-100 text-slate-700 text-sm font-bold">
            انصراف
          </button>
          <button
            onClick={() => close(password)}
            disabled={!password}
            className="flex-[2] py-3 rounded-2xl bg-rose-600 text-white text-sm font-bold disabled:opacity-40 active:scale-[0.98] transition"
          >
            تأیید و حذف
          </button>
        </div>
      }
    >
      {req?.error && <div className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-100 rounded-2xl p-3">{req.error}</div>}
      <div>
        <label className="text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
          <Lock className="w-3.5 h-3.5 text-rose-500" />
          رمز عبور حساب خود را وارد کنید
        </label>
        <input
          type="password"
          value={password}
          autoFocus
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && password && close(password)}
          className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-sm focus:outline-none focus:border-rose-400"
          dir="ltr"
          autoComplete="current-password"
        />
      </div>
    </Sheet>
  );
};
