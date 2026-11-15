import type { PermissionKey, PermissionMeta } from '../../types/permissions';

/**
 * The single source of truth for what each permission needs.
 * `mechanism` is the real API used to *obtain* the permission; the Permissions API
 * is only ever used to *read* a state.
 */
export const PERMISSION_REGISTRY: Record<PermissionKey, PermissionMeta> = {
  geolocation: {
    key: 'geolocation',
    label: 'موقعیت مکانی',
    description: 'برای گذاشتن پین مشتری روی نقشه و مسیریابی',
    mechanism: 'geolocation-get-current-position',
    secureContextRequired: true,
  },
  notifications: {
    key: 'notifications',
    label: 'اعلان‌ها',
    description: 'برای یادآوری پیگیری و اعلان رویدادهای فروش',
    mechanism: 'notification-request-permission',
    secureContextRequired: true,
  },
  camera: {
    key: 'camera',
    label: 'دوربین',
    description: 'برای گرفتن عکس کالا یا اسکن بارکد',
    mechanism: 'get-user-media',
    secureContextRequired: true,
  },
  microphone: {
    key: 'microphone',
    label: 'میکروفون',
    description: 'برای ضبط یادداشت صوتی',
    mechanism: 'get-user-media',
    secureContextRequired: true,
  },
  'clipboard-read': {
    key: 'clipboard-read',
    label: 'خواندن کلیپ‌بورد',
    description: 'برای چسباندن متن کپی‌شده',
    mechanism: 'permissions-api',
    secureContextRequired: true,
  },
  'clipboard-write': {
    key: 'clipboard-write',
    label: 'نوشتن در کلیپ‌بورد',
    description: 'برای کپی شماره فاکتور و لینک کاتالوگ',
    mechanism: 'clipboard-write-in-tap',
    secureContextRequired: true,
  },
};

export const PERMISSION_KEYS = Object.keys(PERMISSION_REGISTRY) as PermissionKey[];

/** Map a normalized key to the Permissions API name, when one exists. */
export const permissionApiName = (key: PermissionKey): string | undefined => {
  switch (key) {
    case 'geolocation':
    case 'notifications':
    case 'clipboard-read':
    case 'clipboard-write':
      return key;
    // camera/microphone are not valid Permissions API names; only getUserMedia reveals them.
    case 'camera':
    case 'microphone':
      return undefined;
  }
};
