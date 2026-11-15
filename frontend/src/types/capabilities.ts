/** Every device capability the application audits. Support is never assumed. */
export type CapabilityKey =
  | 'geolocation'
  | 'clipboard'
  | 'camera'
  | 'microphone'
  | 'file-system-access'
  | 'file-upload'
  | 'file-download'
  | 'web-share'
  | 'share-target'
  | 'notifications'
  | 'push'
  | 'vibration'
  | 'fullscreen'
  | 'wake-lock'
  | 'bluetooth'
  | 'nfc'
  | 'serial'
  | 'usb'
  | 'device-orientation'
  | 'device-motion'
  | 'network-information'
  | 'online-status'
  | 'storage'
  | 'indexed-db'
  | 'background-sync'
  | 'web-worker'
  | 'websocket'
  | 'broadcast-channel'
  | 'badging'
  | 'contacts';

export type CapabilityGroup = 'device' | 'media' | 'files' | 'network' | 'platform';

export interface CapabilityInfo {
  key: CapabilityKey;
  label: string;
  group: CapabilityGroup;
  supported: boolean;
  /** The browser shows a permission prompt before the capability can be used. */
  permissionRequired: boolean;
  /** Only available on HTTPS (or localhost). */
  secureContextRequired: boolean;
  /** Partial support or a platform restriction worth showing to the user. */
  note?: string;
}

export interface DeviceEnvironment {
  browser: string;
  platform: string;
  userAgent: string;
  language: string;
  secureContext: boolean;
  standalone: boolean;
  native: boolean;
  online: boolean;
}
