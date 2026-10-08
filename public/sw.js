import { precacheAndRoute } from 'workbox-precaching';

// The app shell (JS, CSS, HTML, webmanifest), precached from the Vite build
// (self.__WB_MANIFEST is injected by vite-plugin-pwa).
precacheAndRoute(self.__WB_MANIFEST || []);

/* Everything else the game uses (recordings, models, textures) is kept in one cache that
   survives updates (src/core/offline.ts: keep the name equal). Kept files are served first, on
   line or off, so a downloaded game uses no data for them. While you play on line, what you meet
   is kept as you go, so nothing is fetched twice. Audio played through a media element asks for
   pieces of the file (a Range request): a kept file answers with exactly that piece, as Safari
   on the iPhone requires, or it would not play from the cache at all. */
const CACHE = 'inward-journey-assets';
const KEEP = /\/(audio|models|textures)\//;

async function fromCache(request) {
  const cache = await caches.open(CACHE);
  return (await cache.match(request, { ignoreSearch: true })) || (await caches.match(request, { ignoreSearch: true }));
}

/** The piece of a kept file a Range request asks for (206), or the whole file. */
async function ranged(request, response) {
  const range = request.headers.get('range');
  if (!range) return response;
  const m = /bytes=(\d*)-(\d*)/.exec(range);
  if (!m) return response;
  // a blob is sliced without reading the whole file into memory (a long recording is ~100 MB)
  const blob = await response.blob();
  const size = blob.size;
  let start = m[1] === '' ? size - Number(m[2]) : Number(m[1]);
  let end = m[1] === '' ? size - 1 : m[2] === '' ? size - 1 : Number(m[2]);
  start = Math.max(0, start);
  end = Math.min(size - 1, end);
  if (start > end || start >= size) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  const headers = new Headers(response.headers);
  headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
  headers.set('Content-Length', String(end - start + 1));
  headers.set('Accept-Ranges', 'bytes');
  return new Response(blob.slice(start, end + 1), { status: 206, statusText: 'Partial Content', headers });
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  if (!request.url.startsWith(self.location.origin)) return;
  // `?fresh=` asks the server itself (the offline download, the list of files)
  if (new URL(request.url).searchParams.has('fresh')) return;

  event.respondWith((async () => {
    const hit = await fromCache(request);
    if (hit) return ranged(request, hit);
    try {
      const response = await fetch(request);
      // kept as you go: whole files only (a piece of one can't stand for it)
      if (response.status === 200 && KEEP.test(new URL(request.url).pathname) && !request.headers.has('range')) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE).then((c) => c.put(request.url.split('?')[0], copy)).catch(() => undefined));
      }
      return response;
    } catch (err) {
      console.error('Fetch failed (offline or network error):', request.url, err);
      return new Response(null, { status: 503, statusText: 'Service Unavailable' });
    }
  })());
});

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
