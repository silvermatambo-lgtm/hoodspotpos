/* Adapted from UltraMax 7 Pro's app-shell caching. The API is always network-only. */
const version='hoodspot-shell-v1';
const files=['/','/styles.css','/app.js','/icons.js','/pwa.js','/logo.svg','/icon-192.png','/icon-512.png','/icon-maskable.png','/manifest.webmanifest'];
self.addEventListener('install', e=>e.waitUntil(caches.open(version).then(cache=>cache.addAll(files))));
self.addEventListener('activate', e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('hoodspot-shell-')&&k!==version).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('message',e=>{if(e.data?.type==='SKIP_WAITING') self.skipWaiting()});
self.addEventListener('fetch',e=>{
  const {request}=e,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==location.origin||url.pathname.startsWith('/api/')) return;
  if(request.mode==='navigate') return e.respondWith(fetch(request).catch(()=>caches.match('/')));
  if(files.includes(url.pathname)) e.respondWith(caches.match(request).then(c=>c||fetch(request)));
});
