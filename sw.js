/* Sakina – Service Worker (offline) */
const VERSION = 'sakina-v6';
const FONTS = [
  'amiri-arabic-400-normal', 'amiri-arabic-700-normal', 'amiri-latin-400-normal', 'amiri-latin-700-normal',
  'fraunces-latin-500-normal', 'fraunces-latin-700-normal',
  'nunito-latin-400-normal', 'nunito-latin-600-normal', 'nunito-latin-700-normal', 'nunito-latin-800-normal', 'nunito-latin-400-italic',
].map(f => `./fonts/${f}.woff2`);
const CORE = ['./', './index.html', './style.css', './app.js', './sync.js', './data.js', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png', './fonts.css', ...FONTS];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin !== location.origin) return; // KI-Anfragen usw. normal übers Netz
  if (url.pathname.includes('/api/')) return;   // Server-Sicherung nie cachen

  // App-Dateien: erst Netz (damit Updates ankommen), sonst Cache
  e.respondWith(
    fetch(req).then(r => { if (r.ok) caches.open(VERSION).then(c => c.put(req, r.clone())); return r; })
      .catch(async () => (await caches.match(req)) || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()))
  );
});
