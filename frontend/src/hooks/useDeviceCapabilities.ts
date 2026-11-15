import { useMemo } from 'react';
import type { CapabilityInfo, DeviceEnvironment } from '../types/capabilities';
import { detectAllCapabilities, detectEnvironment } from '../services/capabilities';

/** Snapshot of capability support. Detection only: never requests a permission. */
export function useDeviceCapabilities(): { capabilities: CapabilityInfo[]; environment: DeviceEnvironment } {
  return useMemo(
    () => ({ capabilities: detectAllCapabilities(), environment: detectEnvironment() }),
    [],
  );
}
