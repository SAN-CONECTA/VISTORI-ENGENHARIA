// Teste do piloto visual isolado. Rode: node tests/ui-piloto.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = path.join(ROOT, 'tests', '.tmp-ui-piloto');
const SHOTS = path.join(ROOT, 'tests', 'screenshots');
const PORT = 8166, CDP_PORT = 9266, BASE = `http://127.0.0.1:${PORT}/`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const limpar = () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {} };
limpar(); fs.mkdirSync(TMP, { recursive: true }); fs.mkdirSync(SHOTS, { recursive: true });
const serverLog = fs.openSync(path.join(TMP, 'http.log'), 'a');
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: ['ignore', serverLog, serverLog] });
const chrome = spawn('google-chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${path.join(TMP, 'chrome')}`, '--window-size=1440,1000', 'about:blank'], { stdio: 'ignore' });
let ws, falhas = 0; const resultados = [], erros = [], logs = [], dialogs = []; let passoAtual = 'início';
async function esperarHttp(url, timeout = 20000) { const t0 = Date.now(); while (Date.now() - t0 < timeout) { try { const r = await fetch(url); if (r.ok) return; } catch (e) {} await sleep(150); } throw new Error('timeout ' + url); }
const check = (nome, ok, detalhe = '') => { resultados.push({ nome, ok, detalhe }); if (!ok) falhas++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${nome}${detalhe ? ' — ' + String(detalhe).slice(0, 220) : ''}`); };
async function passo(nome, fn) { passoAtual = nome; try { const r = await fn(); check(nome, true, r || ''); } catch (e) { check(nome, false, e.message.replace(/\s+/g, ' ')); } }
function send(method, params = {}) { const id = ++send.seq; return new Promise((res, rej) => { send.pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (send.pend.has(id)) { send.pend.delete(id); rej(new Error('timeout ' + method)); } }, 45000); }); }
send.seq = 0; send.pend = new Map();
async function ev(expression) { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true }); if (r.exceptionDetails) throw new Error('JS: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; }
async function waitFor(expr, timeout = 15000) { const t0 = Date.now(); while (Date.now() - t0 < timeout) { try { if (await ev(expr)) return true; } catch (e) {} await sleep(120); } throw new Error('timeout esperando: ' + expr); }
async function ir(hash) { await ev(`location.hash = ${JSON.stringify(hash)}`); await sleep(600); await waitFor(`document.querySelector('#app') && document.querySelector('#app').innerHTML.length > 80`); await sleep(250); }
async function set(sel, valor) { return ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) throw new Error('campo ausente: ' + ${JSON.stringify(sel)}); el.value = ${JSON.stringify(String(valor))}; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return el.value; })()`); }
async function viewport(width, height, mobile = false) { await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile, screenWidth: width, screenHeight: height }); await sleep(350); }
async function shot(nome, full = true) { await ev(`document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : true`); await ev('scrollTo(0, 0); true'); await sleep(400); if (!full) { const r = await send('Page.captureScreenshot', { format: 'png', fromSurface: true }); fs.writeFileSync(path.join(SHOTS, nome), Buffer.from(r.data, 'base64')); return nome; } const m = await send('Page.getLayoutMetrics'); const cs = m.cssContentSize || m.contentSize || { width: 1440, height: 1000 }; const r = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: true, clip: { x: 0, y: 0, width: Math.max(320, Math.ceil(cs.width)), height: Math.max(320, Math.ceil(Math.min(cs.height, 6000))), scale: 1 } }); fs.writeFileSync(path.join(SHOTS, nome), Buffer.from(r.data, 'base64')); return nome; }
const tecla = async (key, code, vk, modifiers = 0) => { await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers }); };
try {
  await esperarHttp(BASE); await esperarHttp(`http://127.0.0.1:${CDP_PORT}/json/version`);
  const alvos = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json(); const alvo = alvos.find(t => t.type === 'page');
  if (!alvo) throw new Error('Chrome sem página'); ws = new WebSocket(alvo.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id) { const p = send.pend.get(m.id); if (p) { send.pend.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } return; } if (m.method === 'Page.javascriptDialogOpening') { dialogs.push(m.params.message); send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {}); } else if (m.method === 'Runtime.exceptionThrown') { const d = m.params.exceptionDetails; erros.push(`[${passoAtual}] ${d.exception?.description || d.text}`); } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') logs.push(`[${passoAtual}] ` + m.params.args.map(a => a.value ?? a.description ?? '').join(' ')); };
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');

  await passo('abre o piloto visual em v0.22.0', async () => {
    await send('Page.navigate', { url: BASE });
    await waitFor(`document.querySelector('#ver')?.textContent === 'v0.22.0'`, 20000);
    await waitFor(`document.querySelector('#app') && !document.querySelector('#app').textContent.includes('Carregando') && document.querySelector('#app').innerHTML.length > 120`, 20000);
    await ir('#/piloto');
    await waitFor(`!!document.querySelector('.pilot')`);
    const info = await ev(`(() => { const app=document.querySelector('#app'); const cols=getComputedStyle(document.querySelector('.pilot-grid')).gridTemplateColumns.split(' ').filter(Boolean).length; return { titulo: document.querySelector('.pilot-heading h2').textContent, demo: document.querySelector('.pilot-eyebrow').textContent, cats: document.querySelectorAll('.pilot-cat').length, itens: document.querySelectorAll('.pilot-status-option').length, fotos: document.querySelectorAll('.pilot-thumb').length, colunas: cols, progresso: document.querySelector('#pilot-progress-label').textContent, telaAtual: !!document.querySelector('a[href="#/vistorias"]'), sync: document.querySelector('#syncbox').textContent }; })()`);
    if (!info.titulo.includes('Jardim das Acácias') || info.cats !== 3 || info.itens !== 4 || info.fotos !== 1 || info.colunas !== 3) throw new Error('estrutura do piloto: ' + JSON.stringify(info));
    if (!info.progresso.includes('5 de 8') || !info.telaAtual || info.sync !== 'Modo local') throw new Error('cabeçalho do piloto: ' + JSON.stringify(info));
    if (!info.demo.toLowerCase().includes('fictícios')) throw new Error('piloto sem aviso de dados fictícios');
    const foto = await shot('piloto-desktop-light.png');
    return `${foto} · ${info.colunas} colunas · ${info.progresso}`;
  });

  await passo('navegação de itens preserva observação e posição', async () => {
    await set('[data-pilot-obs]', 'Observação preservada no piloto');
    const titulo1 = await ev(`document.querySelector('#pilot-item-title').textContent`);
    const pos = await ev(`(() => { const y = Math.min(240, Math.max(0, document.documentElement.scrollHeight - innerHeight)); scrollTo(0, y); return y; })()`);
    await ev(`document.querySelector('[data-pilot-next-item]').click()`);
    await waitFor(`document.querySelector('#pilot-item-title').textContent === 'Fachada'`);
    const y = await ev(`scrollY`);
    if (Math.abs(y - pos) > 3) throw new Error(`posição não preservada: ${pos} → ${y}`);
    await ev(`document.querySelector('[data-pilot-prev]').click()`);
    await waitFor(`document.querySelector('#pilot-item-title').textContent === ${JSON.stringify(titulo1)}`);
    const obs = await ev(`document.querySelector('[data-pilot-obs]').value`);
    if (obs !== 'Observação preservada no piloto') throw new Error('observação perdida: ' + obs);
    await ev(`document.querySelector('[data-pilot-next-item]').click()`);
    await waitFor(`document.querySelector('#pilot-item-title').textContent === 'Fachada'`);
    if (!(await ev(`document.querySelector('.pilot-anomaly-context')`))) throw new Error('contexto de anomalia ausente');
    await ev(`document.querySelector('[data-pilot-next]').click()`);
    await waitFor(`document.querySelector('#pilot-item-title').textContent === 'Iluminação externa'`);
    if (!(await ev(`!!document.querySelector('.pilot-empty')`))) throw new Error('item sem foto sem estado vazio');
    await ev(`document.querySelector('[data-pilot-prev]').click()`);
    await waitFor(`document.querySelector('#pilot-item-title').textContent === 'Fachada'`);
    return 'item anterior/próximo, posição, sem foto e observação mantidos';
  });

  await passo('fotos têm contexto, ampliação, legenda e falha tratada', async () => {
    await ev(`document.querySelector('[data-pilot-photo="0"]').click()`);
    await waitFor(`!!document.querySelector('.pilot-photo-context')`);
    const ctx = await ev(`(() => ({ item: document.querySelector('.pilot-photo-meta .pilot-context-line b')?.textContent || '', anomalia: document.querySelector('.pilot-anomaly-context b')?.textContent || '', estado: document.querySelector('.pilot-item-state')?.textContent || '' }))()`);
    if (!ctx.item.includes('Fachada') || !ctx.anomalia.includes('Trinca') || !ctx.estado.includes('não conforme')) throw new Error('contexto da foto: ' + JSON.stringify(ctx));
    await set('[data-pilot-legend]', 'Legenda atualizada');
    if (!(await ev(`document.querySelector('.pilot-thumb-legend').textContent`)).includes('Legenda atualizada')) throw new Error('legenda não atualizou a miniatura');
    await ev(`document.querySelector('[data-pilot-zoom]').click()`);
    await waitFor(`!document.querySelector('#pilot-lightbox').hidden`);
    const foto = await shot('piloto-evidence.png', false);
    await tecla('Escape', 'Escape', 27);
    await waitFor(`document.querySelector('#pilot-lightbox').hidden`);
    await ev(`(() => { const img = document.querySelector('.pilot-photo-large img'); img.src = 'data:image/png;base64,INVALID'; img.dispatchEvent(new Event('error')); })()`);
    await waitFor(`!document.querySelector('.pilot-photo-large .pilot-photo-error').hidden`);
    await ev(`document.querySelector('[data-pilot-cat="Acesso e fachada"]').click()`);
    await waitFor(`document.querySelector('#pilot-item-title').textContent === 'Portão de entrada'`);
    await ev(`document.querySelector('[data-pilot-mark]').click()`);
    await waitFor(`!!document.querySelector('.marker')`);
    await ev(`document.querySelector('#marker-cancel').click()`);
    return `${foto} · contexto, ampliação, legenda e fallback`;
  });
  await passo('anexar foto e ampliar funciona sem gravar no banco', async () => {
    const antes = await ev(`(async () => {
      const db = await import('/src/core/db/index.js');
      const state = await import('/src/core/state.js');
      const vistorias = await db.all('vistorias');
      const snapshot = JSON.stringify(vistorias.map(v => ({ id: v.id, valor: v })).sort((a, b) => a.id.localeCompare(b.id)));
      const backend = state.B;
      window.__pilotDbWrites = 0;
      window.__pilotDbDeletes = 0;
      window.__pilotDbPutOriginal = backend.put;
      window.__pilotDbDelOriginal = backend.del;
      backend.put = (...args) => { window.__pilotDbWrites++; return window.__pilotDbPutOriginal(...args); };
      backend.del = (...args) => { window.__pilotDbDeletes++; return window.__pilotDbDelOriginal(...args); };
      return { snapshot, count: vistorias.length };
    })()`);
    await ev(`(() => { const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#7b9089"/><rect x="80" y="80" width="480" height="320" rx="12" fill="#d8e1dc"/><text x="80" y="440" fill="#1f6265" font-family="sans-serif" font-size="28">Evidência anexada</text></svg>'; const dt = new DataTransfer(); dt.items.add(new File([svg], 'piloto.svg', { type: 'image/svg+xml' })); const input = document.querySelector('#pilot-file'); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await waitFor(`document.querySelectorAll('.pilot-thumb').length >= 2`, 15000);
    const depois = await ev(`(async () => { const db = await import('/src/core/db/index.js'); const vistorias = await db.all('vistorias'); return { snapshot: JSON.stringify(vistorias.map(v => ({ id: v.id, valor: v })).sort((a, b) => a.id.localeCompare(b.id))), count: vistorias.length, puts: window.__pilotDbWrites || 0, dels: window.__pilotDbDeletes || 0 }; })()`);
    if (depois.count !== antes.count || depois.snapshot !== antes.snapshot || depois.puts !== 0 || depois.dels !== 0) throw new Error('piloto alterou o backend: ' + JSON.stringify({ antes: antes.count, depois: depois.count, puts: depois.puts, dels: depois.dels }));
    const foto = await shot('piloto-photos.png');
    return `${foto} · foto anexada apenas em memória`;
  });

  await passo('revisão final separa avisos de impedimentos e leva ao contexto', async () => {
    await ev(`document.querySelector('[data-pilot-sheet="revisao"]').click()`);
    await waitFor(`!document.querySelector('#pilot-sheet').hidden`);
    const revisao = await ev(`(() => ({ titulo: document.querySelector('#pilot-sheet-title').textContent, bloqueios: document.querySelectorAll('.pilot-review-blocker').length, avisos: document.querySelectorAll('.pilot-review-warning').length, info: document.querySelectorAll('.pilot-review-info').length, art: !!document.querySelector('[data-pilot-review-art]') }))()`);
    if (revisao.titulo !== 'Revisão final' || !revisao.bloqueios || !revisao.avisos || !revisao.art) throw new Error('revisão: ' + JSON.stringify(revisao));
    await tecla('Escape', 'Escape', 27);
    await waitFor(`document.querySelector('#pilot-sheet').hidden`);
    await ev(`document.querySelector('[data-pilot-sheet="revisao"]').click()`);
    await waitFor(`!document.querySelector('#pilot-sheet').hidden`);
    const foto = await shot('piloto-review.png', false);
    await ev(`document.querySelector('[data-pilot-review-item]').click()`);
    await waitFor(`document.querySelector('#pilot-sheet').hidden && !!document.querySelector('#pilot-item-title')`);
    await ev(`document.querySelector('[data-pilot-sheet="revisao"]').click()`);
    await waitFor(`!document.querySelector('#pilot-sheet').hidden`);
    await ev(`document.querySelector('[data-pilot-review-art]').click()`);
    await waitFor(`document.querySelector('#pilot-sheet-title').textContent === 'Dados gerais' && document.activeElement?.id === 'pilot-art'`);
    await set('[data-pilot-art]', 'ART-2026-999');
    await ev(`document.querySelector('[data-pilot-sheet-close]').click()`);
    await ev(`document.querySelector('[data-pilot-sheet="docs"]').click()`);
    await waitFor(`document.querySelector('#pilot-sheet-title').textContent === 'Documentos'`);
    await ev(`document.querySelector('[data-pilot-sheet-close]').click()`);
    await ev(`document.querySelector('[data-pilot-sheet="laudo"]').click()`);
    await waitFor(`document.querySelector('#pilot-sheet-title').textContent === 'Laudo'`);
    await ev(`document.querySelector('[data-pilot-sheet-close]').click()`);
    return `${foto} · bloqueio, confirmação e informativo com atalhos`;
  });

  await passo('piloto usa duas colunas em largura intermediária', async () => {
    await viewport(1024, 900, false);
    await ir('#/vistorias');
    await ir('#/piloto');
    await waitFor(`!!document.querySelector('.pilot')`);
    const tablet = await ev(`(() => { const g = getComputedStyle(document.querySelector('.pilot-grid')); return { colunas: g.gridTemplateColumns.split(' ').filter(Boolean).length, overflow: document.documentElement.scrollWidth - innerWidth, evidencia: getComputedStyle(document.querySelector('.pilot-evidence')).gridColumn }; })()`);
    if (tablet.colunas !== 2 || tablet.overflow > 1) throw new Error('layout tablet: ' + JSON.stringify(tablet));
    const foto = await shot('piloto-tablet.png');
    return `${foto} · 2 colunas com evidências abaixo`;
  });

  await passo('piloto responde em uma coluna no celular', async () => {
    await viewport(390, 844, true);
    await ir('#/vistorias');
    await ir('#/piloto');
    await waitFor(`!!document.querySelector('.pilot')`);
    const mobile = await ev(`(() => { const g = getComputedStyle(document.querySelector('.pilot-grid')); return { colunas: g.gridTemplateColumns.split(' ').filter(Boolean).length, categoria: getComputedStyle(document.querySelector('.pilot-cat-index')).display, select: getComputedStyle(document.querySelector('.pilot-mobile-cat')).display, overflow: document.documentElement.scrollWidth - innerWidth }; })()`);
    if (mobile.colunas !== 1 || mobile.categoria !== 'none' || mobile.select === 'none' || mobile.overflow > 1) throw new Error('layout celular: ' + JSON.stringify(mobile));
    await set('#pilot-cat-mobile', 'Cozinha e serviço');
    await waitFor(`document.querySelector('#pilot-item-title').textContent === 'Bancada e cuba'`);
    const foto = await shot('piloto-mobile-light.png');
    await ev(`document.documentElement.dataset.theme = 'dark'; localStorage.setItem('vistori_tema_v2', 'dark'); true`);
    await sleep(250);
    const fotoDark = await shot('piloto-mobile-dark.png');
    await ev(`document.documentElement.dataset.theme = 'light'; localStorage.setItem('vistori_tema_v2', 'light'); true`);
    return `${foto} · ${fotoDark} · uma coluna e seletor de categoria`;
  });

  await passo('piloto desktop no tema escuro', async () => {
    await viewport(1440, 1000, false);
    await ev(`document.documentElement.dataset.theme = 'dark'; localStorage.setItem('vistori_tema_v2', 'dark'); true`);
    await ir('#/vistorias');
    await ir('#/piloto');
    await waitFor(`!!document.querySelector('.pilot')`);
    const foto = await shot('piloto-desktop-dark.png');
    await ev(`document.documentElement.dataset.theme = 'light'; localStorage.setItem('vistori_tema_v2', 'light'); true`);
    return foto;
  });

  check('sem exceções JavaScript', erros.length === 0, erros.join(' | '));
  const logsApp = logs.filter(l => !/favicon\.ico|fonts\.googleapis\.com|fonts\.gstatic\.com|ERR_INTERNET_DISCONNECTED/.test(l));
  check('sem erros de console da aplicação', logsApp.length === 0, logsApp.join(' | '));
} catch (e) {
  check('execução geral', false, e.message);
} finally {
  try { if (ws) ws.close(); } catch (e) {}
  try { chrome.kill('SIGKILL'); } catch (e) {}
  try { server.kill('SIGKILL'); } catch (e) {}
  try { fs.closeSync(serverLog); } catch (e) {}
  await sleep(500);
  limpar();
  console.log('\n===== RESUMO =====');
  const listaFalhas = resultados.filter(r => !r.ok);
  console.log(`${resultados.length - listaFalhas.length}/${resultados.length} verificações passaram`);
  console.log('Capturas em tests/screenshots/');
  if (erros.length) { console.log('\nExceções:'); [...new Set(erros)].forEach(e => console.log(' -', e.slice(0, 500))); }
  if (logs.length) { console.log('\nConsole error:'); [...new Set(logs)].forEach(e => console.log(' -', e.slice(0, 500))); }
  if (listaFalhas.length) { console.log('\nFALHAS:'); listaFalhas.forEach(f => console.log(' ✗', f.nome, '—', f.detalhe)); }
  process.exit(listaFalhas.length ? 1 : 0);
}

