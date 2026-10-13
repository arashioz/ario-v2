import { api } from './api';

export const currentOwner = () => {
  try { return JSON.parse(localStorage.getItem('ario_user') || 'null')?.id as string | undefined; }
  catch { return undefined; }
};
export const isConnectionError = (error: unknown) => {
  const e = error as { response?: { status?: number }; code?: string };
  return !e.response && e.code !== 'ERR_CANCELED' || [502, 503, 504].includes(e.response?.status || 0);
};
export async function cachedGet<T>(url: string): Promise<T> {
  const owner = currentOwner();
  const key = `ario-cache:${owner}:${url}`;
  const read = (): T | undefined => {
    try { const text = localStorage.getItem(key); return text ? JSON.parse(text).data as T : undefined; }
    catch { return undefined; }
  };
  if (!navigator.onLine && owner) {
    const cached = read();
    if (cached !== undefined) return cached;
  }
  try {
    const { data } = await api.get<T>(url);
    if (owner && currentOwner() === owner) {
      try { localStorage.setItem(key, JSON.stringify({ data, savedAt: new Date().toISOString() })); } catch { /* Orders have priority over cache space. */ }
    }
    return data;
  } catch (error) {
    if (owner && currentOwner() === owner && isConnectionError(error)) {
      const cached = read();
      if (cached !== undefined) return cached;
    }
    throw error;
  }
}
