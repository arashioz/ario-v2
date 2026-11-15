import type { PermissionKey, PermissionRequestResult } from '../../types/permissions';
import { PERMISSION_ERROR_MESSAGES, PERMISSION_STATE_LABELS } from '../../types/permissions';
import { PERMISSION_REGISTRY } from './permissionRegistry';
import { isSecureContext } from './permissionManager';

const unsupported = (key: PermissionKey, message: string): PermissionRequestResult => ({
  key,
  state: 'unsupported',
  granted: false,
  message,
});

const describeError = (name: string): string | undefined => {
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'سخت‌افزار مناسب روی این دستگاه پیدا نشد.';
  if (name === 'NotReadableError') return 'سخت‌افزار در اختیار برنامه دیگری است.';
  if (name === 'OverconstrainedError') return 'دوربین یا میکروفون با تنظیمات درخواستی سازگار نیست.';
  return undefined;
};

/** Maps any thrown browser error to a normalized, Persian result. */
const fromError = (key: PermissionKey, error: unknown): PermissionRequestResult => {
  const name = typeof error === 'object' && error ? (error as { name?: string }).name ?? '' : '';
  const denied = name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError';
  return {
    key,
    state: denied ? 'denied' : 'unknown',
    granted: false,
    message: denied ? PERMISSION_ERROR_MESSAGES[key] : describeError(name) ?? PERMISSION_ERROR_MESSAGES[key],
  };
};

const requestGeolocation = (): Promise<PermissionRequestResult> =>
  new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(unsupported('geolocation', 'این مرورگر موقعیت‌یابی ندارد.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => resolve({ key: 'geolocation', state: 'granted', granted: true, message: 'دسترسی به موقعیت مکانی داده شد.' }),
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          resolve({ key: 'geolocation', state: 'denied', granted: false, message: PERMISSION_ERROR_MESSAGES.geolocation });
          return;
        }
        // Permission may be granted while the fix failed (no GPS signal, timeout).
        resolve({
          key: 'geolocation',
          state: 'unknown',
          granted: false,
          message:
            error.code === error.POSITION_UNAVAILABLE
              ? 'موقعیت پیدا نشد. GPS یا اینترنت را بررسی کنید.'
              : 'زمان گرفتن موقعیت تمام شد. دوباره تلاش کنید.',
        });
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 },
    );
  });

const requestNotifications = async (): Promise<PermissionRequestResult> => {
  if (typeof Notification === 'undefined') return unsupported('notifications', 'این مرورگر اعلان ندارد.');
  const result = await Notification.requestPermission();
  const state = result === 'granted' || result === 'denied' ? result : 'prompt';
  return {
    key: 'notifications',
    state,
    granted: state === 'granted',
    message:
      state === 'granted'
        ? 'اعلان‌ها فعال شد.'
        : `${PERMISSION_STATE_LABELS[state]}. ${PERMISSION_ERROR_MESSAGES.notifications}`,
  };
};

const requestMedia = async (key: 'camera' | 'microphone'): Promise<PermissionRequestResult> => {
  if (!navigator.mediaDevices?.getUserMedia) {
    return unsupported(key, 'این مرورگر دسترسی به دوربین/میکروفون ندارد.');
  }
  const stream = await navigator.mediaDevices.getUserMedia(key === 'camera' ? { video: true } : { audio: true });
  // The user only grants access here; release the hardware immediately.
  stream.getTracks().forEach((track) => track.stop());
  return { key, state: 'granted', granted: true, message: 'دسترسی داده شد.' };
};

const requestClipboardRead = async (): Promise<PermissionRequestResult> => {
  if (!navigator.clipboard?.readText) {
    return unsupported('clipboard-read', 'خواندن کلیپ‌بورد در این مرورگر پشتیبانی نمی‌شود.');
  }
  await navigator.clipboard.readText();
  return { key: 'clipboard-read', state: 'granted', granted: true, message: 'خواندن کلیپ‌بورد آزاد شد.' };
};

/**
 * Ask the browser for one permission through its real mechanism.
 * MUST be called synchronously from a click/tap handler: browsers tie the prompt to the
 * user gesture and silently ignore it otherwise. Never call this on page mount.
 */
export async function requestPermission(key: PermissionKey): Promise<PermissionRequestResult> {
  if (PERMISSION_REGISTRY[key].secureContextRequired && !isSecureContext()) {
    return unsupported(key, 'این قابلیت فقط روی HTTPS یا localhost کار می‌کند.');
  }
  try {
    switch (key) {
      case 'geolocation':
        return await requestGeolocation();
      case 'notifications':
        return await requestNotifications();
      case 'camera':
      case 'microphone':
        return await requestMedia(key);
      case 'clipboard-read':
        return await requestClipboardRead();
      case 'clipboard-write':
        // Writing needs no prompt; the write itself runs inside the tap (see clipboardService).
        return { key, state: 'granted', granted: true, message: 'نوشتن در کلیپ‌بورد آزاد است.' };
    }
  } catch (error) {
    return fromError(key, error);
  }
}
