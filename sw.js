/* Service worker: чтобы курс открывался как приложение и читался без сети.
   Стратегия: сначала сеть (всегда свежая версия после обновления сайта), при отсутствии сети — кэш. API (/api/) не кэшируется никогда. */
const CACHE = 'seo-teacher-v4';
const CORE = ['./', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'js/markdown.js', 'js/store.js', 'js/tools.js', 'js/app.js', 'js/views.js', 'js/auth.js', 'js/admin.js', 'js/ai.js', 'js/boot.js',
  'data/glossary.js', 'data/checklists.js', ...Array.from({ length: 11 }, (_, i) => `data/module-${i + 1}.js`),
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(CORE.map(u => c.add(u)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request; const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/')) return;
  e.respondWith(
    fetch(req).then(res => {
      if (res && res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});
