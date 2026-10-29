// Teste ponta a ponta da integridade (v0.21.0). Rode: node tests/integrity-app.mjs
// Sobe um servidor local e um Chrome headless usando diretórios dentro de tests/.tmp-app.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = path.join(ROOT, 'tests', '.tmp-app');
const PORT = 8133;
const CDP_PORT = 9233;
const BASE = `http://127.0.0.1:${PORT}/`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const limpar = () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {} };
limpar();
fs.mkdirSync(TMP, { recursive: true });
const serverLog = fs.openSync(path.join(TMP, 'http.log'), 'a');
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: ['ignore', serverLog, serverLog] });
const chrome = spawn('google-chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${path.join(TMP, 'chrome')}`, 'about:blank'], { stdio: 'ignore' });
let ws;
let falhas = 0;
const resultados = [];
const erros = [];
const logs = [];
const dialogs = [];
let passoAtual = 'início';

async function esperarHttp(url, timeout = 15000) {
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
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${nome}${detalhe ? ' — ' + String(detalhe).slice(0, 220) : ''}`);
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
    setTimeout(() => { if (send.pend.has(id)) { send.pend.delete(id); rej(new Error('timeout ' + method)); } }, 30000);
  });
}
send.seq = 0; send.pend = new Map();
async function ev(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (r.exceptionDetails) throw new Error('JS: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
}
async function waitFor(expr, timeout = 12000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try { if (await ev(expr)) return true; } catch (e) {}
    await sleep(100);
  }
  throw new Error('timeout esperando: ' + expr);
}
async function ir(hash) {
  await ev(`location.hash = ${JSON.stringify(hash)}`);
  await sleep(450);
  await waitFor(`document.querySelector('#app') && document.querySelector('#app').innerHTML.length > 80`);
  await sleep(250);
}
async function set(sel, valor) {
  return ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) throw new Error('campo ausente: ' + ${JSON.stringify(sel)}); el.value = ${JSON.stringify(String(valor))}; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return el.value; })()`);
}
const idb = expr => `new Promise((res, rej) => { const r = indexedDB.open('vistori'); r.onsuccess = () => { const q = ${expr}; q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }; r.onerror = () => rej(r.error); })`;
const dbGet = (store, id) => ev(idb(`r.result.transaction('${store}').objectStore('${store}').get(${JSON.stringify(id)})`));
const dbAll = store => ev(idb(`r.result.transaction('${store}').objectStore('${store}').getAll()`));
const dbPut = (store, obj) => ev(`new Promise((res, rej) => { const r = indexedDB.open('vistori'); r.onsuccess = () => { const q = r.result.transaction('${store}', 'readwrite').objectStore('${store}').put(${JSON.stringify(obj)}); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }; r.onerror = () => rej(r.error); })`);

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
      const d = m.params;
      dialogs.push(`[${passoAtual}] ${d.type}: ${d.message}`);
      send('Page.handleJavaScriptDialog', { accept: true, promptText: 'Justificativa de teste para reabrir o laudo' }).catch(() => {});
    } else if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      erros.push(`[${passoAtual}] ${d.exception?.description || d.text}`);
    } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      logs.push(`[${passoAtual}] ` + m.params.args.map(a => a.value ?? a.description ?? '').join(' '));
    }
  };
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');

  await passo('abre a v0.21.0 em modo local', async () => {
    await send('Page.navigate', { url: BASE });
    await waitFor(`document.querySelector('#app') && document.querySelector('#ver')?.textContent === 'v0.21.0'`, 15000);
    return await ev(`document.querySelector('#ver').textContent`);
  });

  await passo('cadastra cliente e imóvel', async () => {
    await ir('#/clientes');
    await set('#f [name=pessoa]', 'PF');
    await set('#f [name=nome]', 'Cliente Integridade');
    await set('#f [name=documento]', '52998224725');
    await ev(`document.querySelector('#f').requestSubmit()`);
    await waitFor(`document.querySelector('#tb').innerText.includes('Cliente Integridade')`);
    await ir('#/obras');
    await set('#f [name=nome]', 'Casa Integridade');
    const cli = await ev(`document.querySelector('#f [name=clienteId]').options[1].value`);
    await set('#f [name=clienteId]', cli);
    await set('#f [name=tipo]', 'Residencial');
    await ev(`document.querySelector('#f').requestSubmit()`);
    await waitFor(`document.querySelector('#tb').innerText.includes('Casa Integridade')`);
    return 'cliente + obra';
  });

  await passo('modelo padrão é criado explicitamente pelo administrador local', async () => {
    await ir('#/modelos');
    const n = await ev(idb(`r.result.transaction('checklistModelos').objectStore('checklistModelos').count()`));
    if (n !== 0) throw new Error('modelo já existia/semeado: ' + n);
    const botao = await ev(`document.querySelector('#modelo-restaurar')?.textContent || ''`);
    if (botao !== 'Criar modelo padrão') throw new Error('botão: ' + botao);
    dialogs.length = 0;
    await ev(`document.querySelector('#modelo-restaurar').click()`);
    await waitFor(`document.querySelector('#modelos-lista').innerText.includes('Recebimento de imóvel — casa nova')`);
    const m = await ev(idb(`r.result.transaction('checklistModelos').objectStore('checklistModelos').get('mdl-recebimento-casa-nova')`));
    if (!m || m.itens.length !== 96) throw new Error('modelo sem 96 itens');
    return '10 categorias / 96 itens';
  });

const arquivoBase64 = (sel, nome, tipo, b64) => ev(`(() => { const input = document.querySelector(${JSON.stringify(sel)}); const bin = atob(${JSON.stringify(b64)}); const bytes = Uint8Array.from(bin, c => c.charCodeAt(0)); const dt = new DataTransfer(); dt.items.add(new File([bytes], ${JSON.stringify(nome)}, { type: ${JSON.stringify(tipo)} })); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true })); })()`);
const arquivoTexto = (sel, nome, texto) => ev(`(() => { const input = document.querySelector(${JSON.stringify(sel)}); const dt = new DataTransfer(); dt.items.add(new File([${JSON.stringify(texto)}], ${JSON.stringify(nome)}, { type: 'text/plain' })); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true })); })()`);
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z0ZkAAAAASUVORK5CYII=';
const clone = o => JSON.parse(JSON.stringify(o));

  let vistoriaId = '';
  await passo('cria vistoria com modelo, itens, foto, anomalia, documento e dados do imóvel', async () => {
    await ir('#/vistorias');
    const obra = await ev(`[...document.querySelector('#nv [name=obraId]').options].find(o => o.textContent.includes('Casa Integridade')).value`);
    await set('#nv [name=obraId]', obra);
    await set('#nv [name=tipo]', 'Vistoria de entrega');
    await set('#nv [name=modeloId]', 'mdl-recebimento-casa-nova');
    await ev(`document.querySelector('#nv').requestSubmit()`);
    await waitFor(`location.hash.startsWith('#/vistoria/')`);
    vistoriaId = await ev(`location.hash.split('/').pop()`);
    await waitFor(`document.querySelectorAll('.item').length === 96`);
    await set('.item select[data-i="0"][data-f="status"]', 'C');
    await set('.item select[data-i="1"][data-f="status"]', 'N');
    await set('.item textarea[data-i="1"][data-f="obs"]', 'Observação do item.');
    const campos = {
      contratante: 'Contratante Teste', proprietario: 'Proprietário Teste', empreendimento: 'Empreendimento Teste',
      procuradora: 'Procuradora Teste', unidade: 'Casa 1', matricula: '123', areaLote: '160',
      areaConstruida: '43.85', incorporadora: 'Construtora Teste', responsavelConstrutora: 'Responsável Teste',
      tipoImovel: 'NOVO', observacoesGerais: 'Observação geral da vistoria.'
    };
    for (const [k, v] of Object.entries(campos)) await set(`[data-h="${k}"]`, v);
    await set('[data-h="orientacoes"]', 'Contato no local.');
    await set('[data-h="laudoObjetivo"]', 'Objetivo do laudo de teste.');
    await sleep(700);
    await arquivoBase64('input[data-photo="1"]', 'foto.png', 'image/png', PNG);
    await waitFor(`document.querySelectorAll('.item .foto img[src^="data:image"]').length >= 1`, 15000);
    await ev(`document.querySelector('a[data-anom-item="1"]').click()`);
    await sleep(300);
    await set('#anom-form [name=titulo]', 'Anomalia de teste');
    await set('#anom-form [name=gravidade]', 'Alta');
    await set('#anom-form [name=ambiente]', 'Sala');
    await set('#anom-form [name=prazo]', '30 dias');
    await set('#anom-form [name=responsavel]', 'Construtora');
    await set('#anom-form [name=descricao]', 'Descrição da anomalia.');
    await arquivoBase64('#anom-foto', 'anomalia.png', 'image/png', PNG);
    await ev(`document.querySelector('#anom-form').requestSubmit()`);
    await waitFor(`document.querySelector('.anom-list').innerText.includes('Anomalia de teste')`);
    await ev(`document.querySelector('[data-aba="documentos"]').click()`);
    await sleep(200);
    await set('#vdoc-form [name=tipo]', 'ART');
    await set('#vdoc-form [name=nome]', 'ART de teste');
    await arquivoTexto('#vdoc-file', 'art.txt', 'ART de teste');
    await ev(`document.querySelector('#vdoc-form').requestSubmit()`);
    await waitFor(`document.body.innerText.includes('ART de teste')`);
    return 'dados e vínculos preenchidos';
  });

  await passo('assina com hash v2 e 8 grupos', async () => {
    dialogs.length = 0;
    await ev(`document.querySelector('[data-aba="laudo"]').click()`);
    await sleep(250);
    await ev(`HTMLCanvasElement.prototype.setPointerCapture = function(){};
      (() => { const c = document.querySelector('#sig'); const r = c.getBoundingClientRect();
        const p = (t,x,y) => c.dispatchEvent(new PointerEvent(t, { clientX: r.left + x, clientY: r.top + y, pointerId: 1, bubbles: true }));
        p('pointerdown', 30, 40); p('pointermove', 100, 80); p('pointermove', 180, 60); p('pointerup', 180, 60); })();
      document.querySelector('#signNome').value = 'Victoria Teste';
      document.querySelector('#sign').click();`);
    await waitFor(`location.hash.startsWith('#/laudo/')`, 15000);
    await waitFor(`document.querySelector('.laudo') && document.querySelector('.laudo').innerText.includes('SHA-256')`, 15000);
    const v = await dbGet('vistorias', vistoriaId);
    if (v.status !== 'assinada' || v.assinatura?.hashVersao !== 2) throw new Error('assinatura v2 ausente');
    if (Object.keys(v.assinatura.grupos || {}).length !== 8) throw new Error('grupos: ' + Object.keys(v.assinatura.grupos || {}).join(','));
    const txt = await ev(`document.querySelector('.laudo').innerText`);
    if (!txt.includes('formato v2') || !txt.includes('Cobre vistoria, itens, fotos, anomalias e documentos')) throw new Error('laudo sem escopo v2');
    return `${v.numeroLaudo} · ${v.assinatura.hash.slice(0, 12)}…`;
  });


  const verificar = async (tipo, grupo) => {
    dialogs.length = 0;
    await ev(`document.querySelector('#verif').click()`);
    await sleep(1100);
    const msg = dialogs.find(d => d.includes(tipo));
    if (!msg) throw new Error(`esperava ${tipo}: ${dialogs.join(' | ')}`);
    if (grupo && !msg.includes(grupo)) throw new Error(`esperava grupo ${grupo}: ${msg}`);
    return msg;
  };

  await passo('verifica integridade sem alterações e depois da ciência', async () => {
    await verificar('ÍNTEGRO');
    await set('#ciencia-nome', 'Cliente Ciente');
    await ev(`document.querySelector('#ciencia-btn').click()`);
    await waitFor(`document.querySelector('#app').innerText.includes('Cliente Ciente')`);
    await verificar('ÍNTEGRO');
    return 'hash estável após ciência';
  });

  const v0 = await dbGet('vistorias', vistoriaId);
  const anom0 = (await dbAll('anomalias')).find(a => a.vistoriaId === vistoriaId);
  const doc0 = (await dbAll('documentos')).find(d => d.vistoriaId === vistoriaId);
  const fotoId = v0.itens[1].fotos[0].id;
  const foto0 = await dbGet('fotos', fotoId);

  await passo('alteração de anomalia é detectada no grupo anomalias', async () => {
    const a = clone(anom0); a.status = 'Corrigida';
    await dbPut('anomalias', a);
    const msg = await verificar('ALTERADO', 'anomalias');
    await dbPut('anomalias', anom0);
    await verificar('ÍNTEGRO');
    return msg.slice(0, 120);
  });

  await passo('alteração de documento é detectada no grupo documentos', async () => {
    const d = clone(doc0); d.nome = 'Documento alterado';
    await dbPut('documentos', d);
    const msg = await verificar('ALTERADO', 'documentos');
    await dbPut('documentos', doc0);
    await verificar('ÍNTEGRO');
    return msg.slice(0, 120);
  });

  await passo('alteração de foto é detectada no grupo fotos dos itens', async () => {
    const f = clone(foto0); f.src = 'data:image/png;base64,AAAA';
    await dbPut('fotos', f);
    const msg = await verificar('ALTERADO', 'fotos dos itens');
    await dbPut('fotos', foto0);
    await verificar('ÍNTEGRO');
    return msg.slice(0, 120);
  });


  await passo('alteração de dado do imóvel é detectada no grupo dados do imóvel', async () => {
    const v = clone(v0); v.matricula = '999';
    await dbPut('vistorias', v);
    const msg = await verificar('ALTERADO', 'dados do imóvel');
    await dbPut('vistorias', v0);
    await verificar('ÍNTEGRO');
    return msg.slice(0, 120);
  });

  await passo('alteração de item/observação é detectada no grupo itens do checklist', async () => {
    const v = clone(v0); v.itens[1].obs = 'Observação alterada';
    await dbPut('vistorias', v);
    const msg = await verificar('ALTERADO', 'itens do checklist');
    await dbPut('vistorias', v0);
    await verificar('ÍNTEGRO');
    return msg.slice(0, 120);
  });

  await passo('alteração do modelo é detectada no grupo modelo de checklist', async () => {
    const v = clone(v0); v.checklistModeloNome = 'Modelo alterado';
    await dbPut('vistorias', v);
    const msg = await verificar('ALTERADO', 'modelo de checklist');
    await dbPut('vistorias', v0);
    await verificar('ÍNTEGRO');
    return msg.slice(0, 120);
  });

  await passo('alteração da vistoria é detectada no grupo dados da vistoria', async () => {
    const v = clone(v0); v.orientacoes = 'Orientação alterada';
    await dbPut('vistorias', v);
    const msg = await verificar('ALTERADO', 'dados da vistoria');
    await dbPut('vistorias', v0);
    await verificar('ÍNTEGRO');
    return msg.slice(0, 120);
  });

  await passo('alteração de observações gerais é detectada no grupo observações gerais', async () => {
    const v = clone(v0); v.observacoesGerais = 'Observação alterada';
    await dbPut('vistorias', v);
    const msg = await verificar('ALTERADO', 'observações gerais');
    await dbPut('vistorias', v0);
    await verificar('ÍNTEGRO');
    return msg.slice(0, 120);
  });

  await passo('gera e baixa PDF do laudo assinado com nome seguro', async () => {
    if (!(await ev(`!!(window.jspdf && window.jspdf.jsPDF)`))) throw new Error('jsPDF não carregado');
    if (!(await ev(`!!document.querySelector('#pdf-gerar') && !!document.querySelector('#pdf-baixar') && !!document.querySelector('#pdf-anexar')`))) throw new Error('botões de PDF ausentes');
    if (!(await ev(`!!document.querySelector('button[onclick="print()"]')`))) throw new Error('botão de impressão removido');
    await ev(`window.__pdfClickOriginal = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function(){ window.__download = { href: this.href, download: this.download }; };`);
    await ev(`document.querySelector('#pdf-gerar').click()`);
    await waitFor(`document.querySelector('#pdf-status')?.textContent.startsWith('PDF gerado')`, 30000);
    const status = await ev(`document.querySelector('#pdf-status').textContent`);
    await ev(`document.querySelector('#pdf-baixar').click()`);
    await waitFor(`!!window.__download`, 15000);
    const download = await ev(`window.__download.download`);
    const arquivo = await ev(`(async () => { const r = await fetch(window.__download.href); const b = await r.arrayBuffer(); const u = new Uint8Array(b.slice(0, 5)); return { bytes: b.byteLength, header: String.fromCharCode(...u) }; })()`);
    await ev(`HTMLAnchorElement.prototype.click = window.__pdfClickOriginal; delete window.__pdfClickOriginal; delete window.__download;`);
    if (!/^Vistoria_.+_Cliente_Integridade\.pdf$/.test(download)) throw new Error('nome inseguro: ' + download);
    if (arquivo.header !== '%PDF-' || arquivo.bytes < 1000) throw new Error('arquivo não é um PDF válido: ' + JSON.stringify(arquivo));
    return `${status} · ${download} · ${arquivo.bytes} bytes`;
  });

  await passo('anexa PDF ao laudo assinado sem alterar o hash', async () => {
    const antes = await dbGet('vistorias', vistoriaId);
    dialogs.length = 0;
    await ev(`document.querySelector('#pdf-anexar').click()`);
    await waitFor(`document.querySelector('#pdf-anexar')?.disabled && document.querySelector('#pdf-anexar').textContent.includes('PDF anexado')`, 30000);
    const pdfs = (await dbAll('documentos')).filter(d => d.vistoriaId === vistoriaId && d.pdfAssinatura === true);
    if (pdfs.length !== 1) throw new Error('PDFs gerados: ' + pdfs.length);
    const d = pdfs[0];
    if (d.tipo !== 'Laudo técnico' || d.mime !== 'application/pdf') throw new Error('tipo/mime incorretos');
    if (!d.nome.startsWith('Vistoria_') || !d.nome.endsWith('.pdf')) throw new Error('nome do anexo: ' + d.nome);
    if (!d.src.startsWith('data:application/pdf;base64,')) throw new Error('src do PDF inválido');
    if (d.hashLaudo !== antes.assinatura.hash || d.versaoLaudo !== antes.versao) throw new Error('vínculo com a versão assinada incorreto');
    if ((d.cienciaEm || '') !== (antes.cienciaCliente?.em || '')) throw new Error('ciência do PDF não corresponde à do laudo');
    const depois = await dbGet('vistorias', vistoriaId);
    if (JSON.stringify(depois) !== JSON.stringify(antes)) throw new Error('a vistoria assinada foi alterada');
    await verificar('ÍNTEGRO');
    return `${Math.round(d.tamanho / 1024)} KB · hash estável após o anexo`;
  });


  await passo('GED não anexa documento a laudo assinado', async () => {
    await ir('#/documentos');
    const opcao = await ev(`[...document.querySelector('#doc-form [name=vinculo]').options].find(o => o.value === 'vistoria:${vistoriaId}')?.value || ''`);
    if (!opcao) throw new Error('vistoria não aparece no vínculo do GED');
    await set('#doc-form [name=tipo]', 'Contrato');
    await set('#doc-form [name=nome]', 'Tentativa assinada');
    await set('#doc-form [name=vinculo]', opcao);
    await arquivoTexto('#doc-file', 'tentativa.txt', 'não deveria entrar');
    dialogs.length = 0;
    await ev(`document.querySelector('#doc-form').requestSubmit()`);
    await sleep(800);
    if (!dialogs.some(d => /Laudo assinado/.test(d))) throw new Error('sem bloqueio: ' + dialogs.join(' | '));
    const docs = await dbAll('documentos');
    if (docs.some(d => d.nome === 'Tentativa assinada')) throw new Error('documento foi gravado');
    return 'upload bloqueado no GED';
  });

  await passo('reabre com nova versão e arquiva o histórico anterior', async () => {
    await ir('#/vistoria/' + vistoriaId);
    await waitFor(`!!document.querySelector('[data-reopen]')`);
    dialogs.length = 0;
    await ev(`document.querySelector('[data-reopen]').click()`);
    await sleep(1800);
    const v = await dbGet('vistorias', vistoriaId);
    if (v.status !== 'rascunho' || v.versao !== 2 || v.assinatura) throw new Error('não reabriu: ' + JSON.stringify({ status: v.status, versao: v.versao, sig: !!v.assinatura }));
    const vers = (await dbAll('versoes')).filter(x => x.vistoriaId === vistoriaId).sort((a, b) => (a.reabertoEm || '').localeCompare(b.reabertoEm || ''));
    const snap = vers[vers.length - 1];
    if (!snap || !snap.vistoria?.itens || snap.vistoria.itens.length !== 96) throw new Error('snapshot da vistoria ausente');
    if (!snap.anomalias?.length || !snap.documentos?.length || !snap.fotos?.length) throw new Error('snapshot de vínculos incompleto');
    if (snap.assinatura?.hashVersao !== 2 || !snap.assinatura.grupos) throw new Error('assinatura anterior não arquivada');
    await waitFor(`!!document.querySelector('#anom-form') && !!document.querySelector('#vdoc-form')`);
    if (await ev(`document.querySelector('fieldset')?.disabled`)) throw new Error('vistoria continua bloqueada');
    if (!(await ev(`!!document.querySelector('[data-anom-status]')`))) throw new Error('anomalia continua em modo leitura');
    return `v${v.versao} · snapshot ${snap.vistoria.itens.length} itens, ${snap.anomalias.length} anomalia(s), ${snap.documentos.length} documento(s)`;
  });

  let legadoId = '';
  await passo('vistoria antiga (hash legado) continua verificando', async () => {
    await ir('#/vistorias');
    const obra = await ev(`[...document.querySelector('#nv [name=obraId]').options].find(o => o.textContent.includes('Casa Integridade')).value`);
    await set('#nv [name=obraId]', obra);
    await set('#nv [name=tipo]', 'Vistoria de entrega');
    await set('#nv [name=modeloId]', '');
    await ev(`document.querySelector('#nv').requestSubmit()`);
    await waitFor(`location.hash.startsWith('#/vistoria/')`);
    legadoId = await ev(`location.hash.split('/').pop()`);
    await waitFor(`document.querySelectorAll('.item').length === 17`);
    const info = await ev(`(async () => {
      const v = await new Promise((res, rej) => { const r = indexedDB.open('vistori'); r.onsuccess = () => { const q = r.result.transaction('vistorias').objectStore('vistorias').get(${JSON.stringify(legadoId)}); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }; r.onerror = () => rej(r.error); });
      const lm = await import('/src/core/laudo.js');
      const fm = await import('/src/core/fotos.js');
      const ts = new Date().toISOString();
      const hash = await lm.calcHash(v, ts);
      const fotosSha = await fm.fotosSha(v);
      v.assinatura = { nome: 'Legado', img: '', ts, hash, fotosSha };
      v.status = 'assinada';
      v.versao = 1;
      await new Promise((res, rej) => { const r = indexedDB.open('vistori'); r.onsuccess = () => { const q = r.result.transaction('vistorias', 'readwrite').objectStore('vistorias').put(v); q.onsuccess = () => res(); q.onerror = () => rej(q.error); }; r.onerror = () => rej(r.error); });
      return { hash, ts };
    })()`);
    await ir('#/laudo/' + legadoId);
    await waitFor(`document.querySelector('.laudo') && document.querySelector('.laudo').innerText.includes('formato v1')`);
    const msg = await verificar('ÍNTEGRO');
    if (!msg.includes('Formato antigo')) throw new Error('verificação legada sem aviso: ' + msg);
    return info.hash.slice(0, 12) + '…';
  });


  await passo('gera PDF de laudo antigo offline e mantém o shell disponível', async () => {
    if (!legadoId) throw new Error('vistoria antiga não criada');
    await ir('#/laudo/' + legadoId);
    await sleep(1200);
    const sw = await ev(`navigator.serviceWorker.ready.then(r => !!r.active)`);
    if (!sw) throw new Error('service worker inativo');
    await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    try {
      await send('Page.reload', { ignoreCache: false });
      await sleep(3000);
      await waitFor(`document.querySelector('.laudo') && !!document.querySelector('#pdf-gerar')`, 15000);
      await ev(`document.querySelector('#pdf-gerar').click()`);
      await waitFor(`document.querySelector('#pdf-status')?.textContent.startsWith('PDF gerado')`, 30000);
      const status = await ev(`document.querySelector('#pdf-status').textContent`);
      return `legado offline · ${status}`;
    } finally {
      await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    }
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
  await sleep(600);
  limpar();
  console.log('\n===== RESUMO =====');
  const listaFalhas = resultados.filter(r => !r.ok);
  console.log(`${resultados.length - listaFalhas.length}/${resultados.length} verificações passaram`);
  if (erros.length) { console.log('\nExceções:'); [...new Set(erros)].forEach(e => console.log(' -', e.slice(0, 500))); }
  if (logs.length) { console.log('\nConsole error:'); [...new Set(logs)].forEach(e => console.log(' -', e.slice(0, 500))); }
  if (dialogs.length) { console.log('\nDiálogos:'); dialogs.forEach(d => console.log(' -', d.slice(0, 240))); }
  if (listaFalhas.length) { console.log('\nFALHAS:'); listaFalhas.forEach(f => console.log(' ✗', f.nome, '—', f.detalhe)); }
  process.exit(listaFalhas.length ? 1 : 0);
}

