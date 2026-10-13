import React, { lazy, Suspense } from 'react';
import { IonApp } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { Login } from './pages/Login';
import { TabsLayout } from './pages/TabsLayout';
import { OfflineBanner } from './components/OfflineBanner';
import { PageLoader, PageLoadBoundary } from './components/PageLoader';
import { OfflineOrderSync } from './components/OfflineOrderSync';
import { NavigationSplash } from './components/NavigationSplash';
import { SplashScreen } from './components/SplashScreen';
const CatalogPage = lazy(() => import('./pages/CatalogPage').then((m) => ({ default: m.CatalogPage })));
import { DeletePasswordPrompt } from './components/ui/DeletePasswordPrompt';

const isPublicPath = (path: string) => path === '/catalog' || path.startsWith('/catalog/');

const AppRoutes: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const { pathname } = useLocation();

  if (isPublicPath(pathname)) return <PageLoadBoundary><Suspense fallback={<PageLoader />}><CatalogPage /></Suspense></PageLoadBoundary>;

  if (isLoading) {
    return <SplashScreen message="در حال بررسی ورود…" />;
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
  return (
    <IonReactRouter>
      <OfflineBanner />
      <AppRoutes />
      <NavigationSplash />
      <OfflineOrderSync />
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
