import type { CapabilityKey, CapabilityGroup } from '../../types/capabilities';

export interface CapabilityDefinition {
  key: CapabilityKey;
  label: string;
  group: CapabilityGroup;
  /** The browser shows a permission prompt before it can be used. */
  permissionRequired: boolean;
  /** Only works on HTTPS (or localhost). */
  secureContextRequired: boolean;
  /** Platform or support caveat shown next to the capability. */
  note?: string;
}

export const CAPABILITY_DEFINITIONS: CapabilityDefinition[] = [
  { key: 'geolocation', label: 'موقعیت مکانی', group: 'device', permissionRequired: true, secureContextRequired: true, note: 'روی iOS فقط HTTPS و پس از لمس کاربر' },
  { key: 'clipboard', label: 'کلیپ‌بورد', group: 'platform', permissionRequired: false, secureContextRequired: true },
  { key: 'camera', label: 'دوربین', group: 'media', permissionRequired: true, secureContextRequired: true },
  { key: 'microphone', label: 'میکروفون', group: 'media', permissionRequired: true, secureContextRequired: true },
  { key: 'file-system-access', label: 'دسترسی مستقیم به فایل‌ها', group: 'files', permissionRequired: true, secureContextRequired: true, note: 'فقط Chromium' },
  { key: 'file-upload', label: 'بارگذاری فایل', group: 'files', permissionRequired: false, secureContextRequired: false },
  { key: 'file-download', label: 'دانلود فایل', group: 'files', permissionRequired: false, secureContextRequired: false },
  { key: 'web-share', label: 'اشتراک‌گذاری سیستم', group: 'platform', permissionRequired: false, secureContextRequired: true, note: 'فایرفاکس دسکتاپ ندارد' },
  { key: 'share-target', label: 'دریافت اشتراک‌گذاری', group: 'platform', permissionRequired: false, secureContextRequired: true, note: 'بدون Service Worker کار نمی‌کند' },
  { key: 'notifications', label: 'اعلان‌ها', group: 'platform', permissionRequired: true, secureContextRequired: true, note: 'روی iOS فقط برای اپ نصب‌شده' },
  { key: 'push', label: 'Push', group: 'platform', permissionRequired: true, secureContextRequired: true },
  { key: 'vibration', label: 'لرزش', group: 'device', permissionRequired: false, secureContextRequired: false, note: 'iOS ندارد' },
  { key: 'fullscreen', label: 'تمام‌صفحه', group: 'device', permissionRequired: false, secureContextRequired: false, note: 'iPhone Safari ندارد' },
  { key: 'wake-lock', label: 'روشن نگه‌داشتن صفحه', group: 'device', permissionRequired: false, secureContextRequired: true },
  { key: 'bluetooth', label: 'بلوتوث', group: 'device', permissionRequired: true, secureContextRequired: true, note: 'Safari ندارد' },
  { key: 'nfc', label: 'NFC', group: 'device', permissionRequired: true, secureContextRequired: true, note: 'فقط اندروید کروم' },
  { key: 'serial', label: 'پورت سریال', group: 'device', permissionRequired: true, secureContextRequired: true, note: 'فقط Chromium دسکتاپ' },
  { key: 'usb', label: 'USB', group: 'device', permissionRequired: true, secureContextRequired: true, note: 'Safari ندارد' },
  { key: 'device-orientation', label: 'جهت دستگاه', group: 'device', permissionRequired: true, secureContextRequired: true, note: 'iOS اجازه جدا می‌خواهد' },
  { key: 'device-motion', label: 'حرکت دستگاه', group: 'device', permissionRequired: true, secureContextRequired: true, note: 'iOS اجازه جدا می‌خواهد' },
  { key: 'network-information', label: 'اطلاعات شبکه', group: 'network', permissionRequired: false, secureContextRequired: false, note: 'Safari ندارد' },
  { key: 'online-status', label: 'وضعیت آنلاین', group: 'network', permissionRequired: false, secureContextRequired: false },
  { key: 'storage', label: 'حافظه محلی', group: 'platform', permissionRequired: false, secureContextRequired: false },
  { key: 'indexed-db', label: 'IndexedDB', group: 'platform', permissionRequired: false, secureContextRequired: false },
  { key: 'background-sync', label: 'همگام‌سازی پس‌زمینه', group: 'network', permissionRequired: false, secureContextRequired: true, note: 'Safari ندارد' },
  { key: 'web-worker', label: 'Web Worker', group: 'platform', permissionRequired: false, secureContextRequired: false },
  { key: 'websocket', label: 'WebSocket', group: 'network', permissionRequired: false, secureContextRequired: false },
  { key: 'broadcast-channel', label: 'BroadcastChannel', group: 'platform', permissionRequired: false, secureContextRequired: false },
  { key: 'badging', label: 'نشان تعداد', group: 'platform', permissionRequired: false, secureContextRequired: true, note: 'iOS ندارد' },
  { key: 'contacts', label: 'انتخاب مخاطب', group: 'platform', permissionRequired: true, secureContextRequired: true, note: 'فقط اندروید کروم' },
];

export const CAPABILITY_KEYS: CapabilityKey[] = CAPABILITY_DEFINITIONS.map((item) => item.key);
