import React, { lazy, Suspense } from 'react';
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

const TABS = [
  { tab: 'home', href: '/tabs/home', label: 'خانه', icon: homeOutline },
  { tab: 'customers', href: '/tabs/customers', label: 'مشتریان', icon: peopleOutline },
  { tab: 'pos', href: '/tabs/pos', label: 'فروش', icon: cartOutline },
  { tab: 'invoices', href: '/tabs/invoices', label: 'فاکتورها', icon: receiptOutline },
  { tab: 'more', href: '/tabs/more', label: 'بیشتر', icon: menuOutline },
];

/** Standard Ionic tabs: the bar stays in the layout on every signed-in page. */
export const TabsLayout: React.FC = () => {
  const { pathname } = useLocation();
  return (
    <IonTabs>
      <IonRouterOutlet>
        <PageLoadBoundary key={pathname}>
        <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/tabs/home" element={<HomeTab />} />
          <Route path="/tabs/customers" element={<CustomersTab />} />
          <Route path="/tabs/pos" element={<PosTab />} />
          <Route path="/tabs/invoices" element={<InvoicesTab />} />
          <Route path="/tabs/sales" element={<Navigate to="/tabs/pos" replace />} />
          <Route path="/tabs/more" element={<MoreTab />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/workshop" element={<WorkshopPage />} />
          <Route path="/customers-map" element={<CustomersMapPage />} />
          <Route path="/cheques" element={<ChequesPage />} />
          <Route path="/expenses" element={<ExpensesPage />} />
          <Route path="/cashbox" element={<CashboxPage />} />
          <Route path="/follow-ups" element={<FollowUpsPage />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/stocktake" element={<StocktakePage />} />
          <Route path="/profit" element={<ProfitPage />} />
          <Route path="/credit-report" element={<CreditReportPage />} />
          <Route path="/inflation" element={<InflationPage />} />
          <Route path="/supplier-account" element={<SupplierAccountPage />} />
          <Route path="/proformas" element={<ProformasPage />} />
          <Route path="/suppliers" element={<SuppliersPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/price-chart" element={<PriceChartPage />} />
          <Route path="/logs" element={<LogsPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/" element={<Navigate to="/tabs/home" replace />} />
          <Route path="*" element={<Navigate to="/tabs/home" replace />} />
        </Routes>
        </Suspense>
        </PageLoadBoundary>
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
