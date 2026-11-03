import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonContent,
  IonRefresher,
  IonRefresherContent,
} from '@ionic/react';
import type { RefresherEventDetail } from '@ionic/react';
import { useAuth } from '../../context/AuthContext';
import { customersService } from '../../services/customers.service';
import { invoicesService } from '../../services/invoices.service';
import type { InvoiceStats } from '../../services/invoices.service';
import { accountingService } from '../../services/accounting.service';
import type { AccountingDashboard, InventoryReport } from '../../services/accounting.service';
import { formatJalali, jalaliMonthRange, todayYmd, ymdToJalali } from '../../lib/jalali';
import { JalaliDateSheet } from '../../components/ui/JalaliDatePicker';
import { useSettings } from '../../services/settings.service';
import { suppliersService } from '../../services/suppliers.service';
import type { SupplierAccount } from '../../services/suppliers.service';
import { NewCustomerModal } from '../../components/customers/NewCustomerModal';
import { PendingProformasBanner } from '../../components/proformas/PendingProformasBanner';
import { ShieldCheck, Briefcase, MapPin } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { CustomerStats } from '../../services/customers.service';
import { HomeBoard } from './HomeBoard';

export const HomeTab: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const settings = useSettings();

  const [customerStats, setCustomerStats] = useState<CustomerStats | null>(null);
  const [stock, setStock] = useState<InventoryReport | null>(null);
  const [invoiceStats, setInvoiceStats] = useState<InvoiceStats | null>(null);
  const [acc, setAcc] = useState<AccountingDashboard | null>(null);
  const [ready, setReady] = useState(false);
  const [supplier, setSupplier] = useState<SupplierAccount | null>(null);
  const [isNewCustomerOpen, setIsNewCustomerOpen] = useState(false);
  const [showProfit, setShowProfit] = useState(() => localStorage.getItem('ario-show-profit') === '1');
  const [homeDate, setHomeDate] = useState(todayYmd);
  const [dateOpen, setDateOpen] = useState(false);

  const loadAllStats = useCallback(async () => {
    try {
      const today = homeDate;
      const j = ymdToJalali(today);
      const [cStats, iStats, aStats, sAcc, inv] = await Promise.all([
        customersService.getCustomerStats().catch(() => null),
        invoicesService.getStats().catch(() => null),
        accountingService.dashboard(today, jalaliMonthRange(j.jy, j.jm).from).catch(() => null),
        suppliersService.account().catch(() => null),
        accountingService.inventory().catch(() => null),
      ]);
      if (aStats) setAcc(aStats);
      if (sAcc) setSupplier(sAcc);
      if (cStats) setCustomerStats(cStats);
      if (iStats) setInvoiceStats(iStats);
      setStock(inv);
    } catch (e) {
      console.warn('Stats load error', e);
    } finally {
      setReady(true);
    }
  }, [homeDate]);

  useEffect(() => {
    loadAllStats();
  }, [loadAllStats]);

  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = async (e: CustomEvent<RefresherEventDetail>) => {
    setRefreshKey((k) => k + 1);
    await loadAllStats();
    e.detail.complete();
  };

  const toggleProfit = () => {
    setShowProfit((v) => {
      localStorage.setItem('ario-show-profit', v ? '0' : '1');
      return !v;
    });
  };

  const houses = useMemo(() => {
    const rows = new Map<string, { count: number; kg: number; cost: number; current: number; empty: number }>();
    for (const item of stock?.items || []) {
      const name = (item.supplier || '').trim();
      if (!name) continue;
      const row = rows.get(name) || { count: 0, kg: 0, cost: 0, current: 0, empty: 0 };
      row.count += 1;
      row.kg += item.stockKg || 0;
      row.cost += item.stockValue || 0;
      row.current += item.currentValue?.wholesale || item.stockValue || 0;
      if ((item.stockKg || 0) <= 0) row.empty += 1;
      rows.set(name, row);
    }
    return [...rows.entries()]
      .map(([name, row]) => ({ name, ...row }))
      .sort((a, b) => b.cost - a.cost);
  }, [stock]);

  const warehouseNames = (user?.homeWarehouses?.length ? user.homeWarehouses : settings.homeWarehouses || []).filter((name) => name && name !== 'بدون شرکت');

  return (
    <IonPage>
      <IonHeader className="ion-no-border">
        <IonToolbar className="bg-[#F2F2F7] px-4 pt-3 pb-1">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0 text-right">
              <p className="text-[12px] text-slate-500">{user?.fullName || 'آریو'}</p>
              <h1 className="text-[28px] font-bold tracking-tight text-slate-900 leading-8 mt-0.5">خانه</h1>
            </div>
            <div className="flex items-center gap-2 pb-1">
              <span
                className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full ${
                  user?.role === 'admin' ? 'bg-sky-100 text-sky-800' : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                {user?.role === 'admin' ? <ShieldCheck className="w-3 h-3" /> : <Briefcase className="w-3 h-3" />}
                {user?.role === 'admin' ? 'مدیر' : 'بازاریاب'}
              </span>
              <button
                onClick={() => navigate('/customers-map')}
                className="w-9 h-9 rounded-full bg-white text-sky-600 shadow-sm flex items-center justify-center"
                title="نقشه مشتریان"
              >
                <MapPin className="w-4 h-4" />
              </button>
            </div>
          </div>
        </IonToolbar>
      </IonHeader>

      <IonContent fullscreen className="bg-[#F2F2F7]">
        <IonRefresher slot="fixed" onIonRefresh={handleRefresh}>
          <IonRefresherContent />
        </IonRefresher>

        <div className="px-4 pt-2 space-y-4 max-w-md mx-auto pb-10">
          <PendingProformasBanner refreshKey={refreshKey} />
          <button type="button" onClick={() => setDateOpen(true)} className="w-full text-[13px] font-semibold text-[#007AFF] py-0.5 active:opacity-70">
            {formatJalali(homeDate, { weekday: true })}
          </button>
          <HomeBoard
            layout={user?.homeLayout}
            houses={houses}
            warehouseNames={warehouseNames}
            ready={ready}
            homeDate={homeDate}
            customerStats={customerStats}
            invoiceStats={invoiceStats}
            acc={acc}
            supplier={supplier}
            showProfit={showProfit}
            onToggleProfit={toggleProfit}
            onNewCustomer={() => setIsNewCustomerOpen(true)}
            refreshKey={refreshKey}
          />
        </div>

        <JalaliDateSheet open={dateOpen} value={homeDate} title="تاریخ" max={todayYmd()} onClose={() => setDateOpen(false)} onSelect={setHomeDate} />
        <NewCustomerModal
          isOpen={isNewCustomerOpen}
          onClose={() => setIsNewCustomerOpen(false)}
          onCustomerCreated={() => {
            loadAllStats();
            setIsNewCustomerOpen(false);
          }}
        />
      </IonContent>
    </IonPage>
  );
};
