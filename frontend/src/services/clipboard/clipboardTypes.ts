/** Outcome of a clipboard operation, with a Persian message ready for the UI. */
export type ClipboardErrorCode = 'unsupported' | 'denied' | 'insecure-context' | 'empty' | 'failed';

export interface ClipboardResult {
  ok: boolean;
  text?: string;
  code?: ClipboardErrorCode;
  message?: string;
}

export const CLIPBOARD_MESSAGES: Record<ClipboardErrorCode, string> = {
  unsupported: 'این مرورگر به کلیپ‌بورد دسترسی ندارد.',
  denied: 'اجازه کلیپ‌بورد داده نشد. با دکمه دوباره امتحان کنید.',
  'insecure-context': 'کلیپ‌بورد فقط روی HTTPS یا localhost کار می‌کند.',
  empty: 'کلیپ‌بورد خالی است.',
  failed: 'کپی انجام نشد. متن را دستی انتخاب کنید.',
};

export const clipboardWriteSupported = (): boolean =>
  typeof navigator !== 'undefined' && !!navigator.clipboard?.writeText;

export const clipboardReadSupported = (): boolean =>
  typeof navigator !== 'undefined' && !!navigator.clipboard?.readText;

/**
 * Legacy fallback for browsers without the async Clipboard API (older Safari, Firefox
 * with the API disabled). Runs synchronously inside the tap so `execCommand` is allowed.
 */
export const legacyCopy = (text: string): boolean => {
  if (typeof document === 'undefined') return false;
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
};

/**
 * Legacy paste is not offered: `execCommand('paste')` is blocked in current browsers,
 * so reading only goes through `navigator.clipboard.readText`.
 */
