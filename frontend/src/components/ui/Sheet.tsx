import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface SheetProps {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/** Plain bottom sheet (centered dialog on wide screens). */
export const Sheet: React.FC<SheetProps> = ({ open, title, subtitle, onClose, children, footer }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // The sheet is portaled outside any open IonModal, whose focus trap would otherwise steal focus
  // back from the sheet's inputs (so e.g. the delete password could never be typed).
  useEffect(() => {
    if (!open) return;
    const trapped = Array.from(document.querySelectorAll('ion-modal, ion-popover')).filter(
      (el) => !el.classList.contains('ion-disable-focus-trap'),
    );
    trapped.forEach((el) => el.classList.add('ion-disable-focus-trap'));
    return () => trapped.forEach((el) => el.classList.remove('ion-disable-focus-trap'));
  }, [open]);

  if (!open) return null;

  // Portal + z above Ionic overlays (20000+), so it also works when opened from an IonModal.
  return createPortal(
    <div className="fixed inset-0 z-[40000] flex items-end sm:items-center justify-center" dir="rtl">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div
        className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl max-h-[92vh] flex flex-col animate-slide-up"
        style={{ paddingBottom: 'var(--safe-bottom)' }}
      >
        <div className="flex items-center justify-between px-4 pt-3 pb-2.5 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-bold text-slate-800">{title}</h2>
            {subtitle && <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full text-slate-400 hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-4 py-3 space-y-3">{children}</div>
        {footer && <div className="px-4 py-3 border-t border-slate-100">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
};
