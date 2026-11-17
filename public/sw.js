/* Adapted from UltraMax 7 Pro's app-shell caching. The API is always network-only. */
const version='hoodspot-shell-v3';
const files=['/','/styles.css','/app.js','/icons.js','/product-photos.js','/pwa.js','/logo.svg','/icon-192.png','/icon-512.png','/icon-maskable.png','/manifest.webmanifest'];
const productPhotos=['castle-lager','zambezi-lager','carling-black-label','lion-lager','hunters-gold','savanna-dry','jameson','gordons-gin','coca-cola','sprite','tonic-water','still-water'].map(name=>'/products/'+name+'.webp');
const offlineAssets=[...files,...productPhotos];
self.addEventListener('install', e=>e.waitUntil(caches.open(version).then(cache=>cache.addAll(offlineAssets))));
self.addEventListener('activate', e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('hoodspot-shell-')&&k!==version).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('message',e=>{if(e.data?.type==='SKIP_WAITING') self.skipWaiting()});
self.addEventListener('fetch',e=>{
  const {request}=e,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==location.origin||url.pathname.startsWith('/api/')) return;
  if(request.mode==='navigate') return e.respondWith(fetch(request).catch(()=>caches.match('/')));
  if(offlineAssets.includes(url.pathname)) e.respondWith(caches.match(request).then(c=>c||fetch(request)));
});
