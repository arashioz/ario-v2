import axios from 'axios';
import type { InternalAxiosRequestConfig } from 'axios';
import { askPassword, deleteTitle } from './confirmPassword';
import { pageActivity } from './pageActivity';

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
const requests = new WeakMap<InternalAxiosRequestConfig, () => void>();
const finishRequest = (config?: InternalAxiosRequestConfig) => {
  if (!config) return;
  requests.get(config)?.();
  requests.delete(config);
};

// Every deletion needs the user's password; the server rejects DELETE requests without it.
api.interceptors.request.use(async (config) => {
  const token = localStorage.getItem('ario_token');
  if (token && config.headers && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (config.method?.toLowerCase() === 'delete' && config.headers && !config.headers[CONFIRM_HEADER]) {
    const password = await askPassword(deleteTitle(config.url));
    config.headers[CONFIRM_HEADER] = encodeURIComponent(password);
  }
  requests.set(config, pageActivity.begin());
  return config;
});

api.interceptors.response.use(
  (response) => { finishRequest(response.config); return response; },
  async (error) => {
    const config = error.config as InternalAxiosRequestConfig | undefined;
    finishRequest(config);
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
