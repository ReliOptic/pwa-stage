// Original, scope-local offline cache — MIT.
const CACHE = 'field-notes-original-v1';
const FILES = ['./reference.html', './studio.css', './studio.js', './manifest.json', './icon.png'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES))));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request).then(cached => cached || Response.error())));
});
