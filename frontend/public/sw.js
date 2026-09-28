const VERSION = 'ario-v6';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const API_CACHE = `${VERSION}-api`;

const SHELL = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Map tiles: cache-first so previously viewed areas load instantly and offline.
  if (/basemaps\.cartocdn\.com|tile\.openstreetmap\.org|arcgisonline\.com/.test(url.hostname)) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }

  if (url.origin !== self.location.origin) return;

  // API: always try network, fall back to last good response when offline.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  // Page navigations (SPA): network first, then cached shell, then offline page.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put('/index.html', copy));
          return res;
        })
        .catch(async () => (await caches.match('/index.html')) || caches.match('/offline.html')),
    );
    return;
  }

  // Hashed build assets, fonts, icons: cache-first.
  if (/\.(js|css|woff2?|png|svg|jpg|webp|ico)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
  }
});

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok || res.type === 'opaque') {
    const cache = await caches.open(cacheName);
    cache.put(request, res.clone());
  }
  return res;
}

async function networkFirst(request, cacheName) {
  try {
    const res = await fetch(request);
    if (res.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, res.clone());
    }
    return res;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw err;
  }
}
