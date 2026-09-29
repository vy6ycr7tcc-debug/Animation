import { precacheAndRoute } from 'workbox-precaching';

// Precaches app shell (JS, CSS, HTML, Webmanifest) automatically based on Vite build.
// self.__WB_MANIFEST is injected by vite-plugin-pwa.
precacheAndRoute(self.__WB_MANIFEST || []);

// We don't intercept other fetches for precaching since the offline manager will cache them manually
// into a separate Cache Storage. The service worker just needs to intercept fetches and serve from cache if offline.

self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin)) return;

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((response) => {
      if (response) {
        return response; // Return from precache or asset cache
      }
      // Not in cache, try network
      return fetch(event.request).catch((err) => {
        // If offline and not in cache, let it fail gracefully rather than unhandled rejection if we didn't catch it
        console.error("Fetch failed (offline or network error):", event.request.url, err);
        return new Response(null, { status: 503, statusText: 'Service Unavailable' });
      });
    })
  );
});

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
