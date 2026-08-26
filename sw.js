/* STANDARD - service worker.
   Two jobs: keep the shell instantly available offline, and receive push.
   Shell = cache-first (instant paint). API = never cached: truth lives on the
   server, and a stale checkbox is worse than a spinner. */
const SHELL = 'standard-shell-v1';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== SHELL).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;              // never cache writes
  if (url.hostname.endsWith('supabase.co')) return;     // never cache data
  if (url.origin !== self.location.origin) return;     // let the CDN handle Chart.js
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(SHELL).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match('./index.html'))));
});

/* Push - the whole reason this file has to exist on an origin we control.
   Apps Script cannot register a service worker, so it can never send a reminder. */
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
