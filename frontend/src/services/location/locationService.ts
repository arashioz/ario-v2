import { Geolocation } from '@capacitor/geolocation';
import { isNative } from '../device/platform';
import {
  assertLocationUsable,
  DEFAULT_LOCATION_OPTIONS,
  fromBrowserError,
  fromBrowserPosition,
  fromNativeError,
  fromNativePosition,
  LOCATION_MESSAGES,
  LocationError,
  type GeoPoint,
  type LocationOptions,
} from './locationTypes';

const withDefaults = (options?: LocationOptions): Required<LocationOptions> => ({
  ...DEFAULT_LOCATION_OPTIONS,
  ...options,
});

/**
 * One positioning fix. Requires a user gesture on first use, because the browser
 * only shows the Allow dialog inside a tap.
 */
export async function getCurrentLocation(options?: LocationOptions): Promise<GeoPoint> {
  const opts = withDefaults(options);
  assertLocationUsable();

  if (isNative()) {
    try {
      return fromNativePosition(await Geolocation.getCurrentPosition(opts));
    } catch (error) {
      throw fromNativeError(error);
    }
  }

  return new Promise<GeoPoint>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(fromBrowserPosition(pos)),
      (error) => reject(fromBrowserError(error)),
      opts,
    );
  });
}

/**
 * Continuous tracking. Returns the watch id used by `stopWatching`.
 * The permission prompt appears on the first position callback when this runs in a tap.
 */
export function watchLocation(
  onUpdate: (point: GeoPoint) => void,
  onError: (error: LocationError) => void,
  options?: LocationOptions,
): number | null {
  const opts = withDefaults(options);
  try {
    assertLocationUsable();
  } catch (error) {
    onError(error instanceof LocationError ? error : new LocationError('unknown', LOCATION_MESSAGES.unknown));
    return null;
  }

  if (isNative()) {
    let id: string | null = null;
    let cancelled = false;
    void Geolocation.watchPosition(opts, (position, error) => {
      if (cancelled) return;
      if (error) {
        onError(fromNativeError(error));
        return;
      }
      if (position) onUpdate(fromNativePosition(position));
    }).then((watchId) => {
      if (cancelled) void Geolocation.clearWatch({ id: watchId });
      else id = watchId;
    });
    return watchIds.register(() => {
      cancelled = true;
      if (id) void Geolocation.clearWatch({ id });
    });
  }

  const browserId = navigator.geolocation.watchPosition(
    (pos) => onUpdate(fromBrowserPosition(pos)),
    (error) => onError(fromBrowserError(error)),
    opts,
  );
  return watchIds.register(() => navigator.geolocation.clearWatch(browserId));
}

/** Local registry so `stopWatching` also works while native ids resolve asynchronously. */
const watchIds = (() => {
  let last = 0;
  const stops = new Map<number, () => void>();
  return {
    register(stop: () => void): number {
      last += 1;
      stops.set(last, stop);
      return last;
    },
    stop(id?: number): void {
      const targets = id === undefined ? [...stops.keys()] : [id];
      for (const target of targets) {
        stops.get(target)?.();
        stops.delete(target);
      }
    },
  };
})();

/** Stops one watch id, or every running watch when called without an argument. */
export function stopWatching(id?: number): void {
  watchIds.stop(id);
}

