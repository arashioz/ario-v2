import { useCallback, useEffect, useReducer } from 'react';
import { PERMISSION_KEYS, inspectPermission, requestPermission } from '../services/permissions';
import type {
  PermissionKey,
  PermissionRecord,
  PermissionRequestResult,
} from '../types/permissions';

type Records = Partial<Record<PermissionKey, PermissionRecord>>;

interface State {
  records: Records;
  loading: boolean;
  last: PermissionRequestResult | null;
}

type Action =
  | { type: 'loading' }
  | { type: 'loaded'; records: Records }
  | { type: 'requested'; result: PermissionRequestResult }
  | { type: 'refreshed'; record: PermissionRecord };

const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case 'loading':
      return { ...state, loading: true };
    case 'loaded':
      return { records: action.records, loading: false, last: state.last };
    case 'requested':
      return { ...state, last: action.result };
    case 'refreshed':
      return { ...state, records: { ...state.records, [action.record.key]: action.record } };
  }
};

/**
 * Every permission in one hook. Mounting only queries states; asking for access is
 * always an explicit `request(key)` call from a click handler.
 */
export function usePermissions() {
  const [state, dispatch] = useReducer(reducer, { records: {}, loading: true, last: null });

  const refresh = useCallback(async () => {
    dispatch({ type: 'loading' });
    const records: Records = {};
    for (const key of PERMISSION_KEYS) {
      records[key] = await inspectPermission(key);
    }
    dispatch({ type: 'loaded', records });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const request = useCallback(async (key: PermissionKey) => {
    const result = await requestPermission(key);
    dispatch({ type: 'requested', result });
    dispatch({ type: 'refreshed', record: await inspectPermission(key) });
    return result;
  }, []);

  return { ...state, keys: PERMISSION_KEYS, refresh, request };
}

