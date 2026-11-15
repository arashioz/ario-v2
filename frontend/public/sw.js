/* Ario service worker: app shell + static assets only.
 * Authenticated API responses are never cached — the app keeps its own opt-in
 * localStorage cache in src/services/offlineCache.ts, scoped per user.
 * Bump CACHE_VERSION on every release; old caches are deleted on activate. */
const CACHE_VERSION = 'v1';
const SHELL_CACHE = `ario-shell-${CACHE_VERSION}`;
const ASSET_CACHE = `ario-assets-${CACHE_VERSION}`;
const OFFLINE_URL = '/offline.html';

const SHELL_ASSETS = ['/', '/index.html', '/offline.html', '/icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .catch(() => undefined),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const keep = [SHELL_CACHE, ASSET_CACHE];
    await Promise.all(keys.filter((key) => !keep.includes(key)).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

const isAsset = (url) =>
  url.origin === self.location.origin &&
  (url.pathname.startsWith('/assets/') ||
    /\.(?:js|css|woff2?|ttf|png|jpg|jpeg|svg|webp|ico)$/.test(url.pathname));

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never touch API traffic, auth or anything carrying credentials.
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/uploads')) return;
  if (request.headers.get('authorization')) return;

  // Navigations: network first so a new build is picked up, shell cache as offline fallback.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(SHELL_CACHE);
        cache.put('/index.html', fresh.clone()).catch(() => undefined);
        return fresh;
      } catch {
        const cache = await caches.open(SHELL_CACHE);
        return (await cache.match('/index.html')) || (await cache.match(OFFLINE_URL)) || Response.error();
      }
    })());
    return;
  }

  // Hashed build assets are immutable: cache first, then network.
  if (isAsset(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(ASSET_CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const fresh = await fetch(request);
        if (fresh.ok) cache.put(request, fresh.clone()).catch(() => undefined);
        return fresh;
      } catch {
        return cached || Response.error();
      }
    })());
  }
});
