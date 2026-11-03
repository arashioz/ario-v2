import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

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

export const createMap = (el: HTMLElement, center: L.LatLngExpression = TEHRAN, zoom = 11) => {
  const map = L.map(el, {
    zoomControl: false,
    attributionControl: false,
    preferCanvas: true,
    fadeAnimation: false,
    zoomSnap: 0.5,
    tapTolerance: 20,
  }).setView(center, zoom);

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

const remember = (point: GeoResult) => {
  try {
    localStorage.setItem('ario.lastGeo', JSON.stringify(point));
  } catch {
    /* ignore */
  }
};

export const lastKnownPosition = (): GeoResult | null => {
  try {
    const raw = JSON.parse(localStorage.getItem('ario.lastGeo') || 'null');
    const lat = Number(raw?.lat);
    const lng = Number(raw?.lng);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  } catch {
    return null;
  }
};

export const geoErrorMessage = (err: unknown) => {
  if (err instanceof Error && err.message && err.message !== 'unsupported') return err.message;
  const code = (err as GeolocationPositionError | undefined)?.code;
  if (code === 1) {
    return window.isSecureContext
      ? 'اجازه موقعیت داده نشد. کنار آدرس سایت Location را Allow کنید، GPS را روشن کنید، بعد دوباره بزنید.'
      : 'مرورگر روی http لوکیشن نمی‌دهد. سایت را با https باز کنید، یا در نصب اپ دسترسی موقعیت را بدهید. فعلاً پین را روی نقشه بگذارید.';
  }
  if (code === 3) return 'دریافت موقعیت طول کشید. GPS را روشن کنید و دوباره بزنید.';
  if (!navigator.geolocation) return 'این دستگاه موقعیت‌یابی ندارد. پین را روی نقشه بگذارید.';
  return 'موقعیت پیدا نشد. GPS را روشن کنید، اجازه بدهید، یا پین را روی نقشه بگذارید.';
};

const fromCoords = (pos: GeolocationPosition): GeoResult => ({
  lat: pos.coords.latitude,
  lng: pos.coords.longitude,
});

const readBrowser = (high: boolean) =>
  new Promise<GeoResult>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('این دستگاه موقعیت‌یابی ندارد. پین را روی نقشه بگذارید.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(fromCoords(pos)),
      reject,
      { enableHighAccuracy: high, timeout: high ? 25000 : 12000, maximumAge: high ? 0 : 60000 },
    );
  });

const watchOnce = (ms = 8000) =>
  new Promise<GeoResult>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('این دستگاه موقعیت‌یابی ندارد. پین را روی نقشه بگذارید.'));
      return;
    }
    let done = false;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        if (done) return;
        done = true;
        navigator.geolocation.clearWatch(id);
        resolve(fromCoords(pos));
      },
      (err) => {
        if (done) return;
        done = true;
        navigator.geolocation.clearWatch(id);
        reject(err);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: ms },
    );
    window.setTimeout(() => {
      if (done) return;
      done = true;
      navigator.geolocation.clearWatch(id);
      reject(Object.assign(new Error('timeout'), { code: 3 }));
    }, ms);
  });

const readCapacitor = async (): Promise<GeoResult | null> => {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; Plugins?: { Geolocation?: { getCurrentPosition: (opts: object) => Promise<{ coords: { latitude: number; longitude: number } }> } } } }).Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  const geo = cap.Plugins?.Geolocation;
  if (!geo) return null;
  const pos = await geo.getCurrentPosition({ enableHighAccuracy: true, timeout: 20000 });
  return { lat: pos.coords.latitude, lng: pos.coords.longitude };
};

/** Must be called from a tap so the browser shows the permission dialog. */
export const getCurrentPosition = async (): Promise<GeoResult> => {
  let permission: PermissionState | undefined;
  try {
    permission = (await navigator.permissions?.query({ name: 'geolocation' as PermissionName })).state;
  } catch {
    /* Safari has no geolocation permission query */
  }
  if (permission === 'denied') {
    throw Object.assign(new Error(geoErrorMessage({ code: 1 })), { code: 1 });
  }
  try {
    const native = await readCapacitor();
    if (native) {
      remember(native);
      return native;
    }
  } catch {
    /* fall through to the browser GPS */
  }
  const errors: unknown[] = [];
  for (const step of [() => readBrowser(true), () => readBrowser(false), () => watchOnce()]) {
    try {
      const point = await step();
      remember(point);
      return point;
    } catch (err) {
      errors.push(err);
      if ((err as GeolocationPositionError | undefined)?.code === 1) throw err;
    }
  }
  throw errors[0];
};

export const directionsUrl = (lat: number, lng: number) =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

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
