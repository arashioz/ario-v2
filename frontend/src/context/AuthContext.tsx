import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, AUTH_EXPIRED_EVENT } from '../services/api';
import { isConnectionError } from '../services/offlineCache';

export interface User {
  id: string;
  username: string;
  fullName: string;
  role: 'admin' | 'marketer';
  phoneNumber?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Restore a saved session only after the server confirms it.
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const checkAuth = async () => {
    const storedToken = localStorage.getItem('ario_token');
    if (!storedToken) {
      localStorage.removeItem('ario_user');
      setUser(null);
      setToken(null);
      setIsLoading(false);
      return;
    }

    try {
      const res = await api.get('/auth/profile');
      if (localStorage.getItem('ario_token') !== storedToken) return;
      setUser(res.data);
      setToken(storedToken);
      localStorage.setItem('ario_user', JSON.stringify(res.data));
      localStorage.setItem('ario_verified_token', storedToken);
    } catch (error) {
      if (localStorage.getItem('ario_token') !== storedToken) return;
      // Offline access is limited to a previously verified, unexpired session.
      // Reconnection still goes through server authentication before any write.
      if (isConnectionError(error)) {
        try {
          const claims = JSON.parse(atob(storedToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
          const saved = JSON.parse(localStorage.getItem('ario_user') || 'null');
          if (claims.exp * 1000 > Date.now() && saved?.id === claims.sub && localStorage.getItem('ario_verified_token') === storedToken) {
            setUser(saved); setToken(storedToken); return;
          }
        } catch { /* A malformed or expired session cannot unlock offline mode. */ }
      }
      localStorage.removeItem('ario_token');
      localStorage.removeItem('ario_user');
      localStorage.removeItem('ario_verified_token');
      setUser(null);
      setToken(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const onExpired = () => {
      setUser(null);
      setToken(null);
      setIsLoading(false);
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    checkAuth();
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, []);

  const login = async (username: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await api.post('/auth/login', { username, password });
      const { access_token, user: loggedUser } = res.data;
      localStorage.setItem('ario_token', access_token);
      localStorage.setItem('ario_user', JSON.stringify(loggedUser));
      localStorage.setItem('ario_verified_token', access_token);
      setToken(access_token);
      setUser(loggedUser);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    // Fire-and-forget so the logout is recorded in the audit log; the token is dropped regardless.
    const current = localStorage.getItem('ario_token');
    if (current) api.post('/auth/logout', null, { headers: { Authorization: `Bearer ${current}` } }).catch(() => undefined);
    localStorage.removeItem('ario_token');
    localStorage.removeItem('ario_user');
    localStorage.removeItem('ario_verified_token');
    setToken(null);
    setUser(null);
    setIsLoading(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token && !!user,
        isLoading,
        login,
        logout,
        checkAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
