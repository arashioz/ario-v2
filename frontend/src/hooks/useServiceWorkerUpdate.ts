import { useCallback, useEffect, useState } from 'react';
import {
  applyServiceWorkerUpdate,
  getServiceWorkerState,
  registerServiceWorker,
  subscribeServiceWorker,
  type ServiceWorkerState,
} from '../services/pwa';

export interface UseServiceWorkerUpdateResult extends ServiceWorkerState {
  updateAvailable: boolean;
  /** Activates the waiting worker and reloads. Call only from the user's button press. */
  applyUpdate: () => void;
}

/** Registers the worker (production web only) and reports when a new build is waiting. */
export function useServiceWorkerUpdate(): UseServiceWorkerUpdateResult {
  const [state, setState] = useState<ServiceWorkerState>(getServiceWorkerState());

  useEffect(() => {
    const unsubscribe = subscribeServiceWorker(setState);
    void registerServiceWorker();
    return unsubscribe;
  }, []);

  const applyUpdate = useCallback(() => applyServiceWorkerUpdate(), []);

  return { ...state, updateAvailable: state.waiting !== null, applyUpdate };
}
