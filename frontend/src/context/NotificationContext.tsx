import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface AppNotification {
  id: string;
  title: string;
  message?: string;
  type: NotificationType;
  duration?: number;
}

interface NotificationContextType {
  showNotification: (notif: Omit<AppNotification, 'id'>) => void;
  notifications: AppNotification[];
  dismissNotification: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const showNotification = useCallback(
    ({ title, message, type = 'info', duration = 3500 }: Omit<AppNotification, 'id'>) => {
      const id = Math.random().toString(36).substring(2, 9);
      const newNotif: AppNotification = { id, title, message, type, duration };

      setNotifications((prev) => [newNotif, ...prev.slice(0, 2)]);

      if (duration > 0) {
        setTimeout(() => {
          dismissNotification(id);
        }, duration);
      }
    },
    [dismissNotification]
  );

  return (
    <NotificationContext.Provider value={{ showNotification, notifications, dismissNotification }}>
      {children}

      {/* Floating In-App Notifications Toast Container */}
      <div className="fixed top-4 inset-x-0 z-[50000] flex flex-col items-center pointer-events-none px-4 gap-2">
        {notifications.map((notif) => (
          <div
            key={notif.id}
            className={`pointer-events-auto w-full max-w-sm rounded-2xl p-3.5 shadow-xl border backdrop-blur-md transition-all duration-300 animate-slide-down flex items-start gap-3 ${
              notif.type === 'success'
                ? 'bg-emerald-50/95 border-emerald-200 text-emerald-950'
                : notif.type === 'error'
                ? 'bg-rose-50/95 border-rose-200 text-rose-950'
                : notif.type === 'warning'
                ? 'bg-amber-50/95 border-amber-200 text-amber-950'
                : 'bg-sky-50/95 border-sky-200 text-sky-950'
            }`}
          >
            <div className="mt-0.5 flex-shrink-0">
              {notif.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
              {notif.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-600" />}
              {notif.type === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-600" />}
              {notif.type === 'info' && <Info className="w-5 h-5 text-sky-600" />}
            </div>

            <div className="flex-1 text-right">
              <h4 className="text-sm font-bold leading-5">{notif.title}</h4>
              {notif.message && (
                <p className="text-xs mt-0.5 opacity-90 leading-relaxed font-normal">{notif.message}</p>
              )}
            </div>

            <button
              onClick={() => dismissNotification(notif.id)}
              className="p-1 rounded-full text-slate-400 hover:text-slate-600 transition"
              aria-label="بستن"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  );
};

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};
