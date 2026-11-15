import { isSecureContext } from '../permissions';
import {
  CLIPBOARD_MESSAGES,
  clipboardReadSupported,
  clipboardWriteSupported,
  legacyCopy,
  type ClipboardResult,
} from './clipboardTypes';

const denied = (name: string): boolean =>
  name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError';

const errorName = (error: unknown): string =>
  typeof error === 'object' && error ? (error as { name?: string }).name ?? '' : '';

/**
 * Copy text. Call this straight from a click handler: the legacy fallback needs the
 * transient activation, and some browsers tie the async API to it as well.
 */
export async function copyToClipboard(text: string): Promise<ClipboardResult> {
  if (!text) return { ok: false, code: 'empty', message: 'متنی برای کپی وجود ندارد.' };

  // Try the legacy path first inside the tap: it never shows a permission prompt.
  if (legacyCopy(text)) return { ok: true, text };

  if (!isSecureContext()) {
    return { ok: false, code: 'insecure-context', message: CLIPBOARD_MESSAGES['insecure-context'] };
  }
  if (!clipboardWriteSupported()) {
    return { ok: false, code: 'unsupported', message: CLIPBOARD_MESSAGES.unsupported };
  }
  try {
    await navigator.clipboard.writeText(text);
    return { ok: true, text };
  } catch (error) {
    const name = errorName(error);
    return {
      ok: false,
      code: denied(name) ? 'denied' : 'failed',
      message: denied(name) ? CLIPBOARD_MESSAGES.denied : CLIPBOARD_MESSAGES.failed,
    };
  }
}

/** Read the clipboard. Requires the async API, a secure context and a user gesture. */
export async function readFromClipboard(): Promise<ClipboardResult> {
  if (!isSecureContext()) {
    return { ok: false, code: 'insecure-context', message: CLIPBOARD_MESSAGES['insecure-context'] };
  }
  if (!clipboardReadSupported()) {
    return { ok: false, code: 'unsupported', message: 'خواندن کلیپ‌بورد در این مرورگر پشتیبانی نمی‌شود.' };
  }
  try {
    const text = await navigator.clipboard.readText();
    if (!text) return { ok: false, code: 'empty', message: CLIPBOARD_MESSAGES.empty };
    return { ok: true, text };
  } catch (error) {
    const name = errorName(error);
    return {
      ok: false,
      code: denied(name) ? 'denied' : 'failed',
      message: denied(name) ? CLIPBOARD_MESSAGES.denied : CLIPBOARD_MESSAGES.failed,
    };
  }
}

/** Copy the current page URL, minus any hash, so the catalog link stays clean. */
export async function copyCurrentUrl(): Promise<ClipboardResult> {
  if (typeof window === 'undefined') return { ok: false, code: 'unsupported', message: CLIPBOARD_MESSAGES.unsupported };
  const { origin, pathname, search } = window.location;
  return copyToClipboard(`${origin}${pathname}${search}`);
}

export const clipboardService = {
  copy: copyToClipboard,
  read: readFromClipboard,
  copyUrl: copyCurrentUrl,
  isWriteSupported: clipboardWriteSupported,
  isReadSupported: clipboardReadSupported,
};
