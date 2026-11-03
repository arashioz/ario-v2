import axios from 'axios';
import type { InternalAxiosRequestConfig } from 'axios';
import { askPassword, deleteTitle } from './confirmPassword';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';
const CONFIRM_HEADER = 'X-Confirm-Password';
export const AUTH_EXPIRED_EVENT = 'ario:auth-expired';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});
// Every deletion needs the user's password; the server rejects DELETE requests without it.
api.interceptors.request.use(async (config) => {
  const token = localStorage.getItem('ario_token');
  if (token && config.headers && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const method = config.method?.toLowerCase();
  const path = String(config.url || '').split('?')[0];
  const needsPassword =
    method === 'delete' || (method === 'put' && /\/?invoices\/[^/]+$/.test(path));
  if (needsPassword && config.headers && !config.headers[CONFIRM_HEADER]) {
    const password = await askPassword(deleteTitle(config.url));
    config.headers[CONFIRM_HEADER] = encodeURIComponent(password);
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config as InternalAxiosRequestConfig | undefined;
    const code = error.response?.data?.code;
    if (config?.headers && error.response?.status === 403 && (code === 'PASSWORD_INVALID' || code === 'PASSWORD_REQUIRED')) {
      const password = await askPassword(deleteTitle(config.url), error.response.data.message);
      config.headers[CONFIRM_HEADER] = encodeURIComponent(password);
      return api(config);
    }
    if (error.response?.status === 401) {
      // A late response from an old session must not log out a newer login.
      const currentToken = localStorage.getItem('ario_token');
      if (currentToken && config?.headers?.Authorization === `Bearer ${currentToken}`) {
        localStorage.removeItem('ario_token');
        localStorage.removeItem('ario_user');
        localStorage.removeItem('ario_verified_token');
        window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
      }
    }
    return Promise.reject(error);
  }
);
