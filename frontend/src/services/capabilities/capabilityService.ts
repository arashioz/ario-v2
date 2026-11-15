import type { CapabilityInfo, CapabilityKey, DeviceEnvironment } from '../../types/capabilities';
import { isNative, runtimePlatform } from '../device/platform';
import { CAPABILITY_DEFINITIONS } from './capabilityDefinitions';
import { CAPABILITY_SUPPORT } from './capabilitySupport';

const hasWindow = () => typeof window !== 'undefined';
const hasNavigator = () => typeof navigator !== 'undefined';

export const isSecureContext = (): boolean => {
  if (!hasWindow()) return false;
  if (window.isSecureContext) return true;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1';
};

/** Detect one capability without ever asking for a permission. */
export const detectCapability = (key: CapabilityKey): CapabilityInfo => {
  const definition = CAPABILITY_DEFINITIONS.find((item) => item.key === key);
  let supported = false;
  try {
    supported = CAPABILITY_SUPPORT[key]();
  } catch {
    // A browser that throws on feature detection does not support the feature.
    supported = false;
  }
  if (!definition) {
    return { key, label: key, group: 'platform', supported, permissionRequired: false, secureContextRequired: false };
  }
  if (supported && definition.secureContextRequired && !isSecureContext()) supported = false;
  return {
    key: definition.key,
    label: definition.label,
    group: definition.group,
    supported,
    permissionRequired: definition.permissionRequired,
    secureContextRequired: definition.secureContextRequired,
    note: definition.note,
  };
};

export const detectAllCapabilities = (): CapabilityInfo[] =>
  CAPABILITY_DEFINITIONS.map((item) => detectCapability(item.key));

/** Browser and platform facts for the settings page. */
export const detectEnvironment = (): DeviceEnvironment => {
  const ua = hasNavigator() ? navigator.userAgent : '';
  const isIos = /iphone|ipad|ipod/i.test(ua);
  const isAndroid = /android/i.test(ua);
  const browser = /edg\//i.test(ua)
    ? 'Edge'
    : /opr\//i.test(ua)
      ? 'Opera'
      : /firefox/i.test(ua)
        ? 'Firefox'
        : /chrome|crios/i.test(ua)
          ? 'Chrome'
          : /safari/i.test(ua)
            ? 'Safari'
            : 'نامشخص';
  const platform = isIos
    ? 'iOS'
    : isAndroid
      ? 'Android'
      : /mac/i.test(ua)
        ? 'macOS'
        : /win/i.test(ua)
          ? 'Windows'
          : /linux/i.test(ua)
            ? 'Linux'
            : runtimePlatform();
  const standalone =
    hasWindow() &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true);
  return {
    browser,
    platform,
    userAgent: ua,
    language: hasNavigator() ? navigator.language : 'fa',
    secureContext: isSecureContext(),
    standalone,
    native: isNative(),
    online: hasNavigator() ? navigator.onLine : true,
  };
};

export const isIOS = (): boolean => /iphone|ipad|ipod/i.test(hasNavigator() ? navigator.userAgent : '');
