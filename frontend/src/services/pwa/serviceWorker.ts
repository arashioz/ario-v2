export const SW_URL = '/sw.js';

/** Browser-only: the native shell loads assets from the bundle, not from a service worker. */
export const canRegisterServiceWorker = (): boolean =>
  import.meta.env.PROD &&
  typeof navigator !== 'undefined' &&
  'serviceWorker' in navigator &&
  typeof window !== 'undefined' &&
  window.isSecureContext;

export interface ServiceWorkerState {
  supported: boolean;
  registered: boolean;
  controlled: boolean;
  waiting: ServiceWorker | null;
  error: string | null;
}

type Listener = (state: ServiceWorkerState) => void;

let registration: ServiceWorkerRegistration | null = null;
let state: ServiceWorkerState = {
  supported: false,
  registered: false,
  controlled: false,
  waiting: null,
  error: null,
};
const listeners = new Set<Listener>();

const publish = (patch: Partial<ServiceWorkerState>) => {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener(state));
};

const trackWaiting = (reg: ServiceWorkerRegistration) => {
  if (reg.waiting) publish({ waiting: reg.waiting });
  reg.addEventListener('updatefound', () => {
    const installing = reg.installing;
    if (!installing) return;
    installing.addEventListener('statechange', () => {
      // `installed` with an existing controller means an update is ready, not a first install.
      if (installing.state === 'installed' && navigator.serviceWorker.controller) {
        publish({ waiting: reg.waiting ?? installing });
      }
    });
  });
};

/** Registers the worker once. Safe to call repeatedly. */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!canRegisterServiceWorker()) {
    publish({ supported: false });
    return null;
  }
  if (registration) return registration;
  publish({ supported: true });
  try {
    registration = await navigator.serviceWorker.register(SW_URL, { scope: '/' });
    trackWaiting(registration);
    publish({ registered: true, controlled: !!navigator.serviceWorker.controller, error: null });
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      publish({ controlled: true });
    });
    // Check for updates on focus; the update is applied only when the user confirms.
    window.addEventListener('focus', () => {
      void registration?.update();
    });
    return registration;
  } catch (error) {
    publish({ error: error instanceof Error ? error.message : 'ثبت سرویس‌ورکر انجام نشد.' });
    return null;
  }
}

/** Activates a waiting worker. Call only from a user action such as the update button. */
export function applyServiceWorkerUpdate(): void {
  const waiting = state.waiting ?? registration?.waiting ?? null;
  if (!waiting) return;
  waiting.postMessage({ type: 'SKIP_WAITING' });
  publish({ waiting: null });
  // Reload after the new worker takes control so the app runs the new bundle.
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
}

export const getServiceWorkerState = (): ServiceWorkerState => state;

export function subscribeServiceWorker(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Removes stale caches created by old versions. Keep the list in sync with sw.js. */
export const CACHE_PREFIX = 'ario-';
