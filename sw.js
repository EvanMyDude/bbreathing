const CACHE_NAME = 'breathe-v8';
const ASSETS = [
  './',
  './TriBoxBreathing.html',
  './manifest.json',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  './audio/breathe-out.mp3',
  './audio/inhale.mp3',
  './audio/hold.mp3',
  './audio/exhale.mp3',
  './audio/session-complete.mp3'
];

// How long a page load waits on the network before falling back to the cached page
const NETWORK_TIMEOUT_MS = 3000;

// Install: pre-cache all static assets (bypassing the HTTP cache so a new
// version never precaches a stale page)
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  // Skip non-GET requests and cross-origin requests (e.g., Google Fonts)
  if (event.request.method !== 'GET') return;

  // For Google Fonts, use stale-while-revalidate
  if (event.request.url.includes('fonts.googleapis.com') ||
      event.request.url.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(event.request).then(cached => {
          const fetched = fetch(event.request).then(response => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          }).catch(() => cached);
          return cached || fetched;
        })
      )
    );
    return;
  }

  // For the page itself, network-first so a new deploy shows up on the next launch
  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirst(event));
    return;
  }

  // For other local assets, cache-first
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});

function networkFirst(event) {
  const fromCache = () => caches.match(event.request, { ignoreSearch: true });

  // no-cache revalidates with the server instead of trusting the HTTP cache's max-age
  const network = fetch(event.request.url, { cache: 'no-cache' }).then(response => {
    if (response.ok) {
      const copy = response.clone();
      const update = caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      // Throws if the cached page already answered and the event has ended; the update still runs
      try { event.waitUntil(update); } catch {}
    }
    return response;
  });
  network.catch(() => {});

  // On a slow connection, serve the cached page rather than a blank screen
  const slowNetwork = new Promise(resolve => setTimeout(resolve, NETWORK_TIMEOUT_MS))
    .then(fromCache)
    .then(cached => cached || network);

  return Promise.race([network, slowNetwork])
    .catch(() => fromCache().then(cached => cached || Response.error()));
}
