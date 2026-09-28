import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../services/api';

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
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('ario_user');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return null;
      }
    }
    return null;
  });
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('ario_token'));
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const checkAuth = async () => {
    const storedToken = localStorage.getItem('ario_token');
    if (!storedToken) {
      setIsLoading(false);
      return;
    }

    try {
      const res = await api.get('/auth/profile');
      setUser(res.data);
      localStorage.setItem('ario_user', JSON.stringify(res.data));
    } catch {
      localStorage.removeItem('ario_token');
      localStorage.removeItem('ario_user');
      setUser(null);
      setToken(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const login = async (username: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await api.post('/auth/login', { username, password });
      const { access_token, user: loggedUser } = res.data;
      localStorage.setItem('ario_token', access_token);
      localStorage.setItem('ario_user', JSON.stringify(loggedUser));
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
    setToken(null);
    setUser(null);
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
