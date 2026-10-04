const C = 'jadawli-v1';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'css/fonts.css', 'css/app.css', 'js/sortable.min.js', 'js/db.js', 'js/app.js',
  'icons/icon-192.png', 'icons/icon-512.png',
  ...['arabic', 'latin'].flatMap(s => [400, 500, 700].map(w => `fonts/tajawal-${s}-${w}-normal.woff2`))];
self.addEventListener('install', e => e.waitUntil(caches.open(C).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== C).map(x => caches.delete(x))))));
self.addEventListener('fetch', e => e.respondWith(caches.match(e.request).then(r => r || fetch(e.request))));
