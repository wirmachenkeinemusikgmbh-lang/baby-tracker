// Service Worker: macht die App offline nutzbar.
// Erst Netzwerk (damit Updates sofort ankommen), bei fehlender Verbindung aus dem Cache.
const CACHE = 'babytracker-v12';
const FILES = ['./', 'index.html', 'i18n.js', 'app.js', 'advice.js', 'photos.js', 'growth.js', 'features.js', 'stoolcam.js', 'quick.js', 'manifest.webmanifest',
  'lang/en.js', 'lang/es.js', 'lang/tr.js', 'lang/pl.js', 'lang/ru.js', 'lang/uk.js', 'lang/ar.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/badge-96.png'];

/* ---------- Schnellerfassung über die Mitteilung (Android) ----------
   Knopfdruck → Aktion mit Zeitstempel in IndexedDB merken → Mitteilung bestätigt kurz.
   Die App übernimmt die Einträge beim nächsten Öffnen (oder sofort, wenn sie offen ist). */
const QUICK_TXT = {diaper_wet:'💧 Windel nass', diaper_stool:'💩 Windel Stuhl', night:'🌙 Nachtschlaf', nap:'😴 Nickerchen'};
function quickDb(){
  return new Promise((res, rej) => {
    const r = indexedDB.open('babytracker-quick', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('q', {keyPath:'id'});
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function quickAdd(item){
  const db = await quickDb();
  return new Promise((res, rej) => { const tx = db.transaction('q', 'readwrite'); tx.objectStore('q').put(item); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
}
async function openApp(){
  const list = await self.clients.matchAll({type:'window', includeUncontrolled:true});
  const own = list.find(c => new URL(c.url).pathname.startsWith(new URL(self.registration.scope).pathname));
  return own ? own.focus() : self.clients.openWindow(self.registration.scope);
}
self.addEventListener('notificationclick', e => {
  const n = e.notification, action = e.action, data = n.data || {};
  if (!action || n.tag !== 'quick'){ n.close(); e.waitUntil(openApp()); return; }
  e.waitUntil((async () => {
    const ts = Date.now(), t = new Date(ts);
    await quickAdd({id: ts.toString(36) + Math.random().toString(36).slice(2, 6), action, ts, baby: data.baby});
    const hm = String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0');
    await self.registration.showNotification(n.title, {
      // Texte kommen in der Sprache der App aus data (siehe quick.js), Deutsch als Rückfall
      body: `✓ ${(data.labels && data.labels[action]) || QUICK_TXT[action] || action} ${data.saved || 'gespeichert'} (${hm}) · ${data.name || 'Baby'}`,
      tag:'quick', renotify:false, silent:true, requireInteraction:true,
      icon:'icons/icon-192.png', badge:'icons/badge-96.png', actions:n.actions, data
    });
    const clients = await self.clients.matchAll({type:'window', includeUncontrolled:true});
    clients.forEach(c => c.postMessage({type:'quick'}));
  })());
});

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
