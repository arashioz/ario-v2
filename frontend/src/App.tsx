import React, { useState } from 'react';
import { IonApp } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { SplashScreen } from './components/SplashScreen';
import { Login } from './pages/Login';
import { TabsLayout } from './pages/TabsLayout';
import { OfflineBanner } from './components/OfflineBanner';
import { CatalogPage } from './pages/CatalogPage';
import { DeletePasswordPrompt } from './components/ui/DeletePasswordPrompt';

const isPublicPath = (path: string) => path === '/catalog' || path.startsWith('/catalog/');

const AppRoutes: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const { pathname } = useLocation();

  if (isPublicPath(pathname)) return <CatalogPage />;

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-sky-200 border-t-sky-500 rounded-full animate-spin" />
          <span className="text-xs text-slate-500 font-semibold">در حال بارگذاری اطلاعات...</span>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/tabs/home" replace /> : <Login />}
      />
      <Route path="/*" element={isAuthenticated ? <TabsLayout /> : <Navigate to="/login" replace />} />
    </Routes>
  );
};

const AppContent: React.FC = () => {
  const [showSplash, setShowSplash] = useState(() => !isPublicPath(window.location.pathname));

  if (showSplash) {
    return <SplashScreen onFinish={() => setShowSplash(false)} />;
  }

  return (
    <IonReactRouter>
      <OfflineBanner />
      <AppRoutes />
      <DeletePasswordPrompt />
    </IonReactRouter>
  );
};

export const App: React.FC = () => {
  return (
    <IonApp>
      <NotificationProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </NotificationProvider>
    </IonApp>
  );
};

export default App;
