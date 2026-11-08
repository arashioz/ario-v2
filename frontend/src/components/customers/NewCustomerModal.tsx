import React, { useEffect, useRef, useState } from 'react';
import { IonModal, IonHeader, IonToolbar, IonContent } from '@ionic/react';
import { X, UserPlus, Phone, MapPin, CheckCircle2, Loader2, AlertCircle, RefreshCw, Navigation } from 'lucide-react';
import { getCurrentPosition, geoErrorMessage } from '../../lib/map';
import { customersService } from '../../services/customers.service';
import type { Customer } from '../../services/customers.service';
import { useNotification } from '../../context/NotificationContext';
import { LoadingOverlay } from '../LoadingOverlay';
import { CustomerLocationPickerModal } from '../map/CustomerLocationPickerModal';
import { CustomerLocationMap } from '../map/CustomerLocationMap';
import { MoneyTextInput } from '../ui/AmountInput';

interface NewCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCustomerCreated: (customer: Customer) => void;
}

export const NewCustomerModal: React.FC<NewCustomerModalProps> = ({
  isOpen,
  onClose,
  onCustomerCreated,
}) => {
  const { showNotification } = useNotification();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [customerType, setCustomerType] = useState<'supermarket' | 'wholesale'>('supermarket');
  const [address, setAddress] = useState('');
  const [initialDebt, setInitialDebt] = useState<string>('');
  const [creditLimit, setCreditLimit] = useState<string>('');

  // Map Coordinates
  const [latitude, setLatitude] = useState<number | undefined>(undefined);
  const [longitude, setLongitude] = useState<number | undefined>(undefined);
  const [isMapPickerOpen, setIsMapPickerOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [geoHint, setGeoHint] = useState('');
  const [pinFromAddress, setPinFromAddress] = useState(false);
  const geoTimer = useRef<number | null>(null);
  const skipGeo = useRef(false);

  const requestLocation = async () => {
    setGeoError(null);
    setLocating(true);
    try {
      const { lat, lng } = await getCurrentPosition();
      setLatitude(lat);
      setLongitude(lng);
      setPinFromAddress(false);
      skipGeo.current = true;
    } catch (err) {
      setGeoError(geoErrorMessage(err));
    } finally {
      setLocating(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    return () => {
      setLatitude(undefined);
      setLongitude(undefined);
      setGeoError(null);
      setLocating(false);
    };
  }, [isOpen]);

  const resetForm = () => {
    setName('');
    setPhoneNumber('');
    setCustomerType('supermarket');
    setAddress('');
    setInitialDebt('');
    setCreditLimit('');
    setLatitude(undefined);
    setLongitude(undefined);
    setGeoError(null);
    setGeoHint('');
    setPinFromAddress(false);
  };

  useEffect(() => {
    if (!isOpen) return;
    const text = address.trim();
    const hasCity = /تهران|کرج|اصفهان|مشهد|شیراز|تبریز|اهواز|قم|رشت|کرمان|ایران|شهر|محله/.test(text);
    if (skipGeo.current) {
      skipGeo.current = false;
      return;
    }
    if (text.length < 8 || !hasCity) return;
    if (geoTimer.current) window.clearTimeout(geoTimer.current);
    geoTimer.current = window.setTimeout(() => {
      setGeoHint('در حال پیدا کردن آدرس روی نقشه…');
      customersService
        .geocode(text)
        .then((point) => {
          setLatitude(point.lat);
          setLongitude(point.lng);
          setPinFromAddress(true);
          setGeoHint(`موقعیت از روی آدرس مشخص شد`);
          setGeoError(null);
        })
        .catch(() => {
          setGeoHint('آدرس روی نقشه پیدا نشد. شهر را کامل بنویسید یا پین را دستی بگذارید.');
        });
    }, 700);
    return () => {
      if (geoTimer.current) window.clearTimeout(geoTimer.current);
    };
  }, [address, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      showNotification({
        title: 'خطای ورودی',
        message: 'لطفاً نام مشتری را وارد نمایید',
        type: 'warning',
      });
      return;
    }

    if (!phoneNumber.trim()) {
      showNotification({
        title: 'خطای ورودی',
        message: 'لطفاً شماره تماس را وارد نمایید',
        type: 'warning',
      });
      return;
    }

    try {
      setIsSubmitting(true);
      const created = await customersService.create({
        name: name.trim(),
        phoneNumber: phoneNumber.trim(),
        customerType,
        address: address.trim() || undefined,
        latitude,
        longitude,
        initialDebt: initialDebt ? Number(initialDebt) : 0,
        creditLimit: creditLimit ? Number(creditLimit) : 0,
      });

      showNotification({
        title: 'مشتری با موفقیت ثبت شد',
        message: `پرونده مشتری ${created.name} با سقف اعتبار و لوکیشن تشکیل گردید.`,
        type: 'success',
      });

      resetForm();
      onCustomerCreated(created);
      onClose();
    } catch (err: any) {
      const errMsg = err.response?.data?.message || 'خطا در ثبت اطلاعات مشتری';
      showNotification({
        title: 'خطای ثبت',
        message: Array.isArray(errMsg) ? errMsg.join(' - ') : errMsg,
        type: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <IonModal isOpen={isOpen} onDidDismiss={onClose} className="customer-modal">
        <IonHeader className="ion-no-border">
          <IonToolbar className="bg-white/95 backdrop-blur-md px-3 border-b border-sky-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center">
                  <UserPlus className="w-4 h-4" />
                </div>
                <h2 className="text-sm font-semibold text-slate-800">تعریف مشتری جدید</h2>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </IonToolbar>
        </IonHeader>

        <IonContent className="bg-slate-50">
          <LoadingOverlay isOpen={isSubmitting} message="در حال ثبت پرونده مشتری..." />

          <form onSubmit={handleSubmit} className="p-3 space-y-3 max-w-md mx-auto pb-6">
            {/* Customer Type Selector */}
            <div className="space-y-1.5 text-right">
              <label className="text-xs font-medium text-slate-700 block">
                نوع مشتری و طرف حساب <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2 p-1 bg-white rounded-2xl border border-sky-100 shadow-sm">
                <button
                  type="button"
                  onClick={() => setCustomerType('supermarket')}
                  className={`py-2 text-xs font-medium rounded-xl transition ${
                    customerType === 'supermarket'
                      ? 'bg-sky-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  سوپرمارکت
                </button>
                <button
                  type="button"
                  onClick={() => setCustomerType('wholesale')}
                  className={`py-2 text-xs font-medium rounded-xl transition ${
                    customerType === 'wholesale'
                      ? 'bg-sky-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  عمده
                </button>
              </div>
            </div>

            {/* Customer Name */}
            <div className="space-y-1 text-right">
              <label className="text-xs font-medium text-slate-700 block">
                نام مشتری یا عنوان فروشگاه <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: سوپرمارکت شقایق یا بازرگانی امید"
                className="w-full px-3.5 py-2.5 text-xs rounded-2xl bg-white border border-sky-100 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition text-slate-800"
              />
            </div>

            {/* Phone Numbers */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1 text-right">
                <label className="text-xs font-medium text-slate-700 flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-sky-500" />
                  <span>شماره موبایل <span className="text-rose-500">*</span></span>
                </label>
                <input
                  type="tel"
                  dir="ltr"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="09123456789"
                  className="w-full px-3.5 py-2.5 text-xs rounded-2xl bg-white border border-sky-100 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition text-slate-800 font-mono text-left"
                />
              </div>

            </div>

            {/* Address & Map Picker */}
            <div className="space-y-2 text-right">
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-700 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-sky-500" />
                  <span>آدرس و موقعیت مکانی</span>
                </label>

                <div className="grid grid-cols-2 gap-2 w-full">
                  <button
                    type="button"
                    onClick={requestLocation}
                    disabled={locating}
                    className="inline-flex items-center justify-center gap-1.5 text-sm font-bold text-white bg-sky-600 px-3 py-3 rounded-2xl active:scale-95 disabled:opacity-50"
                  >
                    <Navigation className="w-5 h-5" />
                    لوکیشن من
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsMapPickerOpen(true)}
                    className="inline-flex items-center justify-center gap-1.5 text-sm font-bold text-sky-800 bg-white px-3 py-3 rounded-2xl border border-sky-300 active:scale-95"
                  >
                    <MapPin className="w-5 h-5" />
                    <span>{latitude != null ? 'تنظیم نقشه' : 'نقشه'}</span>
                  </button>
                </div>
                {!window.isSecureContext && (
                  <p className="text-[10px] text-amber-700 leading-5">مرورگر روی http معمولاً GPS نمی‌دهد. اگر پنجره اجازه نیامد، سایت را با https باز کنید یا پین را دستی روی نقشه بگذارید.</p>
                )}
              </div>

              {locating ? (
                <div className="p-2.5 rounded-xl bg-sky-50 border border-sky-200/80 flex items-center gap-1.5 text-[11px] text-sky-700">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>در حال دریافت لوکیشن فعلی دستگاه…</span>
                </div>
              ) : latitude != null && longitude != null ? (
                <div className="rounded-2xl overflow-hidden border border-emerald-200/80">
                  <div className="px-2.5 py-1.5 bg-emerald-50 flex items-center justify-between text-[11px] text-emerald-800">
                    <span className="flex items-center gap-1 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      {pinFromAddress ? 'پین از روی آدرس گذاشته شد' : 'موقعیت فعلی گرفته شد'}
                    </span>
                    <span className="font-mono text-[10px] text-slate-500" dir="ltr">
                      {latitude.toFixed(5)}, {longitude.toFixed(5)}
                    </span>
                  </div>
                  <CustomerLocationMap lat={latitude} lng={longitude} className="h-36" />
                </div>
              ) : geoError ? (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-between gap-2 text-[11px] text-rose-700">
                  <span className="flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{geoError}</span>
                  </span>
                  <button
                    type="button"
                    onClick={requestLocation}
                    className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg bg-white border border-rose-200 font-medium active:scale-95"
                  >
                    <RefreshCw className="w-3 h-3" />
                    تلاش مجدد
                  </button>
                </div>
              ) : null}

              <textarea
                rows={2}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="شهر، محله، خیابان، پلاک. مثلاً تهران، یافت‌آباد، خیابان قند"
                className="w-full px-3.5 py-2 text-xs rounded-2xl bg-white border border-sky-100 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition text-slate-800 resize-none"
              />
              {geoHint && <p className="text-[11px] text-slate-500">{geoHint}</p>}
            </div>

            {/* Financial Details */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1 text-right">
                <label className="text-xs font-medium text-slate-700">مانده اولیه (بدهی از قبل)</label>
                <div className="relative">
                  <MoneyTextInput
                    value={initialDebt}
                    onChange={setInitialDebt}
                    placeholder="۰"
                    className="w-full pl-10 pr-3 py-2 text-xs rounded-2xl bg-white border border-sky-100 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition text-slate-800 font-mono"
                  />
                  <span className="absolute left-2.5 top-2 text-[10px] text-slate-400">تومان</span>
                </div>
              </div>

              <div className="space-y-1 text-right">
                <label className="text-xs font-medium text-slate-700">سقف اعتبار نسیه</label>
                <div className="relative">
                  <MoneyTextInput
                    value={creditLimit}
                    onChange={setCreditLimit}
                    placeholder="۰"
                    className="w-full pl-10 pr-3 py-2 text-xs rounded-2xl bg-white border border-sky-100 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition text-slate-800 font-mono"
                  />
                  <span className="absolute left-2.5 top-2 text-[10px] text-slate-400">تومان</span>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 px-4 rounded-2xl bg-sky-600 hover:bg-sky-700 active:scale-98 text-white font-semibold text-xs shadow-md shadow-sky-500/25 transition flex items-center justify-center gap-2"
              >
                <UserPlus className="w-4 h-4" />
                <span>ثبت پرونده مشتری در آریو</span>
              </button>
            </div>
          </form>
        </IonContent>
      </IonModal>

      {/* Customer Location Picker Map Modal */}
      <CustomerLocationPickerModal
        isOpen={isMapPickerOpen}
        initialLat={latitude || 35.6892}
        initialLng={longitude || 51.3890}
        customerName={name || 'مشتری جدید'}
        autoLocate={latitude == null}
        onClose={() => setIsMapPickerOpen(false)}
        onSelectLocation={(lat, lng) => {
          skipGeo.current = true;
          setLatitude(lat);
          setLongitude(lng);
          setPinFromAddress(false);
        }}
      />
    </>
  );
};
