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

  const stopTracking = useCallback(() => {
    if (watchId.current !== null) stopWatching(watchId.current);
    watchId.current = null;
    setTracking(false);
  }, []);

  const startTracking = useCallback(
    (options?: LocationOptions) => {
      stopTracking();
      setError(null);
      const id = watchLocation(
        (next) => {
          setPoint(next);
          setError(null);
        },
        (err) => {
          setError(describeLocationError(err));
        },
        options,
      );
      watchId.current = id;
      setTracking(id !== null);
    },
    [stopTracking],
  );

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
