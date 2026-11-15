import { Capacitor } from '@capacitor/core';

/** True when the app runs inside the Android/iOS shell instead of a browser tab. */
export const isNative = (): boolean => Capacitor.isNativePlatform();

export type RuntimePlatform = 'android' | 'ios' | 'web';
export const runtimePlatform = (): RuntimePlatform => {
  const platform = Capacitor.getPlatform();
  return platform === 'android' || platform === 'ios' ? platform : 'web';
};
