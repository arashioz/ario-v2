import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface SheetProps {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Opt-in: fill the visible height instead of hugging the content. */
  tall?: boolean;
}

/** The box the user can actually see. Unlike 100vh it follows the on-screen keyboard and the
 *  browser chrome, which is what keeps the sheet header (and its close button) on screen in a
 *  plain browser tab — a standalone install reports the full screen anyway. */
type Viewport = { top: number; height: number; keyboard: boolean };

const measureViewport = (tallest: number): Viewport => {
  if (typeof window === 'undefined') return { top: 0, height: 0, keyboard: false };
  const vv = window.visualViewport;
  const height = Math.round(vv ? vv.height : window.innerHeight);
  // iOS keeps the layout viewport full height while the keyboard covers part of it, so the
  // uncovered height is the tallest of what we have ever seen and the window height itself.
  const full = Math.max(tallest, window.innerHeight || 0, height);
  return {
    top: Math.round(vv ? vv.offsetTop : 0),
    height,
    keyboard: full - height > 100,
  };
};

const useViewport = (active: boolean): Viewport => {
  const tallest = useRef(0);
  const [vp, setVp] = useState<Viewport>(() => measureViewport(0));

  useEffect(() => {
    if (!active) return;
    tallest.current = Math.max(
      typeof window === 'undefined' ? 0 : window.innerHeight,
      window.visualViewport?.height || 0,
    );
    const sync = () => {
      const next = measureViewport(tallest.current);
      tallest.current = Math.max(tallest.current, next.height);
      setVp(next);
    };
    sync();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', sync);
    vv?.addEventListener('scroll', sync);
    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);
    return () => {
      vv?.removeEventListener('resize', sync);
      vv?.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
      window.removeEventListener('orientationchange', sync);
    };
  }, [active]);

  return vp;
};

/** Plain bottom sheet (centered dialog on wide screens). */
export const Sheet: React.FC<SheetProps> = ({ open, title, subtitle, onClose, children, footer, tall = false }) => {
  const vp = useViewport(open);

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
    <div
      className="fixed inset-x-0 z-[40000] flex items-end sm:items-center justify-center"
      dir="rtl"
      style={{ top: vp.top, height: vp.height || undefined }}
    >
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div
        className={`relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl flex flex-col overflow-hidden animate-slide-up ${
          tall ? 'h-full sm:h-auto sm:max-h-[86vh]' : 'max-h-full'
        }`}
        style={{ paddingBottom: vp.keyboard ? '8px' : 'var(--tabbar-offset)' }}
      >
        {/* Header stays fixed while the body scrolls, so the ✕ is always reachable. */}
        <div className="flex items-start justify-between gap-2 px-4 pt-3 pb-2.5 border-b border-slate-100 shrink-0">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-800 leading-6">{title}</h2>
            {subtitle && <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="بستن"
            className="shrink-0 -mr-1 p-1.5 rounded-full text-slate-400 hover:bg-slate-100 active:scale-95 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-4 py-3 space-y-2.5">{children}</div>
        {footer && <div className="px-4 py-3 border-t border-slate-100 shrink-0">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
};
