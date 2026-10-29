const CACHE = 'vistori-0.18.0';
// O app é dividido em módulos em src/. Todos entram no precache: sem isso, a
// primeira abertura offline (antes de o service worker controlar a página)
// falharia ao importar um módulo que ainda não está no cache.
const MODULOS = [
  'src/main.js',
  'src/boot.js',
  'src/router.js',
  'src/core/auditoria.js',
  'src/core/checklist.js',
  'src/core/config.js',
  'src/core/db/cloud.js',
  'src/core/db/index.js',
  'src/core/db/local.js',
  'src/core/docs.js',
  'src/core/dom.js',
  'src/core/fotos.js',
  'src/core/laudo.js',
  'src/core/lixeira.js',
  'src/core/migracao.js',
  'src/core/navigate.js',
  'src/core/state.js',
  'src/core/tipos.js',
  'src/core/utils.js',
  'src/ui/chrome.js',
  'src/ui/events.js',
  'src/views/agenda.js',
  'src/views/auditoria.js',
  'src/views/backup.js',
  'src/views/cadastros.js',
  'src/views/checklist.js',
  'src/views/configuracoes.js',
  'src/views/dashboard.js',
  'src/views/documentos.js',
  'src/views/financeiro.js',
  'src/views/laudo.js',
  'src/views/lgpd.js',
  'src/views/lixeira.js',
  'src/views/login.js',
  'src/views/modelos.js',
  'src/views/orcamentos.js',
  'src/views/usuarios.js',
  'src/views/vistoria.js',
  'src/views/vistorias.js'
];
const SHELL = [
  './', 'index.html', 'style.css', 'responsive.css', 'app.js?v=0.18.0', 'firebase-config.js',
  'manifest.webmanifest', 'logo.png', 'logo-emblema.png', 'icon-192.png', 'icon-512.png',
  ...MODULOS
];

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
