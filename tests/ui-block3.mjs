// Teste de UI da listagem/detalhe/checklist. Rode: node tests/ui-block3.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = path.join(ROOT, 'tests', '.tmp-ui-block3');
const SHOTS = path.join(ROOT, 'tests', 'screenshots');
const PORT = 8155;
const CDP_PORT = 9255;
const BASE = `http://127.0.0.1:${PORT}/`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const limpar = () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {} };
limpar(); fs.mkdirSync(TMP, { recursive: true }); fs.mkdirSync(SHOTS, { recursive: true });
const serverLog = fs.openSync(path.join(TMP, 'http.log'), 'a');
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: ['ignore', serverLog, serverLog] });
const chrome = spawn('google-chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${path.join(TMP, 'chrome')}`, '--window-size=1440,1000', 'about:blank'], { stdio: 'ignore' });
let ws;
let falhas = 0;
const resultados = [];
const erros = [];
const logs = [];
const dialogs = [];
let passoAtual = 'início';

async function esperarHttp(url, timeout = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { try { const r = await fetch(url); if (r.ok) return; } catch (e) {} await sleep(150); }
  throw new Error('timeout esperando ' + url);
}
const check = (nome, ok, detalhe = '') => { resultados.push({ nome, ok, detalhe }); if (!ok) falhas++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${nome}${detalhe ? ' — ' + String(detalhe).slice(0, 240) : ''}`); };
async function passo(nome, fn) { passoAtual = nome; try { const r = await fn(); check(nome, true, r || ''); } catch (e) { check(nome, false, e.message.replace(/\s+/g, ' ')); } }
function send(method, params = {}) { const id = ++send.seq; return new Promise((res, rej) => { send.pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (send.pend.has(id)) { send.pend.delete(id); rej(new Error('timeout ' + method)); } }, 45000); }); }
send.seq = 0; send.pend = new Map();
async function ev(expression) { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true }); if (r.exceptionDetails) throw new Error('JS: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; }
async function waitFor(expr, timeout = 15000) { const t0 = Date.now(); while (Date.now() - t0 < timeout) { try { if (await ev(expr)) return true; } catch (e) {} await sleep(120); } throw new Error('timeout esperando: ' + expr); }
async function ir(hash) { await ev(`location.hash = ${JSON.stringify(hash)}`); await sleep(500); await waitFor(`document.querySelector('#app') && document.querySelector('#app').innerHTML.length > 80`); await sleep(250); }
async function set(sel, valor) { return ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) throw new Error('campo ausente: ' + ${JSON.stringify(sel)}); el.value = ${JSON.stringify(String(valor))}; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return el.value; })()`); }
async function viewport(width, height, mobile = false) { await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile, screenWidth: width, screenHeight: height }); await sleep(350); }
async function shot(nome, full = true) {
  await ev(`document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : true`);
  await ev('scrollTo(0, 0); true'); await sleep(400);
  if (!full) { const r = await send('Page.captureScreenshot', { format: 'png', fromSurface: true }); fs.writeFileSync(path.join(SHOTS, nome), Buffer.from(r.data, 'base64')); return nome; }
  const m = await send('Page.getLayoutMetrics'); const cs = m.cssContentSize || m.contentSize || { width: 1440, height: 1000 };
  const r = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: true, clip: { x: 0, y: 0, width: Math.max(320, Math.ceil(cs.width)), height: Math.max(320, Math.ceil(Math.min(cs.height, 6000))), scale: 1 } });
  fs.writeFileSync(path.join(SHOTS, nome), Buffer.from(r.data, 'base64')); return nome;
}
const tecla = async (key, code, vk, modifiers = 0) => { await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers }); };
try {
  await esperarHttp(BASE);
  await esperarHttp(`http://127.0.0.1:${CDP_PORT}/json/version`);
  const alvos = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
  const alvo = alvos.find(t => t.type === 'page');
  if (!alvo) throw new Error('Chrome sem página');
  ws = new WebSocket(alvo.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id) { const p = send.pend.get(m.id); if (p) { send.pend.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } return; }
    if (m.method === 'Page.javascriptDialogOpening') { dialogs.push(m.params.message); send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {}); }
    else if (m.method === 'Runtime.exceptionThrown') { const d = m.params.exceptionDetails; erros.push(`[${passoAtual}] ${d.exception?.description || d.text}`); }
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') logs.push(`[${passoAtual}] ` + m.params.args.map(a => a.value ?? a.description ?? '').join(' '));
  };
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');

  await passo('abre v0.21.0 e popula dados locais', async () => {
    await send('Page.navigate', { url: BASE });
    await waitFor(`document.querySelector('#ver')?.textContent === 'v0.21.0'`, 20000);
    const r = await ev(`(async () => {
      const db = await import('/src/core/db/index.js');
      const now = new Date(); const pad = n => String(n).padStart(2, '0');
      const hoje = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
      const iso = now.toISOString();
      const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z0ZkAAAAASUVORK5CYII=';
      const item = (cat, desc, status, obs = '', fotos = []) => ({ cat, desc, status, obs, fotos });
      await db.put('clientes', { id: 'c1', pessoa: 'PF', nome: 'Cliente Teste', documento: '52998224725', criado: iso });
      await db.put('obras', { id: 'o1', clienteId: 'c1', nome: 'Casa Teste', endereco: 'Rua A, 1', cidade: 'Cuiabá', uf: 'MT', tipo: 'Residencial', criado: iso });
      await db.put('fotos', { id: 'f1', vistoriaId: 'v1', src: 'data:image/png;base64,' + PNG });
      await db.put('vistorias', {
        id: 'v1', obraId: 'o1', tipo: 'Vistoria de entrega', status: 'rascunho', versao: 1, data: hoje, hora: '10:00',
        vistoriador: 'Victoria Teste', crea: 'MT 123', artNumero: '', valor: 1500, criado: iso,
        laudoObjetivo: 'Objetivo existente', orientacoes: 'Contato existente',
        itens: [item('Estrutura', 'Fundação', 'C', '', [{ id: 'f1', legenda: 'Foto de teste' }]), item('Estrutura', 'Fissuras', 'N', 'Fissura mapeada.'), item('Estrutura', 'Cobertura', '', ''), item('Acabamentos', 'Pintura', 'NA', ''), item('Acabamentos', 'Rodapés', '', '')]
      });
      await db.put('vistorias', {
        id: 'v2', obraId: 'o1', tipo: 'Inspeção predial', status: 'assinada', versao: 1, numeroLaudo: 'VST-2026-0200', data: hoje,
        vistoriador: 'Victoria Teste', crea: 'MT 123', criado: iso, itens: [], assinatura: { nome: 'Victoria Teste', img: '', ts: iso, hash: 'b'.repeat(64), hashVersao: 2, grupos: {} }
      });
      await db.put('anomalias', { id: 'an1', vistoriaId: 'v1', titulo: 'Fissura existente', gravidade: 'Alta', status: 'Aberta', itemIndex: 1, itemCat: 'Estrutura', itemDesc: 'Fissuras', criado: iso });
      return true;
    })()`);
    if (!r) throw new Error('seed falhou');
    await ir('#/vistorias');
    await waitFor(`!!document.querySelector('#nv-open')`);
    return 'v1 editável + v2 assinada, 5 itens, 1 foto e 1 anomalia';
  });

  await passo('listagem usa painel lateral com foco, Esc e proteção de dados', async () => {
    const inicial = await ev(`(() => ({ formOculto: document.querySelector('#nv')?.offsetParent === null, botao: document.querySelector('#nv-open')?.textContent.trim(), abrir: document.querySelector('.act .open')?.textContent.trim(), acoes: !!document.querySelector('.act details.row-actions') }))()`);
    if (!inicial.formOculto || !inicial.botao.includes('Nova vistoria') || inicial.abrir !== 'Abrir' || !inicial.acoes) throw new Error('listagem inicial: ' + JSON.stringify(inicial));
    await ev(`document.querySelector('#nv-open').click()`);
    await waitFor(`!document.querySelector('#nv-drawer').hidden`);
    const aberto = await ev(`(() => ({ foco: !!document.activeElement?.closest('#nv-drawer'), body: document.body.classList.contains('drawer-open'), aria: document.querySelector('#nv-open').getAttribute('aria-expanded') }))()`);
    if (!aberto.foco || !aberto.body || aberto.aria !== 'true') throw new Error('drawer não abriu/focou: ' + JSON.stringify(aberto));
    const foto = await shot('block3-drawer.png');
    await ev(`document.querySelector('#nv [type=submit]').focus()`);
    await tecla('Tab', 'Tab', 9);
    await sleep(100);
    if (await ev(`document.activeElement?.id`) !== 'nv-close') throw new Error('foco não ficou preso no drawer');
    await ev(`document.querySelector('#nv-close').click()`);
    await sleep(200);
    if (!(await ev(`document.querySelector('#nv-drawer').hidden`)) || await ev(`document.activeElement?.id`) !== 'nv-open') throw new Error('close sem foco de retorno');
    await ev(`document.querySelector('#nv-open').click()`);
    await set('#nv [name=tipo]', 'Inspeção predial');
    dialogs.length = 0;
    await tecla('Escape', 'Escape', 27);
    await sleep(250);
    if (!dialogs.some(d => /Descartar os dados/.test(d))) throw new Error('fechamento com dados não pediu confirmação: ' + dialogs.join(' | '));
    if (!(await ev(`document.querySelector('#nv-drawer').hidden`))) throw new Error('drawer não fechou após confirmação');
    await ev(`document.querySelector('#nv-open').click()`);
    await tecla('Escape', 'Escape', 27);
    await sleep(200);
    if (!(await ev(`document.querySelector('#nv-drawer').hidden`))) throw new Error('Esc sem dados não fechou');
    await ev(`document.querySelector('.act details.row-actions summary').click()`);
    const menu = await ev(`(() => ({ aberto: document.querySelector('.row-actions').open, links: [...document.querySelectorAll('.row-actions-menu a')].map(a => a.textContent.trim()) }))()`);
    if (!menu.aberto || !menu.links.includes('Ver laudo') || !menu.links.includes('Excluir')) throw new Error('menu de ações: ' + JSON.stringify(menu));
    await shot('block3-list.png');
    return `${foto} · abrir/fechar/Esc/confirmar/menu`;
  });

  await passo('detalhe em abas preserva dados e mostra progresso real', async () => {
    await ir('#/vistoria/v1');
    await waitFor(`!!document.querySelector('.vistoria-header')`);
    const info = await ev(`(() => ({
      titulo: document.querySelector('.vistoria-title h2').textContent,
      abas: document.querySelectorAll('[role="tab"]').length,
      progresso: document.querySelector('#progress-label').textContent,
      meta: document.querySelector('#progress-meta').textContent,
      cats: document.querySelectorAll('.check-cat').length,
      itens: document.querySelectorAll('.item').length,
      fotos: document.querySelectorAll('.item .foto img').length,
      status: document.querySelector('.status-badge').textContent,
      salvo: document.querySelector('#save-status').textContent
    }))()`);
    if (!info.titulo.includes('Casa Teste') || info.abas !== 5) throw new Error('cabeçalho/abas: ' + JSON.stringify(info));
    if (info.progresso !== '3 de 5 avaliados (60%)' || !info.meta.includes('2 sem avaliação') || info.cats !== 2 || info.itens !== 5 || info.fotos !== 1) throw new Error('progresso/checklist: ' + JSON.stringify(info));
    if (info.status !== 'Rascunho' || !info.salvo.includes('Sem alterações')) throw new Error('status/salvamento: ' + JSON.stringify(info));
    await ev(`(() => { const el = document.querySelector('[data-h="orientacoes"]'); el.value = 'Orientação preservada'; el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await waitFor(`document.querySelector('#save-status')?.textContent === 'Alterações pendentes'`);
    await ev(`document.querySelector('[data-h="orientacoes"]').dispatchEvent(new Event('change', { bubbles: true }))`);
    await waitFor(`document.querySelector('#save-status')?.textContent.includes('Salvo no app')`, 10000);
    await ev(`document.querySelector('[data-aba="dados"]').focus()`);
    await tecla('ArrowRight', 'ArrowRight', 39);
    await waitFor(`document.activeElement?.dataset.aba === 'checklist' && document.querySelector('[data-aba="checklist"]').getAttribute('aria-selected') === 'true'`);
    await ev(`document.querySelector('[data-aba="dados"]').click()`);
    await ev(`document.querySelector('[data-aba="checklist"]').click()`);
    await waitFor(`!document.querySelector('#tab-checklist').hidden`);
    await ev(`document.querySelector('[data-aba="dados"]').click()`);
    const valor = await ev(`document.querySelector('[data-h="orientacoes"]').value`);
    if (valor !== 'Orientação preservada') throw new Error('valor perdido ao trocar aba: ' + valor);
    const foto = await shot('block3-detail-dados.png');
    return `${foto} · 5 abas · progresso 3/5 · valor preservado`;
  });

  await passo('checklist tem seções, controles, filtros e vínculo de anomalia', async () => {
    await ev(`document.querySelector('[data-aba="checklist"]').click()`);
    await waitFor(`!document.querySelector('#tab-checklist').hidden`);
    const antes = await ev(`(async () => { const db = await import('/src/core/db/index.js'); return { anom: (await db.all('anomalias')).length, itens: (await db.all('vistorias')).find(v => v.id === 'v1').itens.length }; })()`);
    await ev(`document.querySelector('#item-2 .status-option.st-c').click()`);
    await waitFor(`document.querySelector('#item-2').dataset.itemStatus === 'C'`);
    if (!(await ev(`document.querySelector('#progress-label').textContent`)).includes('4 de 5')) throw new Error('progresso não atualizou');
    await ev(`document.querySelector('[data-check-filter="pending"]').click()`);
    await waitFor(`document.querySelectorAll('#tab-checklist .item:not([hidden])').length === 1`);
    const pendente = await ev(`document.querySelector('#check-visible').textContent`);
    if (!pendente.includes('1 de 5')) throw new Error('filtro pendente: ' + pendente);
    await ev(`document.querySelector('[data-check-filter="n"]').click()`);
    await waitFor(`document.querySelectorAll('#tab-checklist .item:not([hidden])').length === 1`);
    const naoConforme = await ev(`document.querySelector('#item-1').dataset.itemStatus`);
    if (naoConforme !== 'N') throw new Error('filtro não conformes');
    await set('#item-4 select.status-sync', 'N');
    await waitFor(`document.querySelector('#item-4').dataset.itemStatus === 'N'`);
    await ev(`document.querySelector('[data-check-filter="all"]').click()`);
    await waitFor(`document.querySelectorAll('#tab-checklist .item:not([hidden])').length === 5`);
    const antesClique = await ev(`(async () => { const db = await import('/src/core/db/index.js'); return (await db.all('anomalias')).filter(a => a.vistoriaId === 'v1').length; })()`);
    await ev(`document.querySelector('#item-1 a[data-anom-item]').click()`);
    await waitFor(`document.querySelector('[data-aba="anomalias"]').getAttribute('aria-selected') === 'true'`);
    const vinc = await ev(`document.querySelector('#anom-form [name=item]').value`);
    const depoisClique = await ev(`(async () => { const db = await import('/src/core/db/index.js'); return (await db.all('anomalias')).filter(a => a.vistoriaId === 'v1').length; })()`);
    if (vinc !== '1' || depoisClique !== antesClique) throw new Error('vínculo/auto-criação: ' + JSON.stringify({ vinc, antesClique, depoisClique }));
    await ev(`document.querySelector('[data-aba="checklist"]').click()`);
    await sleep(200);
    const foto = await shot('block3-checklist.png');
    return `${foto} · 2 categorias · filtros · controles C/N/N/A · vínculo item 1 sem criar anomalia`;
  });

  await passo('laudo mostra resumo de pendências sem criar regra nova', async () => {
    await ev(`document.querySelector('[data-aba="laudo"]').click()`);
    await waitFor(`!document.querySelector('#tab-laudo').hidden`);
    const info = await ev(`(() => ({
      sign: !!document.querySelector('#sign'), sig: !!document.querySelector('#sig'),
      pend: document.querySelector('#sign-pend')?.textContent || '',
      art: document.querySelector('#sign-art')?.textContent || '',
      texto: document.querySelector('#tab-laudo').innerText
    }))()`);
    if (!info.sign || !info.sig) throw new Error('quadro de assinatura ausente');
    if (!info.pend.includes('Todos os itens') || !info.art.includes('ART')) throw new Error('resumo de pendências: ' + JSON.stringify(info));
    if (!info.texto.includes('Pelos regras atuais') && !info.texto.includes('Pelas regras atuais')) throw new Error('texto de regras atuais ausente');
    const foto = await shot('block3-laudo.png');
    return `${foto} · assinatura + resumo informativo`;
  });
  await passo('detalhe e lista funcionam no celular sem rolagem horizontal', async () => {
    const larguras = [360, 390, 768];
    for (const larguraTeste of larguras) {
      await viewport(larguraTeste, 844, true);
      await ir('#/vistoria/v1');
      await waitFor(`!!document.querySelector('.vistoria-header')`);
      let largura = await ev(`({ pagina: document.documentElement.scrollWidth, tela: innerWidth })`);
      if (largura.pagina > largura.tela + 1) throw new Error(`overflow horizontal no detalhe ${larguraTeste}px: ` + JSON.stringify(largura));
      await ev(`document.querySelector('[data-aba="checklist"]').click()`);
      await waitFor(`!document.querySelector('#tab-checklist').hidden`);
      largura = await ev(`({ pagina: document.documentElement.scrollWidth, tela: innerWidth })`);
      if (largura.pagina > largura.tela + 1) throw new Error(`overflow horizontal na checklist ${larguraTeste}px: ` + JSON.stringify(largura));
    }
    await viewport(390, 844, true);
    await ir('#/vistoria/v1');
    await waitFor(`!!document.querySelector('.vistoria-header')`);
    await ev(`document.querySelector('[data-aba="checklist"]').click()`);
    await waitFor(`!document.querySelector('#tab-checklist').hidden`);
    const foto1 = await shot('block3-mobile-checklist.png');
    await ev(`document.documentElement.dataset.theme = 'dark'; localStorage.setItem('vistori_tema_v2', 'dark'); true`);
    await sleep(250);
    const foto2 = await shot('block3-mobile-checklist-dark.png');
    await ev(`document.documentElement.dataset.theme = 'light'; localStorage.setItem('vistori_tema_v2', 'light'); true`);
    await ir('#/vistorias');
    await waitFor(`!!document.querySelector('#nv-open')`);
    let lista = await ev(`({ pagina: document.documentElement.scrollWidth, tela: innerWidth })`);
    if (lista.pagina > lista.tela + 1) throw new Error('overflow horizontal na lista: ' + JSON.stringify(lista));
    await ev(`document.querySelector('#nv-open').click()`);
    await waitFor(`!document.querySelector('#nv-drawer').hidden`);
    const drawer = await ev(`(() => { const r = document.querySelector('#nv-drawer').getBoundingClientRect(); return { largura: r.width, tela: innerWidth }; })()`);
    if (drawer.largura > drawer.tela + 1) throw new Error('drawer maior que a tela: ' + JSON.stringify(drawer));
    const foto3 = await shot('block3-mobile-drawer.png', false);
    await ev(`document.querySelector('#nv-close').click()`);
    await sleep(150);
    return `${foto1} · ${foto2} · ${foto3} · sem overflow horizontal`;
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

