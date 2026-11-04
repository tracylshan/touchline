// Keeps the app opening at fields with weak signal.
// Always asks the server for the latest app first (bypassing the browser's short-term cache),
// and falls back to the saved copy only when offline.
const CACHE='touchline-v2';
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['./','index.html','manifest.webmanifest','icon-180.png'].map(u=>new Request(u,{cache:'reload'})))).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET')return;
  const mine=u.origin===location.origin, fonts=/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname);
  if(!mine&&!fonts)return; // calendar feeds always go straight to the network
  const req=mine?new Request(e.request,{cache:'no-cache'}):e.request;
  e.respondWith(fetch(req).then(r=>{if(r.ok||r.type==='opaque'){const c=r.clone();caches.open(CACHE).then(x=>x.put(e.request,c));}return r;})
    .catch(()=>caches.match(e.request,{ignoreSearch:mine}).then(r=>r||caches.match('./'))));
});
