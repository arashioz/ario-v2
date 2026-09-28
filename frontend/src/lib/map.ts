import L from 'leaflet';

export type MapStyle = 'street' | 'satellite';

/** Client tile key. Override with VITE_MAPIR_API_KEY when the panel issues a new one. */
const MAPIR_KEY =
  (import.meta.env.VITE_MAPIR_API_KEY as string | undefined) ||
  'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImp0aSI6IjQyYTQ2YzM4MTYxOTFmYjE5YWVjZjljY2Q5NGRhNDZiODZkZTYyZDliYzRhMjBjYjk5MGE5YzU3OTBkYTRmM2M4MDJiNzYzYmNmYjczOTJhIn0.eyJhdWQiOiIxNzA3MyIsImp0aSI6IjQyYTQ2YzM4MTYxOTFmYjE5YWVjZjljY2Q5NGRhNDZiODZkZTYyZDliYzRhMjBjYjk5MGE5YzU3OTBkYTRmM2M4MDJiNzYzYmNmYjczOTJhIiwiaWF0IjoxNjQ0OTUyNDI1LCJuYmYiOjE2NDQ5NTI0MjUsImV4cCI6MTY0NzQ1ODAyNSwic3ViIjoiIiwic2NvcGVzIjpbImJhc2ljIl19.aRCNeCRHfddrMVsflEgc1QPxmBxruFNruGqtZEqkiXc5tcyX4UQpUqbx1U3FLexH756OYmEB84B8iV4eUUPr693VSaZCH9IFqDg7BABqVC-cDJsJQS8JGhz9qeZZ9kmincaMekmzcy0rHbu66KeWLjKkrmfx_nI-c3LdFxsY39JQZN1HQuN_2N9q477iJ-pwM_feHXQ-cKrn2yUurOOftyNdNvoJXU_wxZZtaUkarGDWkr7uGeNC9AFoM97rOz_ztSnrpSRXtfB1akRSzVZlGgSlpwqShZzXI1Sc0mCOSnRUJG526xHySASD9CUi90rHyOE9AAcXuIbGbl2yU264Yw';

const TILES: Record<MapStyle, { url: string; options: L.TileLayerOptions }> = {
  street: {
    url: `https://map.ir/shiveh/xyz/1.0.0/Shiveh:Shiveh@EPSG:3857@png/{z}/{x}/{y}.png?x-api-key=${MAPIR_KEY}`,
    options: { maxZoom: 19, attribution: '© map.ir' },
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    options: { maxZoom: 19, attribution: '© Esri' },
  },
};

export const TEHRAN: L.LatLngTuple = [35.7152, 51.35];

/** Creates a lightweight Leaflet map tuned for mobile. */
export const createMap = (el: HTMLElement, center: L.LatLngExpression = TEHRAN, zoom = 11) => {
  const map = L.map(el, {
    zoomControl: false,
    attributionControl: false,
    preferCanvas: true,
    fadeAnimation: false,
    zoomSnap: 0.5,
    tapTolerance: 20,
  }).setView(center, zoom);

  // Ionic pages/modals animate in, so the container size changes after mount.
  const ro = new ResizeObserver(() => map.invalidateSize({ pan: false }));
  ro.observe(el);
  map.on('unload', () => ro.disconnect());

  return map;
};

export const setMapStyle = (map: L.Map, style: MapStyle, current?: L.TileLayer | null): L.TileLayer => {
  if (current) map.removeLayer(current);
  const t = TILES[style];
  return L.tileLayer(t.url, { ...t.options, keepBuffer: 4, updateWhenIdle: false }).addTo(map);
};

export type GeoResult = { lat: number; lng: number };

export const geoErrorMessage = (err: unknown) => {
  const code = (err as GeolocationPositionError | undefined)?.code;
  if (code === 1) return 'دسترسی به موقعیت مکانی رد شد. از تنظیمات مرورگر اجازه دهید.';
  if (code === 3) return 'دریافت موقعیت طول کشید. دوباره تلاش کنید.';
  if (!navigator.geolocation) return 'این دستگاه از موقعیت‌یابی پشتیبانی نمی‌کند.';
  return 'موقعیت مکانی در دسترس نیست. GPS را روشن کنید.';
};

export const getCurrentPosition = (): Promise<GeoResult> =>
  new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('unsupported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      reject,
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  });

export const directionsUrl = (lat: number, lng: number) =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Minimal pill marker: colored dot + short name. */
export const customerPin = (name: string, color: string, active = false) =>
  L.divIcon({
    className: '',
    html: `<div class="ario-pin${active ? ' is-active' : ''}"><i style="background:${color}"></i><span>${escapeHtml(
      name,
    )}</span></div>`,
    iconSize: undefined,
    iconAnchor: [0, 0],
  });

export const locationPin = () =>
  L.divIcon({
    className: '',
    html: '<div class="ario-drop"><i></i></div>',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
  });
