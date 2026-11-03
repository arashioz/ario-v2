import React, { lazy, Suspense, useEffect } from 'react';
import { IonTabs, IonRouterOutlet, IonTabBar, IonTabButton, IonIcon, IonLabel } from '@ionic/react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { homeOutline, peopleOutline, cartOutline, receiptOutline, menuOutline } from 'ionicons/icons';
import { PageLoader, PageLoadBoundary } from '../components/PageLoader';

const HomeTab = lazy(() => import('./tabs/HomeTab').then((m) => ({ default: m.HomeTab })));
const CustomersTab = lazy(() => import('./tabs/CustomersTab').then((m) => ({ default: m.CustomersTab })));
const PosTab = lazy(() => import('./tabs/PosTab').then((m) => ({ default: m.PosTab })));
const InvoicesTab = lazy(() => import('./tabs/InvoicesTab').then((m) => ({ default: m.InvoicesTab })));
const MoreTab = lazy(() => import('./tabs/MoreTab').then((m) => ({ default: m.MoreTab })));
const ProductsPage = lazy(() => import('./ProductsPage').then((m) => ({ default: m.ProductsPage })));
const WorkshopPage = lazy(() => import('./WorkshopPage').then((m) => ({ default: m.WorkshopPage })));
const CustomersMapPage = lazy(() => import('./CustomersMapPage').then((m) => ({ default: m.CustomersMapPage })));
const ChequesPage = lazy(() => import('./ChequesPage').then((m) => ({ default: m.ChequesPage })));
const ExpensesPage = lazy(() => import('./ExpensesPage').then((m) => ({ default: m.ExpensesPage })));
const FollowUpsPage = lazy(() => import('./FollowUpsPage').then((m) => ({ default: m.FollowUpsPage })));
const InventoryPage = lazy(() => import('./InventoryPage').then((m) => ({ default: m.InventoryPage })));
const StocktakePage = lazy(() => import('./StocktakePage').then((m) => ({ default: m.StocktakePage })));
const ProfitPage = lazy(() => import('./ProfitPage').then((m) => ({ default: m.ProfitPage })));
const SalesModulePage = lazy(() => import('./SalesModulePage').then((m) => ({ default: m.SalesModulePage })));
const SalesProductPage = lazy(() => import('./SalesProductPage').then((m) => ({ default: m.SalesProductPage })));
const CreditReportPage = lazy(() => import('./CreditReportPage').then((m) => ({ default: m.CreditReportPage })));
const InflationPage = lazy(() => import('./InflationPage').then((m) => ({ default: m.InflationPage })));
const SupplierAccountPage = lazy(() => import('./SupplierAccountPage').then((m) => ({ default: m.SupplierAccountPage })));
const ProformasPage = lazy(() => import('./ProformasPage').then((m) => ({ default: m.ProformasPage })));
const SuppliersPage = lazy(() => import('./SuppliersPage').then((m) => ({ default: m.SuppliersPage })));
const SettingsPage = lazy(() => import('./SettingsPage').then((m) => ({ default: m.SettingsPage })));
const PriceChartPage = lazy(() => import('./PriceChartPage').then((m) => ({ default: m.PriceChartPage })));
const LogsPage = lazy(() => import('./LogsPage').then((m) => ({ default: m.LogsPage })));
const UsersPage = lazy(() => import('./UsersPage').then((m) => ({ default: m.UsersPage })));
const CashboxPage = lazy(() => import('./CashboxPage').then((m) => ({ default: m.CashboxPage })));
const HomeLayoutPage = lazy(() => import('./HomeLayoutPage').then((m) => ({ default: m.HomeLayoutPage })));
const SalesTargetPage = lazy(() => import('./SalesTargetPage').then((m) => ({ default: m.SalesTargetPage })));
const MarketingPage = lazy(() => import('./MarketingPage').then((m) => ({ default: m.MarketingPage })));
const WatchPage = lazy(() => import('./WatchPage').then((m) => ({ default: m.WatchPage })));

const TABS = [
  { tab: 'home', href: '/tabs/home', label: 'خانه', icon: homeOutline },
  { tab: 'customers', href: '/tabs/customers', label: 'مشتریان', icon: peopleOutline },
  { tab: 'pos', href: '/tabs/pos', label: 'فروش', icon: cartOutline },
  { tab: 'invoices', href: '/tabs/invoices', label: 'فاکتورها', icon: receiptOutline },
  { tab: 'more', href: '/tabs/more', label: 'بیشتر', icon: menuOutline },
];

// Ionic reads Routes directly from the outlet. Loading boundaries belong inside
// each route element, otherwise the outlet cannot discover any of its pages.
const loadPage = (page: React.ReactNode) => (
  <PageLoadBoundary>
    <Suspense fallback={<PageLoader />}>{page}</Suspense>
  </PageLoadBoundary>
);

/**
 * Safety net for a white screen: Ionic keeps a page element hidden
 * (`ion-page-invisible`) until its enter transition runs. Whenever a second element
 * mounts for the same navigation — the error boundary replacing a crashed page, or a
 * re-render that React remounts — Ionic can see a repeated transition, skip it, and
 * leave that element hidden with nothing else visible in the outlet. This reveals the
 * newest page, but only when no page is visible at all, so a healthy transition
 * (where the leaving page is still on screen) is never touched.
 */
const useRevealStuckPage = () => {
  const location = useLocation();

  useEffect(() => {
    const outlet = document.querySelector('ion-router-outlet');
    if (!outlet) return;
    let frame = 0;

    const revealIfBlank = () => {
      frame = 0;
      if (document.querySelector('.app-splash')) return; // the splash still covers the app
      const pages = Array.from(outlet.querySelectorAll<HTMLElement>(':scope > .ion-page'));
      if (!pages.length) return;
      const visible = pages.some(
        (page) => !page.classList.contains('ion-page-invisible') && !page.classList.contains('ion-page-hidden'),
      );
      if (visible) return;
      pages[pages.length - 1].classList.remove('ion-page-invisible', 'ion-page-hidden');
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(revealIfBlank);
    };

    const observer = new MutationObserver(schedule);
    observer.observe(outlet, { childList: true });
    const timers = [400, 1200, 3000].map((delay) => window.setTimeout(revealIfBlank, delay));
    return () => {
      observer.disconnect();
      timers.forEach((timer) => window.clearTimeout(timer));
      if (frame) cancelAnimationFrame(frame);
    };
  }, [location.key, location.pathname]);
};

/** Standard Ionic tabs: the bar stays in the layout on every signed-in page. */
export const TabsLayout: React.FC = () => {
  useRevealStuckPage();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void import('./tabs/CustomersTab');
      void import('./tabs/PosTab');
      void import('./tabs/InvoicesTab');
      void import('./tabs/MoreTab');
      void import('./ProductsPage');
      void import('./SettingsPage');
      void import('./InventoryPage');
    }, 400);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <IonTabs>
      <IonRouterOutlet>
        <Routes>
          <Route path="/tabs/home" element={loadPage(<HomeTab />)} />
          <Route path="/tabs/customers" element={loadPage(<CustomersTab />)} />
          <Route path="/tabs/pos" element={loadPage(<PosTab />)} />
          <Route path="/tabs/invoices" element={loadPage(<InvoicesTab />)} />
          <Route path="/tabs/sales" element={<Navigate to="/tabs/pos" replace />} />
          <Route path="/tabs/more" element={loadPage(<MoreTab />)} />
          <Route path="/products" element={loadPage(<ProductsPage />)} />
          <Route path="/workshop" element={loadPage(<WorkshopPage />)} />
          <Route path="/customers-map" element={loadPage(<CustomersMapPage />)} />
          <Route path="/cheques" element={loadPage(<ChequesPage />)} />
          <Route path="/expenses" element={loadPage(<ExpensesPage />)} />
          <Route path="/cashbox" element={loadPage(<CashboxPage />)} />
          <Route path="/follow-ups" element={loadPage(<FollowUpsPage />)} />
          <Route path="/inventory" element={loadPage(<InventoryPage />)} />
          <Route path="/warehouses" element={<Navigate to="/inventory" replace />} />
          <Route path="/stocktake" element={loadPage(<StocktakePage />)} />
          <Route path="/profit" element={loadPage(<ProfitPage />)} />
          <Route path="/sales" element={loadPage(<SalesModulePage />)} />
          <Route path="/sales/product/:productId" element={loadPage(<SalesProductPage />)} />
          <Route path="/home-layout" element={loadPage(<HomeLayoutPage />)} />
          <Route path="/sales-target" element={loadPage(<SalesTargetPage />)} />
          <Route path="/marketing" element={loadPage(<MarketingPage />)} />
          <Route path="/watch" element={loadPage(<WatchPage />)} />
          <Route path="/credit-report" element={loadPage(<CreditReportPage />)} />
          <Route path="/inflation" element={loadPage(<InflationPage />)} />
          <Route path="/supplier-account" element={loadPage(<SupplierAccountPage />)} />
          <Route path="/proformas" element={loadPage(<ProformasPage />)} />
          <Route path="/suppliers" element={loadPage(<SuppliersPage />)} />
          <Route path="/settings" element={loadPage(<SettingsPage />)} />
          <Route path="/price-chart" element={loadPage(<PriceChartPage />)} />
          <Route path="/logs" element={loadPage(<LogsPage />)} />
          <Route path="/users" element={loadPage(<UsersPage />)} />
          <Route path="/" element={<Navigate to="/tabs/home" replace />} />
          <Route path="*" element={<Navigate to="/tabs/home" replace />} />
        </Routes>
      </IonRouterOutlet>

      <IonTabBar slot="bottom">
        {TABS.map(({ tab, href, label, icon }) => (
          <IonTabButton key={tab} tab={tab} href={href}>
            <IonIcon aria-hidden="true" icon={icon} />
            <IonLabel>{label}</IonLabel>
          </IonTabButton>
        ))}
      </IonTabBar>
    </IonTabs>
  );
};
