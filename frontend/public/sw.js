const VERSION = 'ario-v9';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;

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

  // Session verification must never succeed using a cached profile.
  if (/\/auth(?:\/|$)/.test(url.pathname)) {
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }

  // Map tiles: cache-first so previously viewed areas load instantly and offline.
  if (/basemaps\.cartocdn\.com|tile\.openstreetmap\.org|arcgisonline\.com/.test(url.hostname)) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Private snapshots are stored per user by the app, never shared in the worker.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request));
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
