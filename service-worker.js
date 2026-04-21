// PEAK Service Worker
// ════════════════════════════════════════════════════════════════════════
// Strategy:
//  - HTML: network-first, fall back to cache (keep app up-to-date)
//  - Static assets (icons, manifest): cache-first (performance)
//  - API calls: always network (dynamic data must be fresh)
//  - Offline: if network fails entirely → serve cached index.html
//
// Bump CACHE_VERSION when deploying to force old clients to refresh.
// ════════════════════════════════════════════════════════════════════════

const CACHE_VERSION = 'peak-v3';
const RUNTIME_CACHE = 'peak-runtime-v3';

// Core files to pre-cache on install (app shell)
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      // Pre-cache silently — don't block install if something fails
      return Promise.allSettled(
        PRECACHE_URLS.map((url) => cache.add(url).catch((err) => {
          console.warn('[SW] Precache failed for', url, err);
        }))
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET, chrome-extension://, etc.
  if (request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  // Never cache auth or API calls — always go to network
  if (
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('peak-backend') ||
    url.hostname.includes('anthropic.com') ||
    url.hostname.includes('stripe.com')
  ) {
    return; // Let browser handle normally, no SW intervention
  }

  // HTML navigation: network-first
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Store fresh copy in runtime cache
          const copy = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => {
          // Offline: try cache, fall back to index
          return caches.match(request).then((cached) => cached || caches.match('/index.html'));
        })
    );
    return;
  }

  // Static assets: cache-first
  if (
    request.destination === 'image' ||
    request.destination === 'style' ||
    request.destination === 'script' ||
    request.destination === 'font' ||
    url.pathname === '/manifest.json'
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          // Only cache successful responses of same origin
          if (response.ok && url.origin === self.location.origin) {
            const copy = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      })
    );
    return;
  }

  // Default: network, fall back to cache
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});

// Receive messages from the page (e.g. to force update)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
