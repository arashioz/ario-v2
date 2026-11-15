import { useCallback, useEffect, useState } from 'react';
import {
  canPromptInstall,
  isInstalled,
  isIosDevice,
  isStandalone,
  promptInstall,
  subscribeInstall,
  type InstallResult,
} from '../services/pwa';

export interface UsePWAInstallResult {
  /** A saved browser prompt can be shown right now (Chromium Android / desktop). */
  canPrompt: boolean;
  /** The app is already installed or running standalone. */
  installed: boolean;
  /** Current device is iOS Safari, which needs manual instructions. */
  ios: boolean;
  /** Call from a click handler. */
  install: () => Promise<InstallResult>;
}

/** Install availability, synced with the global `beforeinstallprompt` capture. */
export function usePwaInstall(): UsePWAInstallResult {
  const [canPrompt, setCanPrompt] = useState(canPromptInstall);

  useEffect(() => subscribeInstall(() => setCanPrompt(canPromptInstall())), []);

  const install = useCallback(async () => {
    const result = await promptInstall();
    setCanPrompt(canPromptInstall());
    return result;
  }, []);

  return { canPrompt, installed: isInstalled(), ios: isIosDevice(), install };
}

export { isStandalone };

