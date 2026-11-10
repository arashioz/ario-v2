import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

/**
 * Native permission prompts (Android/iOS via Capacitor) must be triggered in the
 * same tap, before any `await`. Web clipboard does not need a prompt.
 */

/** Clipboard needs no runtime permission in the native shell or the browser tap. */
export function requestCopyPermission() {
  /* no-op: copy runs inside the user tap */
}

/** Ask the OS for location. Call synchronously at the start of the location tap. */
export function requestLocationPermission(): Promise<void> | void {
  if (!Capacitor.isNativePlatform()) return;
  return Geolocation.requestPermissions().then(() => undefined, () => undefined);
}

function legacyCopy(text: string) {
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '0';
    area.style.left = '0';
    area.style.opacity = '0';
    area.style.fontSize = '16px';
    document.body.appendChild(area);
    area.focus();
    area.select();
    area.setSelectionRange(0, area.value.length);
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

export async function copyText(text: string): Promise<boolean> {
  requestCopyPermission();
  if (legacyCopy(text)) return true;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* the system dialog was dismissed */
  }
  return false;
}

export async function requestAppPermissions() {
  if (typeof window === 'undefined') return;
  requestCopyPermission();
}
