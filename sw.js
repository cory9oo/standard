/* STANDARD - service worker.

   NETWORK-FIRST, deliberately. The first version of this file was cache-first,
   which is correct for a finished app and wrong for one under active development:
   it pinned every installed phone to the first build forever. Anyone who had
   installed it would never see another fix.

   Now: always try the network, fall back to cache only when offline. The app
   stays usable on a plane and still updates the moment there is signal. */
const CACHE = 'standard-v4';
/* Only the entry points are pre-cached. Every script and stylesheet now carries
   a ?v= stamp that changes with its contents, so they are cached at runtime under
   URLs that can never collide across versions. */
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.hostname.endsWith('supabase.co')) return;   // never cache data
  if (url.origin !== self.location.origin) return;    // let the CDN handle its own

  e.respondWith(
    /* cache: 'no-cache' revalidates with the server instead of quietly
       accepting whatever the browser's HTTP cache is holding. Without it a
       fresh index.html could load a ten-minute-old app.js - two versions of
       the app running in the same page, which is worse than either. */
    fetch(e.request, { cache: 'no-cache' })
      .then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then(hit => hit || caches.match('./index.html')))
  );
});

/* Lets the page tell a waiting worker to take over immediately. */
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('push', e => {
  let d = { title: 'STANDARD', body: 'Log your day.' };
  try { if (e.data) d = Object.assign(d, e.data.json()); } catch (_) {}
  e.waitUntil(self.registration.showNotification(d.title, {
    body: d.body, icon: './icon-192.png', badge: './icon-192.png',
    tag: d.tag || 'standard-daily', renotify: true, data: { url: d.url || './' }
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
    for (const w of ws) if ('focus' in w) return w.focus();
    return clients.openWindow(target);
  }));
});
