// Teste de UI do dashboard/menu (bloco 2, compatível com a v0.22.0). Rode: node tests/ui-block2.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = path.join(ROOT, 'tests', '.tmp-ui-block2');
const SHOTS = path.join(ROOT, 'tests', 'screenshots');
const PORT = 8144;
const CDP_PORT = 9244;
const BASE = `http://127.0.0.1:${PORT}/`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const limpar = () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {} };
limpar();
fs.mkdirSync(TMP, { recursive: true });
fs.mkdirSync(SHOTS, { recursive: true });
const serverLog = fs.openSync(path.join(TMP, 'http.log'), 'a');
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: ['ignore', serverLog, serverLog] });
const chrome = spawn('google-chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${path.join(TMP, 'chrome')}`, '--window-size=1440,1000', 'about:blank'], { stdio: 'ignore' });
let ws;
let falhas = 0;
const resultados = [];
const erros = [];
const logs = [];
let passoAtual = 'início';

async function esperarHttp(url, timeout = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try { const r = await fetch(url); if (r.ok) return; } catch (e) {}
    await sleep(150);
  }
  throw new Error('timeout esperando ' + url);
}
const check = (nome, ok, detalhe = '') => {
  resultados.push({ nome, ok, detalhe });
  if (!ok) falhas++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${nome}${detalhe ? ' — ' + String(detalhe).slice(0, 240) : ''}`);
};
async function passo(nome, fn) {
  passoAtual = nome;
  try { const r = await fn(); check(nome, true, r || ''); }
  catch (e) { check(nome, false, e.message.replace(/\s+/g, ' ')); }
}
function send(method, params = {}) {
  const id = ++send.seq;
  return new Promise((res, rej) => {
    send.pend.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { if (send.pend.has(id)) { send.pend.delete(id); rej(new Error('timeout ' + method)); } }, 45000);
  });
}
send.seq = 0; send.pend = new Map();
async function ev(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (r.exceptionDetails) throw new Error('JS: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
}
async function waitFor(expr, timeout = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try { if (await ev(expr)) return true; } catch (e) {}
    await sleep(120);
  }
  throw new Error('timeout esperando: ' + expr);
}
async function ir(hash) {
  await ev(`location.hash = ${JSON.stringify(hash)}`);
  await sleep(550);
  await waitFor(`document.querySelector('#app') && document.querySelector('#app').innerHTML.length > 80`);
  await sleep(250);
}
async function viewport(width, height, mobile = false) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile, screenWidth: width, screenHeight: height });
  await sleep(350);
}
async function shot(nome) {
  await ev(`document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : true`);
  await ev('scrollTo(0, 0); true');
  await sleep(450);
  const m = await send('Page.getLayoutMetrics');
  const cs = m.cssContentSize || m.contentSize || { width: 1440, height: 1000 };
  const width = Math.max(320, Math.ceil(cs.width));
  const height = Math.max(320, Math.ceil(Math.min(cs.height, 6000)));
  const r = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: true, clip: { x: 0, y: 0, width, height, scale: 1 } });
  fs.writeFileSync(path.join(SHOTS, nome), Buffer.from(r.data, 'base64'));
  return nome;
}
async function shotViewport(nome) {
  await ev(`document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : true`);
  await sleep(350);
  const r = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  fs.writeFileSync(path.join(SHOTS, nome), Buffer.from(r.data, 'base64'));
  return nome;
}
const tecla = async (key, code, vk, modifiers = 0) => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers });
};
try {
  await esperarHttp(BASE);
  await esperarHttp(`http://127.0.0.1:${CDP_PORT}/json/version`);
  const alvos = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
  const alvo = alvos.find(t => t.type === 'page');
  if (!alvo) throw new Error('Chrome sem página');
  ws = new WebSocket(alvo.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id) { const p = send.pend.get(m.id); if (p) { send.pend.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } return; }
    if (m.method === 'Page.javascriptDialogOpening') {
      send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
    } else if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      erros.push(`[${passoAtual}] ${d.exception?.description || d.text}`);
    } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      logs.push(`[${passoAtual}] ` + m.params.args.map(a => a.value ?? a.description ?? '').join(' '));
    }
  };
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');

  await passo('abre a v0.22.0 em modo local', async () => {
    await send('Page.navigate', { url: BASE });
    await waitFor(`document.querySelector('#ver')?.textContent === 'v0.22.0'`, 20000);
    await waitFor(`!!document.querySelector('.dashboard-heading')`);
    return 'v0.22.0';
  });

  await passo('popula dados locais de exemplo para o dashboard', async () => {
    const r = await ev(`(async () => {
      const db = await import('/src/core/db/index.js');
      const now = new Date();
      const pad = n => String(n).padStart(2, '0');
      const hoje = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
      const iso = now.toISOString();
      const anterior = new Date(now.getTime() - 172800000).toISOString();
      const item = (cat, desc, status, obs = '') => ({ cat, desc, status, obs, fotos: [] });
      await db.put('clientes', { id: 'c1', pessoa: 'PF', nome: 'Cliente Aurora', documento: '52998224725', criado: anterior });
      await db.put('clientes', { id: 'c2', pessoa: 'PJ', nome: 'Construtora Vale', documento: '11222333000181', criado: anterior });
      await db.put('obras', { id: 'o1', clienteId: 'c1', nome: 'Residência Aurora', endereco: 'Rua das Palmeiras, 120', cidade: 'Cuiabá', uf: 'MT', tipo: 'Residencial', criado: anterior });
      await db.put('obras', { id: 'o2', clienteId: 'c2', nome: 'Edifício Horizonte', endereco: 'Av. Central, 450', cidade: 'Cuiabá', uf: 'MT', tipo: 'Comercial', criado: anterior });
      await db.put('vistorias', {
        id: 'v-assinada', obraId: 'o1', tipo: 'Vistoria de entrega', status: 'assinada', numeroLaudo: 'VST-2026-0042', versao: 1,
        data: hoje, hora: '09:30', vistoriador: 'Victoria Teste', crea: 'MT 12345', artNumero: 'ART 2026/01', valor: 1800, criado: anterior,
        assinatura: { nome: 'Victoria Teste', img: '', ts: iso, hash: 'a'.repeat(64), hashVersao: 2, grupos: {} },
        itens: [item('Estrutura', 'Fundação e estrutura', 'C'), item('Estrutura', 'Fissuras em alvenaria', 'N', 'Fissura mapeada no quarto.'), item('Instalações', 'Pontos elétricos', 'NA'), item('Acabamentos', 'Pintura', 'C')]
      });
      await db.put('vistorias', {
        id: 'v-rascunho', obraId: 'o2', tipo: 'Inspeção predial', status: 'rascunho', versao: 1,
        data: hoje, hora: '15:30', vistoriador: 'Victoria Teste', crea: 'MT 12345', artNumero: '', valor: 2400, criado: iso,
        itens: [item('Cobertura', 'Telhado e calhas', 'N', 'Telha deslocada.'), item('Hidráulica', 'Ramais e registros', 'N', 'Vazamento no registro.'), item('Acabamentos', 'Rodapés', ''), item('Documentação', 'ART e projeto', '')]
      });
      await db.put('agendamentos', { id: 'ag1', obraId: 'o2', data: hoje, hora: '14:00', tipo: 'Inspeção predial', status: 'Confirmada', criado: iso });
      await db.put('agendamentos', { id: 'ag2', obraId: 'o1', data: hoje, hora: '16:00', tipo: 'Vistoria de entrega', status: 'Agendada', criado: iso });
      await db.put('anomalias', { id: 'an1', vistoriaId: 'v-rascunho', titulo: 'Infiltração na laje', gravidade: 'Alta', status: 'Aberta', criado: iso });
      await db.put('recebimentos', { id: 'r1', descricao: 'Sinal da vistoria', valor: 2400, vencimento: hoje, status: 'Recebido', pagoEm: iso, criado: iso });
      await db.put('recebimentos', { id: 'r2', descricao: 'Parcela final', valor: 1600, vencimento: hoje, status: 'Pendente', criado: iso });
      return true;
    })()`);
    if (!r) throw new Error('seed falhou');
    await ir('#/vistorias');
    await ir('#/');
    await waitFor(`!!document.querySelector('.dashboard-pending')`);
    return '2 clientes, 2 obras, 2 vistorias, 2 visitas, 2 recebimentos e 1 anomalia';
  });

  await passo('dashboard prioriza retomada, recentes, agenda e pendências', async () => {
    await waitFor(`!!document.querySelector('.dashboard-pending')`);
    const i = await ev(`(() => {
      const app = document.querySelector('#app');
      const ordem = [...app.querySelectorAll(':scope > .dashboard-continue, :scope > .kpi-grid, :scope > .dashboard-priority, :scope > .dashboard-pending, :scope > .dashboard-charts, :scope > .dashboard-secondary')].map(n => n.className);
      const prioridade = document.querySelector('.dashboard-priority');
      const dentro = [...prioridade.querySelectorAll('.dashboard-recent, .dashboard-today')].map(n => n.className);
      return {
        kpis: document.querySelectorAll('.kpi-grid .kpi-card').length,
        kpiTexto: document.querySelector('.kpi-grid').innerText,
        pendTexto: document.querySelector('.dashboard-pending').innerText,
        continueHref: document.querySelector('.dashboard-continue')?.getAttribute('href') || '',
        continueTexto: document.querySelector('.dashboard-continue')?.innerText || '',
        agendaTexto: document.querySelector('.dashboard-today').innerText,
        recenteTexto: document.querySelector('.dashboard-recent').innerText,
        sync: document.querySelector('#syncbox')?.textContent || '',
        syncTitulo: document.querySelector('#syncbox')?.title || '',
        syncLabel: document.querySelector('#syncbox')?.getAttribute('aria-label') || '',
        texto: app.innerText,
        ordem, dentro,
        charts: document.querySelectorAll('.dashboard-charts .chart').length,
        vazios: document.querySelectorAll('.chart-empty').length,
        current: document.querySelector('#nav a[aria-current="page"]')?.getAttribute('href') || ''
      };
    })()`);
    if (i.kpis !== 4) throw new Error('KPIs: ' + i.kpis);
    for (const termo of ['Visitas de hoje', 'Vistorias em andamento', 'Laudos assinados', 'Clientes']) if (!i.kpiTexto.includes(termo)) throw new Error('KPI ausente: ' + termo);
    if (i.kpiTexto.includes('Não conformidades')) throw new Error('Não conformidades ainda está nos KPIs');
    for (const termo of ['Não conformidades', 'Sem avaliação', 'Anomalias', 'Checklist ≠ anomalias']) if (!i.pendTexto.includes(termo)) throw new Error('pendência sem: ' + termo);
    if (i.continueHref !== '#/vistoria/v-rascunho' || !i.continueTexto.includes('Continuar vistoria')) throw new Error('retomada incorreta: ' + i.continueHref);
    if (!i.agendaTexto.includes('Agenda do dia') || !i.agendaTexto.includes('14:00') || !i.agendaTexto.includes('16:00')) throw new Error('agenda do dia incompleta: ' + i.agendaTexto.slice(0, 160));
    if (!i.recenteTexto.includes('Edifício Horizonte') || !i.recenteTexto.includes('Residência Aurora')) throw new Error('recentes incompletas');
    if (i.sync !== 'Modo local' || !i.syncTitulo.includes('somente neste aparelho') || !i.syncLabel.includes('Modo local')) throw new Error('syncbox: ' + i.sync + ' / ' + i.syncTitulo);
    if (i.texto.includes('Firebase')) throw new Error('aviso técnico de Firebase ainda aparece no dashboard');
    if (i.charts !== 2 || i.vazios !== 0) throw new Error('gráficos: ' + i.charts + '/' + i.vazios);
    if (!i.dentro[0]?.includes('dashboard-recent') || !i.dentro[1]?.includes('dashboard-today')) throw new Error('ordem recentes/agenda: ' + i.dentro.join(' | '));
    const idx = chave => i.ordem.findIndex(c => c.includes(chave));
    if (!(idx('dashboard-continue') < idx('kpi-grid') && idx('kpi-grid') < idx('dashboard-priority') && idx('dashboard-priority') < idx('dashboard-pending') && idx('dashboard-pending') < idx('dashboard-charts') && idx('dashboard-charts') < idx('dashboard-secondary'))) throw new Error('ordem do dashboard: ' + i.ordem.join(' | '));
    if (i.current !== '#/') throw new Error('item ativo: ' + i.current);
    await viewport(1440, 1000, false);
    const foto = await shot('block2-dashboard-desktop-light.png');
    return `${foto} · 4 KPIs · pendências antes dos gráficos`;
  });

  await passo('menu inicia Admin recolhida e memoriza a preferência', async () => {
    await ev(`localStorage.removeItem('vistori_nav_grupos_v1'); true`);
    await send('Page.reload', { ignoreCache: false });
    await sleep(1800);
    await waitFor(`document.querySelector('#ver')?.textContent === 'v0.22.0'`);
    await waitFor(`!!document.querySelector('.dashboard-heading')`);
    const inicial = await ev(`(() => {
      const admin = document.querySelector('[data-group="admin"]');
      const ops = document.querySelector('[data-group="operacoes"]');
      const com = document.querySelector('[data-group="comercial"]');
      return {
        adminFechado: admin.classList.contains('is-collapsed'),
        adminAria: admin.querySelector('.nav-group-btn').getAttribute('aria-expanded'),
        opsAberto: !ops.classList.contains('is-collapsed'),
        comAberto: !com.classList.contains('is-collapsed'),
        key: localStorage.getItem('vistori_nav_grupos_v1')
      };
    })()`);
    if (!inicial.adminFechado || inicial.adminAria !== 'false') throw new Error('Administração não iniciou recolhida: ' + JSON.stringify(inicial));
    if (!inicial.opsAberto || !inicial.comAberto) throw new Error('outros grupos deveriam iniciar abertos');
    await ev(`document.querySelector('[data-group="admin"] .nav-group-btn').click()`);
    await sleep(150);
    const depois = await ev(`(() => { const g = document.querySelector('[data-group="admin"]'); return { aberto: !g.classList.contains('is-collapsed'), aria: g.querySelector('.nav-group-btn').getAttribute('aria-expanded'), key: JSON.parse(localStorage.getItem('vistori_nav_grupos_v1') || '{}') }; })()`);
    if (!depois.aberto || depois.aria !== 'true' || depois.key.admin !== true) throw new Error('Administração não abriu/persistiu: ' + JSON.stringify(depois));
    await ir('#/modelos');
    await waitFor(`location.hash === '#/modelos' && !!document.querySelector('#app h2')`);
    const ativo = await ev(`(() => {
      const g = document.querySelector('[data-group="admin"]');
      const link = g.querySelector('a.on');
      return { hasActive: g.classList.contains('has-active'), aberto: !g.classList.contains('is-collapsed'), aria: g.querySelector('.nav-group-btn').getAttribute('aria-expanded'), link: link?.getAttribute('href') || '', current: link?.getAttribute('aria-current') || '', sombra: link ? getComputedStyle(link).boxShadow : '' };
    })()`);
    if (!ativo.hasActive || !ativo.aberto || ativo.aria !== 'true' || !ativo.link || ativo.current !== 'page') throw new Error('grupo ativo não ficou aberto/destacado: ' + JSON.stringify(ativo));
    if (!ativo.sombra || ativo.sombra === 'none') throw new Error('item ativo sem destaque visual');
    await viewport(1440, 1000, false);
    await shot('block2-menu-desktop-active.png');
    await ev(`document.querySelector('[data-group="admin"] .nav-group-btn').click()`);
    await sleep(100);
    if (await ev(`document.querySelector('[data-group="admin"]').classList.contains('is-collapsed')`)) throw new Error('grupo da página atual foi recolhido');
    await ir('#/');
    await waitFor(`!!document.querySelector('.dashboard-heading')`);
    await ev(`document.querySelector('[data-group="admin"] .nav-group-btn').click()`);
    await sleep(100);
    const fechadoNoDashboard = await ev(`document.querySelector('[data-group="admin"]').classList.contains('is-collapsed')`);
    if (!fechadoNoDashboard) throw new Error('não foi possível recolher Admin fora da página ativa');
    await send('Page.reload', { ignoreCache: false });
    await sleep(1600);
    await waitFor(`document.querySelector('#ver')?.textContent === 'v0.22.0'`);
    await waitFor(`!!document.querySelector('.dashboard-heading')`);
    const persistido = await ev(`document.querySelector('[data-group="admin"]').classList.contains('is-collapsed')`);
    if (!persistido) throw new Error('preferência recolhida não persistiu após reload');
    await ev(`document.querySelector('[data-group="admin"] .nav-group-btn').click()`);
    await sleep(100);
    return 'Admin recolhida no primeiro acesso; aberta/ativa destacada; preferência persistida';
  });

  await passo('menu responde a teclado e atalhos', async () => {
    await ir('#/');
    await waitFor(`!!document.querySelector('.dashboard-heading')`);
    const primeiro = await ev(`(() => { const a = document.querySelector('#nav a'); a.focus(); return a.getAttribute('href'); })()`);
    await tecla('ArrowDown', 'ArrowDown', 40);
    await sleep(120);
    const segundo = await ev(`document.activeElement?.closest('#nav') ? document.activeElement.getAttribute('href') : ''`);
    if (!segundo || segundo === primeiro) throw new Error('ArrowDown não navegou entre itens do menu: ' + primeiro + ' → ' + segundo);
    await tecla('Home', 'Home', 36);
    await sleep(80);
    if (await ev(`document.activeElement?.getAttribute('href')`) !== '#/') throw new Error('Home não voltou ao primeiro item');
    await tecla('k', 'KeyK', 75, 2);
    await waitFor(`!document.querySelector('#cmdk').hidden`);
    if (await ev(`document.activeElement?.id`) !== 'cmdk-input') throw new Error('Ctrl+K não focou a busca');
    await tecla('Escape', 'Escape', 27);
    await waitFor(`document.querySelector('#cmdk').hidden`);
    await ev(`document.querySelector('#nav-search').click()`);
    await waitFor(`!document.querySelector('#cmdk').hidden`);
    await tecla('Escape', 'Escape', 27);
    await waitFor(`document.querySelector('#cmdk').hidden`);
    await ev(`document.querySelector('#sidebar-toggle').click()`);
    await sleep(200);
    const recolhido = await ev(`(() => ({ classe: document.body.classList.contains('sidebar-collapsed'), salvo: localStorage.getItem('vistori_menu_recolhido') }))()`);
    if (!recolhido.classe || recolhido.salvo !== '1') throw new Error('recolhimento geral não persistiu: ' + JSON.stringify(recolhido));
    await ev(`document.querySelector('#sidebar-toggle').click()`);
    await sleep(200);
    if (await ev(`document.body.classList.contains('sidebar-collapsed')`)) throw new Error('menu não expandiu de volta');
    return 'ArrowDown/Home, Ctrl+K, busca, Esc e recolhimento OK';
  });

  await passo('menu e dashboard funcionam no celular', async () => {
    await viewport(390, 844, true);
    await ir('#/');
    await waitFor(`!!document.querySelector('.dashboard-heading')`);
    const visivel = await ev(`(() => ({
      toggle: getComputedStyle(document.querySelector('#nav-toggle')).display,
      tema: getComputedStyle(document.querySelector('#theme-toggle')).display
    }))()`);
    if (visivel.toggle === 'none') throw new Error('botão do menu escondido no celular');
    if (visivel.tema === 'none') throw new Error('alternador de tema escondido no celular');
    await ev(`document.querySelector('#nav-toggle').click()`);
    await sleep(300);
    const aberto = await ev(`(() => ({
      open: document.querySelector('#sidebar').classList.contains('open'),
      body: document.body.classList.contains('nav-open'),
      aria: document.querySelector('#nav-toggle').getAttribute('aria-expanded'),
      foco: !!document.activeElement?.closest('#nav')
    }))()`);
    if (!aberto.open || !aberto.body || aberto.aria !== 'true' || !aberto.foco) throw new Error('menu celular não abriu/focou: ' + JSON.stringify(aberto));
    await shotViewport('block2-menu-mobile-light.png');
    await tecla('Escape', 'Escape', 27);
    await sleep(250);
    const fechado = await ev(`(() => ({ open: document.querySelector('#sidebar').classList.contains('open'), foco: document.activeElement?.id || '' }))()`);
    if (fechado.open || fechado.foco !== 'nav-toggle') throw new Error('Esc não fechou/devolveu foco: ' + JSON.stringify(fechado));
    await shot('block2-dashboard-mobile-light.png');
    await ev(`document.querySelector('#nav-toggle').click()`);
    await sleep(250);
    await ev(`document.querySelector('#theme-toggle').click()`);
    await sleep(300);
    if (await ev(`document.documentElement.dataset.theme`) !== 'dark') throw new Error('tema escuro não ativou no celular');
    await tecla('Escape', 'Escape', 27);
    await sleep(200);
    await shot('block2-dashboard-mobile-dark.png');
    return 'menu celular, foco, Esc e tema escuro OK';
  });

  await passo('dashboard desktop no tema escuro', async () => {
    await viewport(1440, 1000, false);
    await ir('#/');
    await waitFor(`!!document.querySelector('.dashboard-heading')`);
    if (await ev(`document.documentElement.dataset.theme`) !== 'dark') await ev(`document.querySelector('#theme-toggle').click()`);
    await sleep(300);
    if (await ev(`document.documentElement.dataset.theme`) !== 'dark') throw new Error('tema escuro não ativou no desktop');
    const foto = await shot('block2-dashboard-desktop-dark.png');
    return foto;
  });

  await passo('gráficos vazios orientam sem inventar dados', async () => {
    await ev(`document.documentElement.dataset.theme = 'light'; localStorage.setItem('vistori_tema_v2', 'light'); true`);
    await ev(`(async () => {
      const db = await import('/src/core/db/index.js');
      for (const store of ['vistorias', 'clientes', 'obras', 'agendamentos', 'anomalias', 'recebimentos']) {
        for (const x of await db.all(store)) await db.del(store, x.id);
      }
      return true;
    })()`);
    await ir('#/vistorias');
    await ir('#/');
    await waitFor(`!!document.querySelector('.dashboard-heading')`);
    const vazio = await ev(`(() => ({
      kpis: document.querySelectorAll('.kpi-grid .kpi-card').length,
      chartsVazios: document.querySelectorAll('.chart-empty').length,
      continue: !!document.querySelector('.dashboard-continue'),
      agenda: document.querySelector('.dashboard-today').innerText,
      pend: document.querySelector('.dashboard-pending').innerText,
      texto: document.querySelector('#app').innerText,
      acoes: [...document.querySelectorAll('.chart-empty a')].map(a => a.getAttribute('href'))
    }))()`);
    if (vazio.kpis !== 4 || vazio.chartsVazios !== 2 || vazio.continue) throw new Error('estado vazio incorreto: ' + JSON.stringify(vazio));
    if (!vazio.agenda.includes('Nenhuma visita agendada para hoje') || !vazio.pend.includes('Ainda não há vistorias')) throw new Error('orientação de vazio ausente');
    if (vazio.texto.includes('Firebase')) throw new Error('aviso técnico de Firebase reapareceu');
    if (!vazio.acoes.includes('#/vistorias') || !vazio.acoes.includes('#/financeiro')) throw new Error('ações dos gráficos vazios: ' + vazio.acoes.join(','));
    const foto = await shot('block2-dashboard-empty-light.png');
    return `${foto} · 2 gráficos com orientação e ação`;
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
