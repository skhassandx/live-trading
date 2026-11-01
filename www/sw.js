// Service worker: অ্যাপ শেল ক্যাশ করে, API/WebSocket কখনো ক্যাশ করে না
const CACHE = 'krypto-v4.1.0';
const SHELL = ['./', './index.html', './css/style.css', './js/config.js', './js/indicators.js', './js/store.js', './js/app.js', './js/lib/lightweight-charts.js', './icon-192.png', './icon-512.png', './manifest.json', './icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.hostname.includes('binance')) return; // লাইভ ডেটা সরাসরি নেটওয়ার্ক থেকে
  e.respondWith(
    fetch(e.request).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request))
  );
});
