'use strict';
// Increment on every application-shell release.
const CACHE_PREFIX = 'split-shell-';
const CACHE_NAME = `${CACHE_PREFIX}v4.1.0`;
const SHELL = ['./','./index.html','./style.css','./core.js','./history.js','./items-core.js','./items-ui.js','./script.js','./pwa.js','./manifest.json','./icons/icon-192.png','./icons/icon-512.png','./icons/maskable-512.png','./icons/apple-touch-icon.png'];
const shellURLs = new Set(SHELL.map(path => new URL(path,self.location).href));
self.addEventListener('install',event => {
 event.waitUntil((async () => {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(SHELL.map(path => new Request(new URL(path,self.location),{cache:'reload'})));
 })());
});
self.addEventListener('message',event => { if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting()); });
self.addEventListener('activate',event => {
 event.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)));
  await caches.delete('split-app-v1');
  await self.clients.claim();
 })());
});
self.addEventListener('fetch',event => {
 const request = event.request, url = new URL(request.url);
 if (request.method !== 'GET' || url.origin !== self.location.origin) return;
 if (request.mode !== 'navigate' && !shellURLs.has(url.href)) return;
 event.respondWith((async () => {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request.mode === 'navigate' ? new URL('./index.html',self.location).href : request);
  return cached || fetch(request);
 })());
});
