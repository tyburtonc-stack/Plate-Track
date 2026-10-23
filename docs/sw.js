// CACHE_NAME is stamped with a content hash by build.js, so every deploy installs a fresh cache.
const CACHE_NAME = 'platetrack-67ad282c42';
const URLS_TO_CACHE = [
  '/Plate-Track/',
  '/Plate-Track/pt.css',
  '/Plate-Track/manifest.json',
  '/Plate-Track/assets/logo.png',
  '/Plate-Track/assets/touch-icon.png'
];

self.addEventListener('install', event => {
  // Cache files one by one so a single missing file doesn't abort the install.
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.all(URLS_TO_CACHE.map(url => cache.add(url).catch(() => {})))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    // Network first for the app page so updates show up on the next open; cache when offline.
    event.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put('/Plate-Track/', copy));
        return res;
      }).catch(() => caches.match('/Plate-Track/'))
    );
    return;
  }
  event.respondWith(caches.match(req).then(cached => cached || fetch(req)));
});
