import React from 'react';
import { IonTabs, IonRouterOutlet, IonTabBar, IonTabButton, IonIcon, IonLabel } from '@ionic/react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { homeOutline, peopleOutline, cartOutline, receiptOutline, menuOutline } from 'ionicons/icons';
import { HomeTab } from './tabs/HomeTab';
import { CustomersTab } from './tabs/CustomersTab';
import { PosTab } from './tabs/PosTab';
import { InvoicesTab } from './tabs/InvoicesTab';
import { MoreTab } from './tabs/MoreTab';
import { ProductsPage } from './ProductsPage';
import { CustomersMapPage } from './CustomersMapPage';
import { ChequesPage } from './ChequesPage';
import { ExpensesPage } from './ExpensesPage';
import { FollowUpsPage } from './FollowUpsPage';
import { InventoryPage } from './InventoryPage';
import { ProfitPage } from './ProfitPage';
import { CreditReportPage } from './CreditReportPage';
import { InflationPage } from './InflationPage';
import { SupplierAccountPage } from './SupplierAccountPage';
import { ProformasPage } from './ProformasPage';
import { SuppliersPage } from './SuppliersPage';
import { SettingsPage } from './SettingsPage';
import { PriceChartPage } from './PriceChartPage';
import { LogsPage } from './LogsPage';
import { UsersPage } from './UsersPage';
import { CashboxPage } from './CashboxPage';

const TABS = [
  { tab: 'home', href: '/tabs/home', label: 'خانه', icon: homeOutline },
  { tab: 'customers', href: '/tabs/customers', label: 'مشتریان', icon: peopleOutline },
  { tab: 'pos', href: '/tabs/pos', label: 'فروش', icon: cartOutline },
  { tab: 'invoices', href: '/tabs/invoices', label: 'فاکتورها', icon: receiptOutline },
  { tab: 'more', href: '/tabs/more', label: 'بیشتر', icon: menuOutline },
];

/** Standard Ionic tabs: the bar stays in the layout on every signed-in page. */
export const TabsLayout: React.FC = () => {
  return (
    <IonTabs>
      <IonRouterOutlet>
        <Routes>
          <Route path="/tabs/home" element={<HomeTab />} />
          <Route path="/tabs/customers" element={<CustomersTab />} />
          <Route path="/tabs/pos" element={<PosTab />} />
          <Route path="/tabs/invoices" element={<InvoicesTab />} />
          <Route path="/tabs/sales" element={<Navigate to="/tabs/pos" replace />} />
          <Route path="/tabs/more" element={<MoreTab />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/customers-map" element={<CustomersMapPage />} />
          <Route path="/cheques" element={<ChequesPage />} />
          <Route path="/expenses" element={<ExpensesPage />} />
          <Route path="/cashbox" element={<CashboxPage />} />
          <Route path="/follow-ups" element={<FollowUpsPage />} />
          <Route path="/inventory" element={<InventoryPage />} />
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
