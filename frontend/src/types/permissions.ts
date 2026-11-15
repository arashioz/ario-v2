/**
 * Normalized permission states, shared by every browser and by the native shell.
 * `unsupported` means the browser has no API for it at all; `unknown` means the API
 * exists but cannot report a state (Firefox clipboard, Safari < 17, etc.).
 */
export type NormalizedPermissionState =
  | 'granted'
  | 'denied'
  | 'prompt'
  | 'unsupported'
  | 'unknown';

/** Permissions this application may ask for. Kept small on purpose. */
export type PermissionKey =
  | 'geolocation'
  | 'notifications'
  | 'camera'
  | 'microphone'
  | 'clipboard-read'
  | 'clipboard-write';

/**
 * Each permission has exactly one real request mechanism. The Permissions API can
 * *query* a state, it can never *obtain* access.
 */
export type PermissionRequestMechanism =
  | 'permissions-api'
  | 'geolocation-get-current-position'
  | 'notification-request-permission'
  | 'get-user-media'
  | 'clipboard-write-in-tap'
  | 'none';

export interface PermissionMeta {
  key: PermissionKey;
  label: string;
  description: string;
  mechanism: PermissionRequestMechanism;
  /** Needs HTTPS (or localhost) to work at all. */
  secureContextRequired: boolean;
}

export interface PermissionRecord {
  key: PermissionKey;
  state: NormalizedPermissionState;
  /** The browser exposes an API for this permission at all. */
  supported: boolean;
  /** The app can trigger a prompt when called inside a user gesture. */
  requestable: boolean;
  mechanism: PermissionRequestMechanism;
  checkedAt: string;
  error?: string;
}

export interface PermissionRequestResult {
  key: PermissionKey;
  state: NormalizedPermissionState;
  granted: boolean;
  message: string;
}

export const PERMISSION_STATE_LABELS: Record<NormalizedPermissionState, string> = {
  granted: 'اجازه داده شده',
  denied: 'رد شده',
  prompt: 'باید اجازه بدهید',
  unsupported: 'پشتیبانی نمی‌شود',
  unknown: 'نامشخص',
};

/** Persian, actionable message for each failure mode. */
export const PERMISSION_ERROR_MESSAGES: Record<PermissionKey, string> = {
  geolocation: 'دسترسی به موقعیت مکانی داده نشد. از تنظیمات مرورگر یا گوشی اجازه بدهید.',
  notifications: 'اجازه نمایش اعلان داده نشد. از تنظیمات مرورگر یا گوشی اجازه بدهید.',
  camera: 'دسترسی به دوربین داده نشد. از تنظیمات مرورگر یا گوشی اجازه بدهید.',
  microphone: 'دسترسی به میکروفون داده نشد. از تنظیمات مرورگر یا گوشی اجازه بدهید.',
  'clipboard-read': 'خواندن کلیپ‌بورد اجازه داده نشد. با دکمه «چسباندن» دوباره امتحان کنید.',
  'clipboard-write': 'نوشتن در کلیپ‌بورد اجازه داده نشد.',
};
