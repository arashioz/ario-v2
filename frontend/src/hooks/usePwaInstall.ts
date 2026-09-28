import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

// Captured at module load: the event may fire before any component mounts.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e as BeforeInstallPromptEvent;
  listeners.forEach((l) => l());
});

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as unknown as { standalone?: boolean }).standalone === true;

export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

export function usePwaInstall() {
  const [canPrompt, setCanPrompt] = useState(!!deferredPrompt);

  useEffect(() => {
    const update = () => setCanPrompt(!!deferredPrompt);
    listeners.add(update);
    return () => {
      listeners.delete(update);
    };
  }, []);

  const install = async (): Promise<boolean> => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    setCanPrompt(false);
    return outcome === 'accepted';
  };

  return { canPrompt, install, installed: isStandalone(), ios: isIos() };
}
