import { Geolocation } from '@capacitor/geolocation';
import { isNative } from '../device/platform';
import { isSecureContext } from '../permissions';

/** A single positioning fix, normalized across the browser and the native shell. */
export interface GeoPoint {
  lat: number;
  lng: number;
  accuracy: number | null;
  altitude: number | null;
  heading: number | null;
  speed: number | null;
  timestamp: number;
}

export type LocationErrorCode =
  | 'unsupported'
  | 'insecure-context'
  | 'denied'
  | 'unavailable'
  | 'timeout'
  | 'unknown';

export class LocationError extends Error {
  readonly code: LocationErrorCode;

  constructor(code: LocationErrorCode, message: string) {
    super(message);
    this.name = 'LocationError';
    this.code = code;
  }
}

export interface LocationOptions {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
}

export const DEFAULT_LOCATION_OPTIONS: Required<LocationOptions> = {
  enableHighAccuracy: true,
  timeout: 20000,
  maximumAge: 0,
};

export const LOCATION_MESSAGES: Record<LocationErrorCode, string> = {
  unsupported: 'این دستگاه موقعیت‌یابی ندارد. پین را روی نقشه بگذارید.',
  'insecure-context': 'موقعیت‌یابی فقط روی HTTPS یا localhost کار می‌کند.',
  denied: 'دسترسی به موقعیت مکانی رد شده. از تنظیمات مرورگر یا گوشی اجازه بدهید.',
  unavailable: 'موقعیت پیدا نشد. GPS یا اینترنت را بررسی کنید.',
  timeout: 'زمان گرفتن موقعیت تمام شد. دوباره تلاش کنید.',
  unknown: 'موقعیت خوانده نشد. دوباره تلاش کنید.',
};

/** True when the browser exposes geolocation, or when running inside the native shell. */
export const isLocationSupported = (): boolean =>
  isNative() || (typeof navigator !== 'undefined' && 'geolocation' in navigator);

/** Throws before any API call so the UI can explain why location is unavailable. */
export const assertLocationUsable = (): void => {
  if (isNative()) return;
  if (!isLocationSupported()) throw new LocationError('unsupported', LOCATION_MESSAGES.unsupported);
  if (!isSecureContext()) throw new LocationError('insecure-context', LOCATION_MESSAGES['insecure-context']);
};

export const fromBrowserPosition = (pos: GeolocationPosition): GeoPoint => ({
  lat: pos.coords.latitude,
  lng: pos.coords.longitude,
  accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
  altitude: pos.coords.altitude ?? null,
  heading: pos.coords.heading ?? null,
  speed: pos.coords.speed ?? null,
  timestamp: pos.timestamp || Date.now(),
});

type NativePosition = Awaited<ReturnType<typeof Geolocation.getCurrentPosition>>;

export const fromNativePosition = (pos: NativePosition): GeoPoint => ({
  lat: pos.coords.latitude,
  lng: pos.coords.longitude,
  accuracy: pos.coords.accuracy ?? null,
  altitude: pos.coords.altitude ?? null,
  heading: pos.coords.heading ?? null,
  speed: pos.coords.speed ?? null,
  timestamp: pos.timestamp || Date.now(),
});

export const fromBrowserError = (error: GeolocationPositionError): LocationError => {
  if (error.code === error.PERMISSION_DENIED) return new LocationError('denied', LOCATION_MESSAGES.denied);
  if (error.code === error.POSITION_UNAVAILABLE) return new LocationError('unavailable', LOCATION_MESSAGES.unavailable);
  if (error.code === error.TIMEOUT) return new LocationError('timeout', LOCATION_MESSAGES.timeout);
  return new LocationError('unknown', LOCATION_MESSAGES.unknown);
};

export const fromNativeError = (error: unknown): LocationError => {
  const message = error instanceof Error ? error.message : '';
  if (/denied|permission|not authorized/i.test(message)) return new LocationError('denied', LOCATION_MESSAGES.denied);
  if (/timeout/i.test(message)) return new LocationError('timeout', LOCATION_MESSAGES.timeout);
  return new LocationError('unknown', LOCATION_MESSAGES.unknown);
};

/** Persian text safe to show in a notification, whatever was thrown. */
export const describeLocationError = (error: unknown): string =>
  error instanceof LocationError
    ? error.message
    : error instanceof Error && error.message
      ? error.message
      : LOCATION_MESSAGES.unknown;

