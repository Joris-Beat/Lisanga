/* Lisanga — Service worker : l'application s'ouvre même avec une connexion faible.
   Changez VERSION à chaque mise à jour pour forcer le rafraîchissement. */
const VERSION='lisanga-v1.0.0';
const FILES=['./','index.html','config.js','css/style.css','manifest.webmanifest','img/icon.svg',
  'js/core/utils.js','js/core/brand.js','js/core/db.js','js/core/crypto.js','js/core/media.js','js/core/auth.js','js/core/social.js','js/core/calls.js','js/core/app.js','js/core/demo.js',
  'js/tabs/chat.js','js/tabs/star.js','js/tabs/fun.js','js/tabs/publique.js','js/tabs/ia.js','js/tabs/profile.js'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(VERSION).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
/* Réseau d'abord (toujours la dernière version), cache en secours. Seuls nos propres fichiers sont mis en cache. */
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==location.origin)return;
  e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(VERSION).then(x=>x.put(e.request,c));return r}).catch(()=>caches.match(e.request).then(r=>r||caches.match('index.html'))));
});
