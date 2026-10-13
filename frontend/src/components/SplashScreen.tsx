import React from 'react';
import { createPortal } from 'react-dom';

/** A body-level overlay stays visible above Ionic outlets and their cached pages. */
export const SplashScreen: React.FC<{ message?: string }> = ({ message = 'در حال آماده‌سازی صفحه…' }) =>
  createPortal(
    <div className="app-splash" role="status" aria-live="polite" aria-busy="true" dir="rtl">
      <div className="app-splash-brand"><span className="app-splash-orbit" aria-hidden="true" /><strong>آریو</strong></div>
      <span className="app-splash-spinner" aria-hidden="true" />
      <p>{message}</p>
    </div>,
    document.body,
  );
