import React, { useEffect, useRef } from 'react';
import {
  IonModal,
  IonHeader,
  IonToolbar,
  IonContent,
} from '@ionic/react';
import { X, Check, MapPin, Navigation, Layers, Loader2 } from 'lucide-react';
import L from 'leaflet';
import { createMap, setMapStyle, locationPin, getCurrentPosition, geoErrorMessage } from '../../lib/map';
import type { MapStyle } from '../../lib/map';

interface CustomerLocationPickerModalProps {
  isOpen: boolean;
  initialLat?: number;
  initialLng?: number;
  customerName?: string;
  /** Jump to the device's current position as soon as the map opens. */
  autoLocate?: boolean;
  onClose: () => void;
  onSelectLocation: (lat: number, lng: number) => void;
}

export const CustomerLocationPickerModal: React.FC<CustomerLocationPickerModalProps> = ({
  isOpen,
  initialLat = 35.6892, // Default Tehran
  initialLng = 51.3890,
  customerName = 'مشتری',
  autoLocate = false,
  onClose,
  onSelectLocation,
}) => {
  const [locating, setLocating] = React.useState(false);
  const [geoError, setGeoError] = React.useState<string | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const styleRef = useRef<MapStyle>('street');
  const [mapStyle, setMapStyleState] = React.useState<MapStyle>('street');

  const toggleStyle = () => {
    const next: MapStyle = styleRef.current === 'street' ? 'satellite' : 'street';
    styleRef.current = next;
    setMapStyleState(next);
    if (mapInstanceRef.current) tileLayerRef.current = setMapStyle(mapInstanceRef.current, next, tileLayerRef.current);
  };
  const [selectedCoords, setSelectedCoords] = React.useState<{ lat: number; lng: number }>({
    lat: initialLat,
    lng: initialLng,
  });

  useEffect(() => {
    if (isOpen) {
      setSelectedCoords({ lat: initialLat, lng: initialLng });
      setGeoError(null);
    }
  }, [isOpen, initialLat, initialLng]);

  useEffect(() => {
    if (!isOpen) {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      return;
    }

    // IonModal mounts its content asynchronously; retry briefly until the container exists.
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    const init = () => {
      if (!mapContainerRef.current) {
        if (attempts++ < 40) timer = setTimeout(init, 25);
        return;
      }

      if (!mapInstanceRef.current) {
        const map = createMap(mapContainerRef.current, [initialLat, initialLng], 15);
        tileLayerRef.current = setMapStyle(map, styleRef.current);

        const marker = L.marker([initialLat, initialLng], {
          interactive: false,
          keyboard: false,
          icon: locationPin(),
        }).addTo(map);

        const place = (latlng: L.LatLng) => {
          marker.setLatLng(latlng);
          setSelectedCoords({ lat: latlng.lat, lng: latlng.lng });
        };
        map.on('move', () => marker.setLatLng(map.getCenter()));
        map.on('moveend', () => place(map.getCenter()));
        map.on('click', (e) => map.panTo(e.latlng));

        markerRef.current = marker;
        mapInstanceRef.current = map;
        // Only jump if the user already allowed location. A request on open is rejected by the browser.
        if (autoLocate && window.isSecureContext && navigator.permissions) {
          navigator.permissions
            .query({ name: 'geolocation' })
            .then((p) => {
              if (p.state === 'granted') handleGetCurrentLocation();
            })
            .catch(() => undefined);
        }
      }
    };
    timer = setTimeout(init, 0);

    return () => {
      clearTimeout(timer);
    };
    // autoLocate is read once per open; re-running on its change would rebuild the map.
  }, [isOpen, initialLat, initialLng]);

  const handleGetCurrentLocation = async () => {
    setGeoError(null);
    setLocating(true);
    try {
      const { lat, lng } = await getCurrentPosition();
      setSelectedCoords({ lat, lng });
      mapInstanceRef.current?.setView([lat, lng], 17);
      markerRef.current?.setLatLng([lat, lng]);
    } catch (err) {
      setGeoError(geoErrorMessage(err));
    } finally {
      setLocating(false);
    }
  };

  const handleConfirm = () => {
    onSelectLocation(selectedCoords.lat, selectedCoords.lng);
    onClose();
  };

  return (
    <IonModal isOpen={isOpen} onDidDismiss={onClose} className="customer-map-modal">
      <IonHeader className="ion-no-border">
        <IonToolbar className="bg-white/95 backdrop-blur-md px-3 border-b border-sky-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center">
                <MapPin className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-800">تعیین موقعیت روی نقشه</h2>
                <span className="text-[10px] text-slate-400 block">{customerName}</span>
              </div>
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

      <IonContent className="bg-slate-50 relative">
        <div className="relative w-full h-full flex flex-col">
          {/* Map View */}
          <div ref={mapContainerRef} className="w-full flex-1 z-0 min-h-[400px]" />

          {/* Current Location FAB Button */}
          <button
            type="button"
            onClick={handleGetCurrentLocation}
            disabled={locating}
            className="absolute top-3 left-3 z-10 bg-white px-2.5 py-2 rounded-xl shadow-lg border border-slate-200 text-sky-600 active:scale-95 transition flex items-center gap-1.5 text-xs font-medium"
            title="موقعیت فعلی من"
          >
            {locating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
            <span>{locating ? 'در حال یافتن…' : 'لوکیشن من'}</span>
          </button>

          {geoError && (
            <div className="absolute top-14 inset-x-3 z-10 bg-rose-50 border border-rose-200 text-rose-700 text-[11px] rounded-xl px-3 py-2 shadow">
              {geoError}
            </div>
          )}

          <button
            type="button"
            onClick={toggleStyle}
            className="absolute top-3 right-3 z-10 bg-white px-2.5 py-2 rounded-xl shadow-lg border border-slate-200 text-slate-700 active:scale-95 transition flex items-center gap-1.5 text-xs font-medium"
          >
            <Layers className="w-4 h-4" />
            <span>{mapStyle === 'street' ? 'ماهواره' : 'خیابان'}</span>
          </button>

          {/* Bottom Confirmation Bar */}
          <div className="p-3 bg-white/95 backdrop-blur-md border-t border-slate-100 flex items-center justify-between gap-3 shadow-lg z-10">
            <div className="text-right">
              <span className="text-[11px] text-slate-500 block font-normal">نقشه را بکشید تا پین وسط روی محل باشد</span>
              <span className="text-xs font-medium text-slate-700 font-mono" dir="ltr">
                {selectedCoords.lat.toFixed(5)}, {selectedCoords.lng.toFixed(5)}
              </span>
            </div>

            <button
              onClick={handleConfirm}
              className="px-5 py-2.5 rounded-2xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shadow-md shadow-sky-500/25 active:scale-95 transition flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>تأیید و ذخیره لوکیشن</span>
            </button>
          </div>
        </div>
      </IonContent>
    </IonModal>
  );
};
