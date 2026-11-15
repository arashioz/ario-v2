/**
 * Compatibility shim for existing callers. New code should import from
 * `services/clipboard` or `services/permissions` directly.
 * Nothing here requests a permission on its own; every call must come from a user tap.
 */
import { copyToClipboard } from '../services/clipboard';
import { requestPermission } from '../services/permissions';

/** Clipboard writes need no separate prompt; kept so existing call sites compile. */
export function requestCopyPermission() {
  /* no-op: copy runs inside the user tap */
}

/** Ask for location from a tap. The dialog appears only when called inside a gesture. */
export function requestLocationPermission(): Promise<void> {
  return requestPermission('geolocation').then(() => undefined);
}

export async function copyText(text: string): Promise<boolean> {
  const result = await copyToClipboard(text);
  return result.ok;
}
