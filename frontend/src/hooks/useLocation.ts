import { useCallback, useEffect, useRef, useState } from 'react';
import {
  describeLocationError,
  getCurrentLocation,
  isLocationSupported,
  stopWatching,
  watchLocation,
  type GeoPoint,
  type LocationOptions,
} from '../services/location';
import { requestPermission } from '../services/permissions';
import type { NormalizedPermissionState } from '../types/permissions';

export interface UseLocationResult {
  supported: boolean;
  point: GeoPoint | null;
  error: string | null;
  loading: boolean;
  tracking: boolean;
  /** Ask for a fix. Must be called from a tap. */
  locate: (options?: LocationOptions) => Promise<GeoPoint | null>;
  /** Start continuous tracking. Must be called from a tap. */
  startTracking: (options?: LocationOptions) => void;
  stopTracking: () => void;
}

/**
 * Location for one screen. Nothing runs on mount: the browser prompt only appears
 * after the user taps `locate` or `startTracking`. Tracking stops on unmount.
 */
export function useLocation(): UseLocationResult {
  const [point, setPoint] = useState<GeoPoint | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tracking, setTracking] = useState(false);
  const watchId = useRef<number | null>(null);
  // Remembers the intent so a backgrounded watch can resume itself on return,
  // and so an explicit stopTracking never auto-resumes.
  const wantTracking = useRef(false);
  const trackingOptions = useRef<LocationOptions | undefined>(undefined);

  const onPosition = useCallback((next: GeoPoint) => {
    setPoint(next);
    setError(null);
  }, []);

  const onPositionError = useCallback((err: unknown) => {
    setError(describeLocationError(err));
  }, []);

  const locate = useCallback(async (options?: LocationOptions) => {
    setLoading(true);
    setError(null);
    try {
      const next = await getCurrentLocation(options);
      setPoint(next);
      return next;
    } catch (err) {
      setError(describeLocationError(err));
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const startWatch = useCallback(() => {
    if (watchId.current !== null) stopWatching(watchId.current);
    const id = watchLocation(onPosition, onPositionError, trackingOptions.current);
    watchId.current = id;
    setTracking(id !== null);
  }, [onPosition, onPositionError]);

  const stopTracking = useCallback(() => {
    wantTracking.current = false;
    if (watchId.current !== null) stopWatching(watchId.current);
    watchId.current = null;
    setTracking(false);
  }, []);

  const startTracking = useCallback(
    (options?: LocationOptions) => {
      wantTracking.current = true;
      trackingOptions.current = options;
      setError(null);
      startWatch();
    },
    [startWatch],
  );

  // Stop the GPS watch while the tab is hidden (Android/iOS PWAs throttle or revoke
  // background location) and resume the same watch when it becomes visible again.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handleVisibility = () => {
      if (document.hidden) {
        if (watchId.current !== null) {
          stopWatching(watchId.current);
          watchId.current = null;
          setTracking(false);
        }
      } else if (wantTracking.current) {
        startWatch();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [startWatch]);

  useEffect(() => () => stopTracking(), [stopTracking]);

  return {
    supported: isLocationSupported(),
    point,
    error,
    loading,
    tracking,
    locate,
    startTracking,
    stopTracking,
  };
}

/** Keeps `requestPermission` reachable for screens that only need the prompt. */
export const requestLocationAccess = (): Promise<NormalizedPermissionState> =>
  requestPermission('geolocation').then((result) => result.state);
