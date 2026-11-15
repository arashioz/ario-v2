import type {
  NormalizedPermissionState,
  PermissionKey,
  PermissionRecord,
} from '../../types/permissions';
import { PERMISSION_ERROR_MESSAGES } from '../../types/permissions';
import { PERMISSION_REGISTRY, PERMISSION_KEYS, permissionApiName } from './permissionRegistry';

type PermissionStatusLike = { state: string };
type PermissionsLike = { query: (descriptor: { name: string }) => Promise<PermissionStatusLike> };

const hasWindow = () => typeof window !== 'undefined';

/** The Permissions API is missing on older Safari/Firefox; every call guards for it. */
const permissionsApi = (): PermissionsLike | null => {
  if (!hasWindow()) return null;
  const api = (navigator as Navigator & { permissions?: PermissionsLike }).permissions;
  return api && typeof api.query === 'function' ? api : null;
};

const normalize = (state: string | undefined): NormalizedPermissionState => {
  if (state === 'granted' || state === 'denied' || state === 'prompt') return state;
  return 'unknown';
};

/** Query one permission. A query is never treated as a request. */
export async function queryPermission(key: PermissionKey): Promise<NormalizedPermissionState> {
  const name = permissionApiName(key);
  const api = permissionsApi();
  if (!name) {
    // Camera/microphone have no queryable name: their state is only known after getUserMedia.
    return 'unknown';
  }
  if (!api) return 'unknown';
  try {
    const status = await api.query({ name });
    return normalize(status.state);
  } catch {
    return 'unknown';
  }
}

export const isSecureContext = (): boolean => {
  if (!hasWindow()) return false;
  if (window.isSecureContext) return true;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1';
};

/** Full record for one permission: support, requestability and current state. */
export async function inspectPermission(key: PermissionKey): Promise<PermissionRecord> {
  const meta = PERMISSION_REGISTRY[key];
  const state = await queryPermission(key);
  return {
    key,
    state,
    supported: meta.mechanism !== 'none' || state !== 'unsupported',
    requestable: meta.mechanism !== 'none',
    mechanism: meta.mechanism,
    checkedAt: new Date().toISOString(),
    error: state === 'unsupported' ? PERMISSION_ERROR_MESSAGES[key] : undefined,
  };
}

/** Query every permission without prompting. Safe to call when a page mounts. */
export async function inspectAllPermissions(): Promise<PermissionRecord[]> {
  return Promise.all(PERMISSION_KEYS.map((key) => inspectPermission(key)));
}
