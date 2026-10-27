const CACHE = 'vistori-0.4.4';
const SHELL = ['./', 'index.html', 'style.css', 'responsive.css', 'app.js?v=0.4.4', 'firebase-config.js', 'manifest.webmanifest', 'logo.png', 'logo-emblema.png', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Só intercepta o próprio app e o SDK do Firebase (CDN gstatic). Chamadas à API do Firebase passam direto.
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  const meu = u.origin === location.origin;
  const sdk = u.hostname === 'www.gstatic.com' && u.pathname.startsWith('/firebasejs/');
  if (!meu && !sdk) return;
  e.respondWith(
    caches.match(r).then(hit => hit || fetch(r).then(res => {
      if (res.ok) { const c = res.clone(); caches.open(CACHE).then(ch => ch.put(r, c)); }
      return res;
    }).catch(() => meu ? caches.match('index.html') : Response.error()))
  );
});
