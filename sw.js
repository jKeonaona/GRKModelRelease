// Cache name and files to cache
const CACHE_NAME = 'wildpx-release-v8';
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/app-v1.js',
  'Backgroundimage.png' // Add the actual path to your background image
];

// Install event: cache files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// Activate event: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
});

// Fetch event: serve from cache or fetch from network
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Return cached response if available, otherwise fetch from network
        return response || fetch(event.request).then((networkResponse) => {
          // Update cache with new response
          if (networkResponse.status === 200) {
            const clonedResponse = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, clonedResponse);
            });
          }
          return networkResponse;
        }).catch(() => {
          // Return cached response or a fallback if offline
          return caches.match('/index.html');
        });
      })
  );
});