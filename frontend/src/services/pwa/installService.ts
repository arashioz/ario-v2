import { isIOS } from '../capabilities';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type Listener = () => void;

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installedFlag = false;
const listeners = new Set<Listener>();

const publish = () => listeners.forEach((listener) => listener());

const hasWindow = () => typeof window !== 'undefined';

/** Captured at module load: the event can fire before any component mounts. */
if (hasWindow()) {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    publish();
  });
  window.addEventListener('appinstalled', () => {
    installedFlag = true;
    deferredPrompt = null;
    publish();
  });
}

export const isStandalone = (): boolean =>
  hasWindow() &&
  (window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true);

export const isInstalled = (): boolean => installedFlag || isStandalone();

export interface InstallResult {
  outcome: 'accepted' | 'dismissed' | 'unavailable';
  message: string;
}

/**
 * Shows the saved install prompt. The browser only allows `prompt()` inside a user
 * gesture, so this must run from a click handler.
 */
export async function promptInstall(): Promise<InstallResult> {
  if (isInstalled()) {
    return { outcome: 'accepted', message: 'آریو از قبل روی این دستگاه نصب شده است.' };
  }
  if (!deferredPrompt) {
    return {
      outcome: 'unavailable',
      message: isIOS()
        ? 'در Safari دکمه اشتراک‌گذاری را بزنید و «Add to Home Screen» را انتخاب کنید.'
        : 'از منوی مرورگر گزینه «نصب برنامه» یا «Add to Home screen» را بزنید.',
    };
  }
  const prompt = deferredPrompt;
  await prompt.prompt();
  const { outcome } = await prompt.userChoice;
  // A prompt event is single-use whatever the outcome.
  deferredPrompt = null;
  publish();
  if (outcome === 'accepted') {
    return { outcome, message: 'آریو نصب شد.' };
  }
  return { outcome: 'dismissed', message: 'نصب انجام نشد.' };
}

export const canPromptInstall = (): boolean => !!deferredPrompt && !isInstalled();

export const isIosDevice = (): boolean => isIOS();

export function subscribeInstall(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
