import type { CapabilityKey } from '../../types/capabilities';
import { isNative } from '../device/platform';

const hasWindow = () => typeof window !== 'undefined';
const hasNavigator = () => typeof navigator !== 'undefined';

/**
 * Presence checks only. Nothing here requests a permission, and nothing here
 * reports support for an API the browser merely mentions but cannot use.
 */
export const CAPABILITY_SUPPORT: Record<CapabilityKey, () => boolean> = {
  geolocation: () => isNative() || (hasNavigator() && 'geolocation' in navigator),
  clipboard: () => hasNavigator() && !!navigator.clipboard,
  camera: () => hasNavigator() && !!navigator.mediaDevices?.getUserMedia,
  microphone: () => hasNavigator() && !!navigator.mediaDevices?.getUserMedia,
  'file-system-access': () => hasWindow() && 'showOpenFilePicker' in window,
  'file-upload': () => hasWindow() && typeof window.File === 'function',
  'file-download': () => hasWindow() && typeof URL.createObjectURL === 'function' && 'download' in document.createElement('a'),
  'web-share': () => hasNavigator() && typeof navigator.share === 'function',
  'share-target': () => hasNavigator() && 'serviceWorker' in navigator && 'share' in navigator,
  notifications: () => hasWindow() && 'Notification' in window,
  push: () => hasWindow() && 'PushManager' in window && 'serviceWorker' in navigator,
  vibration: () => hasNavigator() && typeof navigator.vibrate === 'function',
  fullscreen: () => hasWindow() && 'requestFullscreen' in document.documentElement,
  'wake-lock': () => hasNavigator() && 'wakeLock' in navigator,
  bluetooth: () => hasNavigator() && 'bluetooth' in navigator,
  nfc: () => hasWindow() && 'NDEFReader' in window,
  serial: () => hasNavigator() && 'serial' in navigator,
  usb: () => hasNavigator() && 'usb' in navigator,
  'device-orientation': () => hasWindow() && 'DeviceOrientationEvent' in window,
  'device-motion': () => hasWindow() && 'DeviceMotionEvent' in window,
  'network-information': () => hasNavigator() && 'connection' in navigator,
  'online-status': () => hasNavigator() && 'onLine' in navigator,
  storage: () => {
    try {
      return hasWindow() && !!window.localStorage;
    } catch {
      return false;
    }
  },
  'indexed-db': () => hasWindow() && 'indexedDB' in window,
  'background-sync': () => hasWindow() && 'SyncManager' in window && 'serviceWorker' in navigator,
  'web-worker': () => hasWindow() && 'Worker' in window,
  websocket: () => hasWindow() && 'WebSocket' in window,
  'broadcast-channel': () => hasWindow() && 'BroadcastChannel' in window,
  badging: () => hasNavigator() && 'setAppBadge' in navigator,
  contacts: () => hasWindow() && 'ContactsManager' in window,
};
