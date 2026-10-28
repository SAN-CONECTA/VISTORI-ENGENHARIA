// Inicialização: carrega o SDK, escolhe o backend e reage ao login.
import { MODO, SDK_VERSIONS, VERSION } from './core/config.js';
import { F, auth, setBackend, setFirebase, setUser } from './core/state.js';
import { $, app, esc } from './core/dom.js';
import { L } from './core/db/local.js';
import { makeCloud } from './core/db/cloud.js';
import { userBox } from './ui/chrome.js';
import { mostrarLogin } from './views/login.js';
import { render } from './router.js';

async function carregarSDK() {
  let ultimo;
  for (const v of SDK_VERSIONS) {
    try {
      const base = `https://www.gstatic.com/firebasejs/${v}/`;
      const [a, au, fi] = await Promise.all([import(base + 'firebase-app.js'), import(base + 'firebase-auth.js'), import(base + 'firebase-firestore.js')]);
      return { ...a, ...au, ...fi };
    } catch (e) { ultimo = e; console.warn('SDK', v, 'falhou', e); }
  }
  throw ultimo;
}

export async function boot() {
  $('#ver').textContent = 'v' + VERSION;
  $('#ver2').textContent = 'v' + VERSION;
  if (MODO === 'local') { setBackend(L); userBox(); render(); return; }
  let fs;
  try {
    const sdk = await carregarSDK();
    const cfg = (await import('../firebase-config.js')).default;
    const fapp = sdk.initializeApp(cfg);
    const instanciaAuth = sdk.getAuth(fapp);
    setFirebase(sdk, instanciaAuth);
    fs = sdk.initializeFirestore(fapp, {
      localCache: sdk.persistentLocalCache({ tabManager: sdk.persistentMultipleTabManager() }),
      ignoreUndefinedProperties: true
    });
  } catch (err) {
    document.body.classList.add('deslogado');
    app.innerHTML = `<div class="warn"><b>Não foi possível carregar o Firebase.</b><br>Verifique a internet (no primeiro acesso ela é necessária).<br><small>${esc(err.message)}</small></div>`;
    return;
  }
  const nuvem = makeCloud(F, fs);
  if (MODO === 'nuvem-teste') { setUser({ email: 'teste@local', uid: 'teste' }); setBackend(nuvem); userBox(); render(); return; }
  F.onAuthStateChanged(auth, user => {
    setUser(user);
    userBox();
    if (user) { document.body.classList.remove('deslogado'); setBackend(nuvem); render(); }
    else { setBackend(null); mostrarLogin(); }
  });
}
