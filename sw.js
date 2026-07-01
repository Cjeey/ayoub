/* Reckon service worker — offline-first shell cache. */
const CACHE = 'reckon-v6';
const ASSETS = [
  './',
  './index.html',
  './app.css',
  './script.js',
  './manifest.json',
  './icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Never cache external APIs (FX rate, Supabase auth/data/functions, Gemini).
  if (url.hostname.includes('er-api.com') || url.hostname.includes('supabase.co') || url.hostname.includes('googleapis.com')) return;
  // App shell: cache-first. Everything else: network falling back to cache.
  if (url.origin === location.origin) {
    e.respondWith(caches.match(request).then((hit) => hit || fetch(request)));
  } else {
    e.respondWith(fetch(request).catch(() => caches.match(request)));
  }
});
