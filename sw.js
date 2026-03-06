// sw.js
const CACHE_NAME = 'split-app-v1';
const urlsToCache = [
  './index.html',  // или './SPLIT.html' если не переименовал
  // Добавь сюда любые внешние ресурсы, если появятся (пока всё inline)
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit — return response
        if (response) {
          return response;
        }
        return fetch(event.request).catch(() => {
          // Если сеть упала — верни из кэша (fallback на index)
          return caches.match('./index.html');
        });
      })
  );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});