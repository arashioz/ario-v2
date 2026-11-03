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
import { productsService } from '../../services/products.service';
import type { Product } from '../../services/products.service';
import { invoicesService } from '../../services/invoices.service';
import type { InvoiceStats } from '../../services/invoices.service';
import { accountingService } from '../../services/accounting.service';
import type { AccountingDashboard } from '../../services/accounting.service';
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
  const [goods, setGoods] = useState<Product[]>([]);
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
      const [cStats, iStats, aStats, sAcc, catalog] = await Promise.all([
        customersService.getCustomerStats().catch(() => null),
        invoicesService.getStats().catch(() => null),
        accountingService.dashboard(today, jalaliMonthRange(j.jy, j.jm).from).catch(() => null),
        suppliersService.account().catch(() => null),
        productsService.getForSale().catch(() => [] as Product[]),
      ]);
      if (aStats) setAcc(aStats);
      if (sAcc) setSupplier(sAcc);
      if (cStats) setCustomerStats(cStats);
      if (iStats) setInvoiceStats(iStats);
      setGoods(catalog);
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
    const rows = new Map<string, { count: number; kg: number; cost: number }>();
    for (const product of goods) {
      const name = (product.supplierName || '').trim() || 'بدون شرکت';
      const row = rows.get(name) || { count: 0, kg: 0, cost: 0 };
      const perKg = product.weightPerUnitKg || (product.unit === 'کیلوگرم' ? 1 : 0);
      row.count += 1;
      row.kg += (product.stock || 0) * perKg;
      row.cost += (product.stock || 0) * (product.buyPrice || 0);
      rows.set(name, row);
    }
    return [...rows.entries()]
      .map(([name, row]) => ({ name, ...row }))
      .sort((a, b) => b.cost - a.cost);
  }, [goods]);

  const warehouseNames = user?.homeWarehouses?.length ? user.homeWarehouses : settings.homeWarehouses || [];

  return (
    <IonPage>
      <IonHeader className="ion-no-border">
        <IonToolbar className="bg-white/95 backdrop-blur-md px-4 py-2 border-b border-sky-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-sky-600 to-sky-400 flex items-center justify-center text-white">
                <span className="font-semibold text-xs">آ</span>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-1.5">
                  <h1 className="text-sm font-semibold text-slate-800">{user?.fullName || 'کاربر گرامی'}</h1>
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${
                      user?.role === 'admin'
                        ? 'bg-sky-50 text-sky-800 border border-sky-200'
                        : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    }`}
                  >
                    {user?.role === 'admin' ? (
                      <>
                        <ShieldCheck className="w-3 h-3 text-sky-600" />
                        <span>مدیر</span>
                      </>
                    ) : (
                      <>
                        <Briefcase className="w-3 h-3 text-emerald-600" />
                        <span>بازاریاب</span>
                      </>
                    )}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={() => navigate('/customers-map')}
              className="p-1.5 rounded-xl bg-sky-50 text-sky-600 hover:bg-sky-100 transition active:scale-95 border border-sky-200/60"
              title="نقشه مشتریان"
            >
              <MapPin className="w-4 h-4" />
            </button>
          </div>
        </IonToolbar>
      </IonHeader>

      <IonContent fullscreen className="bg-slate-50">
        <IonRefresher slot="fixed" onIonRefresh={handleRefresh}>
          <IonRefresherContent />
        </IonRefresher>

        <div className="p-3.5 space-y-4 max-w-md mx-auto pb-8">
          <PendingProformasBanner refreshKey={refreshKey} />
          <button type="button" onClick={() => setDateOpen(true)} className="w-full text-center text-xs font-medium text-slate-500 py-0.5 active:opacity-70">
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
