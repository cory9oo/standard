const C='ht-v9';
self.addEventListener('install',e=>{self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const r=e.request; if(r.method!=='GET') return;
  const u=new URL(r.url);
  if(u.origin!==location.origin) return;
  e.respondWith(
    fetch(r,{cache:'no-cache'}).then(res=>{
      if(res&&res.status===200){const c=res.clone();caches.open(C).then(k=>k.put(r,c));}
      return res;
    }).catch(()=>caches.match(r))
  );
});
