// Service Worker: macht die App offline nutzbar.
// Erst Netzwerk (damit Updates sofort ankommen), bei fehlender Verbindung aus dem Cache.
const CACHE = 'babytracker-v8';
const FILES = ['./', 'index.html', 'advice.js', 'photos.js', 'growth.js', 'features.js', 'stoolcam.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, {cache:'reload'})))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  // Firebase-Bibliothek (versioniert, ändert sich nie): einmal laden, danach aus dem Cache – auch offline
  if (req.method === 'GET' && url.origin === 'https://www.gstatic.com' && url.pathname.startsWith('/firebasejs/')){
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok){ const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    })));
    return;
  }
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  // cache:'no-cache' = immer beim Server nachfragen (kein veralteter Browser-Cache → HTML und Skripte passen zusammen)
  e.respondWith(
    fetch(req, {cache:'no-cache'}).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, {ignoreSearch: true}).then(r => r || caches.match('./')))
  );
});
