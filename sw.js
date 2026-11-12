const CACHE = 'cyanogram-v9';
const ASSETS = ['./', 'index.html', 'style.css', 'js/app.js', 'js/gl.js', 'js/presets.js', 'js/exif.js', 'js/cloud.js', 'js/vendor/supabase.js', 'js/vendor/mp4-muxer.js',
  'manifest.webmanifest', 'icons/favicon.svg', 'icons/favicon-32.png', 'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// réseau d'abord (toujours la dernière version), cache en secours hors-ligne
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => {
    const copy = r.clone();
    caches.open(CACHE).then(c => c.put(e.request, copy));
    return r;
  }).catch(() => caches.match(e.request)));
});
