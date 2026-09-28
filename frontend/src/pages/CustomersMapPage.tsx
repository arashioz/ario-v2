import React, { useState, useEffect, useRef } from 'react';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonContent,
} from '@ionic/react';
import {
  ArrowRight,
  AlertCircle,
  Navigation,
  RefreshCw,
  ShoppingBag,
  Layers,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import { customersService } from '../services/customers.service';
import type { Customer } from '../services/customers.service';
import { useNotification } from '../context/NotificationContext';
import { CustomerDetailModal } from '../components/customers/CustomerDetailModal';
import { createMap, setMapStyle, customerPin } from '../lib/map';
import type { MapStyle } from '../lib/map';
import { formatToman } from '../lib/format';

const pinColor = (c: Customer) => (c.balance > 0 ? '#e11d48' : c.balance < 0 ? '#0284c7' : '#10b981');
const shortName = (name: string) => (name.length > 16 ? name.slice(0, 15) + '…' : name);

export const CustomersMapPage: React.FC = () => {
  const navigate = useNavigate();
  const { showNotification } = useNotification();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersGroupRef = useRef<L.FeatureGroup | null>(null);
  const markersRef = useRef(new Map<string, L.Marker>());
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const [mapStyle, setMapStyleState] = useState<MapStyle>('street');
  const fittedFilterRef = useRef<string | null>(null);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'supermarket' | 'wholesale' | 'debtors'>('all');

  const loadCustomers = async () => {
    try {
      setLoading(true);
      const data = await customersService.getAll();
      setCustomers(data);
    } catch (err: any) {
      showNotification({
        title: 'خطا در دریافت مشتریان',
        message: err.response?.data?.message || 'ارتباط با سرور برقرار نشد.',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  // Map is created immediately (tiles start loading while customers are fetched).
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;
    const map = createMap(mapContainerRef.current);
    markersGroupRef.current = L.featureGroup().addTo(map);
    map.on('click', () => setSelectedCustomer(null));
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      tileLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (map) tileLayerRef.current = setMapStyle(map, mapStyle, tileLayerRef.current);
  }, [mapStyle]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const group = markersGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();
    markersRef.current.clear();

    const filtered = customers.filter((c) => {
      if (!c.latitude || !c.longitude) return false;
      if (filterType === 'debtors') return c.balance > 0;
      if (filterType === 'supermarket') return c.customerType === 'supermarket';
      if (filterType === 'wholesale') return c.customerType === 'wholesale';
      return true;
    });

    filtered.forEach((customer) => {
      const marker = L.marker([customer.latitude!, customer.longitude!], {
        icon: customerPin(shortName(customer.name), pinColor(customer)),
        riseOnHover: true,
      });
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        setSelectedCustomer(customer);
        map.flyTo([customer.latitude!, customer.longitude!], Math.max(map.getZoom(), 15), { duration: 0.35 });
      });
      marker.addTo(group);
      markersRef.current.set(customer._id, marker);
    });

    // Refit only when the filter changes, not on every reload after a payment etc.
    if (filtered.length > 0 && fittedFilterRef.current !== filterType) {
      map.fitBounds(group.getBounds(), { padding: [48, 48], maxZoom: 15, animate: false });
      fittedFilterRef.current = filterType;
    }
  }, [customers, filterType]);

  useEffect(() => {
    markersRef.current.forEach((marker, id) => {
      const c = customers.find((x) => x._id === id);
      if (!c) return;
      const active = selectedCustomer?._id === id;
      marker.setIcon(customerPin(shortName(c.name), pinColor(c), active));
      marker.setZIndexOffset(active ? 1000 : 0);
    });
  }, [selectedCustomer, customers]);

  const handleGetCurrentLocation = () => {
    if (navigator.geolocation && mapInstanceRef.current) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          mapInstanceRef.current?.setView([latitude, longitude], 15);
        },
        (err) => {
          console.warn('Geolocation failed', err);
        },
      );
    }
  };

  const totalFilteredDebt = customers
    .filter((c) => {
      if (filterType === 'debtors') return c.balance > 0;
      if (filterType === 'supermarket') return c.customerType === 'supermarket';
      if (filterType === 'wholesale') return c.customerType === 'wholesale';
      return true;
    })
    .reduce((acc, curr) => acc + (curr.balance > 0 ? curr.balance : 0), 0);

  return (
    <IonPage>
      <IonHeader className="ion-no-border">
        <IonToolbar className="bg-white/95 backdrop-blur-md px-3 border-b border-sky-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate(-1)}
                className="p-1.5 rounded-xl bg-sky-50 text-sky-700 hover:bg-sky-100 transition active:scale-95"
                title="بازگشت"
              >
                <ArrowRight className="w-4 h-4" />
              </button>
              <h1 className="text-sm font-semibold text-slate-800">نقشه مشتریان</h1>
            </div>

            <button
              onClick={loadCustomers}
              className="p-1.5 rounded-xl bg-sky-50 text-sky-600 hover:bg-sky-100 transition active:scale-95"
              title="تازه‌سازی داده‌ها"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </IonToolbar>
      </IonHeader>

      <IonContent fullscreen className="bg-slate-50 relative">
        <div className="relative w-full h-full flex flex-col">
          {/* Filters Bar Floating */}
          <div className="absolute top-2 right-2 left-2 z-[1000] flex items-center gap-1 overflow-x-auto no-scrollbar bg-white/90 backdrop-blur-md p-1 rounded-2xl border border-slate-200/80 shadow-md">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition whitespace-nowrap ${
                filterType === 'all'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              همه ({customers.length})
            </button>
            <button
              onClick={() => setFilterType('supermarket')}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition whitespace-nowrap ${
                filterType === 'supermarket'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              سوپرمارکت‌ها
            </button>
            <button
              onClick={() => setFilterType('wholesale')}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition whitespace-nowrap ${
                filterType === 'wholesale'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              عمده و بنکداری
            </button>
            <button
              onClick={() => setFilterType('debtors')}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition flex items-center gap-1 whitespace-nowrap ${
                filterType === 'debtors'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-rose-600 hover:bg-rose-50'
              }`}
            >
              <AlertCircle className="w-3.5 h-3.5" />
              <span>بدهکاران</span>
            </button>
          </div>

          {/* Leaflet Map container */}
          <div ref={mapContainerRef} className="w-full flex-1 z-0" />

          <div className="absolute bottom-16 left-3 z-[1000] flex flex-col gap-2 items-center">
            {mapStyle === 'street' && (
              <span className="text-[10px] font-bold text-slate-600 bg-white/95 border border-slate-200 rounded-lg px-2 py-1 shadow-sm">مپ</span>
            )}
            <button
              onClick={() => setMapStyleState((s) => (s === 'street' ? 'satellite' : 'street'))}
              className="bg-white p-3 rounded-2xl shadow-lg border border-slate-200 text-slate-700 active:scale-95 transition"
              title={mapStyle === 'street' ? 'نمای ماهواره' : 'نقشه مپ'}
            >
              <Layers className="w-5 h-5" />
            </button>
            <button
              onClick={handleGetCurrentLocation}
              className="bg-white p-3 rounded-2xl shadow-lg border border-slate-200 text-sky-600 active:scale-95 transition"
              title="موقعیت فعلی من"
            >
              <Navigation className="w-5 h-5" />
            </button>
          </div>

          <div className="absolute bottom-3 right-3 left-3 z-[1000] bg-white/95 backdrop-blur-md rounded-2xl px-3 py-2.5 border border-sky-100 shadow-xl flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-slate-600 font-normal">
              <ShoppingBag className="w-4 h-4 text-sky-600" />
              <span>مجموع طلب در این فیلتر:</span>
            </div>
            <span className="font-semibold text-rose-600 text-sm">
              {formatToman(totalFilteredDebt)}
            </span>
          </div>
        </div>

        <CustomerDetailModal
          isOpen={!!selectedCustomer}
          customerId={selectedCustomer?._id ?? null}
          onClose={() => setSelectedCustomer(null)}
          onChanged={loadCustomers}
          onCustomerDeleted={loadCustomers}
        />
      </IonContent>
    </IonPage>
  );
};
