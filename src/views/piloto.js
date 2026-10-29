// Piloto visual isolado: nenhum dado daqui é gravado no banco do app.
import { app, esc, abrirMarcador } from '../core/dom.js';
import { comprimir, dataBR } from '../core/utils.js';

const svgFoto = (titulo, fundo, detalhe) => 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640" viewBox="0 0 960 640"><rect width="960" height="640" fill="${fundo}"/><rect x="70" y="70" width="820" height="500" rx="18" fill="#ffffff" opacity=".18"/><path d="M120 500h720M160 500V250l180-110 180 110v250M520 500V300h210v200" fill="none" stroke="#ffffff" opacity=".65" stroke-width="14" stroke-linejoin="round"/><rect x="190" y="310" width="100" height="100" fill="#ffffff" opacity=".35"/><rect x="570" y="350" width="100" height="80" fill="#ffffff" opacity=".35"/><text x="70" y="610" fill="#ffffff" font-family="sans-serif" font-size="28">${titulo}</text><text x="70" y="635" fill="#ffffff" opacity=".75" font-family="sans-serif" font-size="18">${detalhe}</text></svg>`);

const DEMO = {
  imovel: 'Apartamento Jardim das Acácias', cliente: 'Marina e Rafael',
  tipo: 'Vistoria de entrega', data: '2026-10-29', hora: '09:30', numeroLaudo: 'VST-2026-0071',
  endereco: 'Rua das Acácias, 240 — Bloco B, ap. 72', cidade: 'Cuiabá/MT', unidade: 'Ap. 72',
  matricula: '41.882', areaConstruida: '92,4', responsavel: 'Marina Duarte', crea: 'MT 18422', artNumero: '',
  nome: 'Marina Duarte', assinatura: false, status: 'rascunho',
  laudoObjetivo: 'Registrar as condições de entrega do imóvel e orientar as correções necessárias.',
  laudoMetodologia: 'Inspeção visual dos ambientes e sistemas acessíveis, com registro fotográfico e checklist.',
  laudoRecomendacoes: 'Corrigir as ocorrências apontadas antes da ocupação e revisar os pontos elétricos e hidráulicos.',
  laudoConclusao: 'O imóvel apresenta condições gerais de uso, com pendências pontuais de acabamento e vedação.',
  docs: [
    { tipo: 'ART', nome: 'ART 2026/014', tamanho: '142 KB' },
    { tipo: 'Projeto', nome: 'Projeto arquitetônico — revisão 03', tamanho: '2,1 MB' }
  ],
  itens: [
    { id: 'i1', cat: 'Acesso e fachada', desc: 'Portão de entrada', status: 'C', obs: 'Abertura e fechamento sem folgas.', fotos: [{ id: 'f1', legenda: 'Portão visto da calçada', src: svgFoto('Portão de entrada', '#6f817c', 'Acesso principal') }], anomalia: null },
    { id: 'i2', cat: 'Acesso e fachada', desc: 'Fachada', status: 'N', obs: 'Trinca horizontal sob a janela do quarto.', fotos: [{ id: 'f2', legenda: 'Fachada — trinca sob a janela', src: svgFoto('Fachada', '#7f8c88', 'Trinca sob a janela') }], anomalia: { titulo: 'Trinca na fachada', gravidade: 'Alta', status: 'Aberta' } },
    { id: 'i3', cat: 'Acesso e fachada', desc: 'Iluminação externa', status: '', obs: '', fotos: [], anomalia: null },
    { id: 'i4', cat: 'Sala e circulação', desc: 'Piso de madeira', status: 'N', obs: 'Mancha escura próxima à varanda.', fotos: [{ id: 'f3', legenda: 'Piso — mancha junto à varanda', src: svgFoto('Piso de madeira', '#9b8164', 'Mancha junto à varanda') }], anomalia: { titulo: 'Mancha no piso', gravidade: 'Média', status: 'Em correção' } },
    { id: 'i5', cat: 'Sala e circulação', desc: 'Pintura das paredes', status: '', obs: '', fotos: [], anomalia: null },
    { id: 'i6', cat: 'Sala e circulação', desc: 'Tomadas e interruptores', status: 'NA', obs: 'Não aplicável nesta entrega.', fotos: [], anomalia: null },
    { id: 'i7', cat: 'Cozinha e serviço', desc: 'Bancada e cuba', status: 'C', obs: 'Sem infiltrações aparentes.', fotos: [{ id: 'f4', legenda: 'Bancada e cuba', src: svgFoto('Bancada e cuba', '#667c7d', 'Cozinha') }], anomalia: null },
    { id: 'i8', cat: 'Cozinha e serviço', desc: 'Torneira', status: '', obs: '', fotos: [], anomalia: null }
  ]
};

const STATUS = [
  { k: '', label: 'Não avaliado', icon: '○' },
  { k: 'C', label: 'Conforme', icon: '✓' },
  { k: 'N', label: 'Não conforme', icon: '✕' },
  { k: 'NA', label: 'N/A', icon: '—' }
];
const estado = { item: 0, foto: 0 };
let sheetTipo = '';
let sheetTrigger = null;
let lightboxTrigger = null;
let acoesLigadas = false;

const statusInfo = k => STATUS.find(s => s.k === k) || STATUS[0];
const tone = k => 'pst-' + (k ? k.toLowerCase() : 'empty');
const stats = arr => {
  const total = arr.length; const c = arr.filter(i => i.status === 'C').length; const n = arr.filter(i => i.status === 'N').length;
  const na = arr.filter(i => i.status === 'NA').length; const pend = arr.filter(i => !i.status).length;
  return { total, c, n, na, pend, av: c + n + na, pct: total ? Math.round((c + n + na) / total * 100) : 0 };
};
const categorias = () => [...new Set(DEMO.itens.map(i => i.cat))];
const itemAtual = () => DEMO.itens[estado.item];
const fotoAtual = () => itemAtual().fotos[estado.foto] || null;
const catStats = cat => stats(DEMO.itens.filter(i => i.cat === cat));

const pendentes = () => DEMO.itens.map((it, i) => ({ it, i })).filter(x => !x.it.status);
const naoConformes = () => DEMO.itens.map((it, i) => ({ it, i })).filter(x => x.it.status === 'N');
const anomalias = () => DEMO.itens.map((it, i) => ({ it, i })).filter(x => x.it.anomalia);
const proximoPendente = () => {
  const total = DEMO.itens.length;
  for (let passo = 1; passo <= total; passo++) {
    const i = (estado.item + passo) % total;
    if (!DEMO.itens[i].status) return i;
  }
  return -1;
};

function renderPiloto() {
  const it = itemAtual();
  if (!it) return;
  if (estado.foto >= it.fotos.length) estado.foto = 0;
  const foto = fotoAtual();
  const s = stats(DEMO.itens);
  const cats = categorias();
  const catHtml = cats.map(cat => {
    const cs = catStats(cat);
    const ativa = it.cat === cat;
    return `<button type="button" class="pilot-cat ${ativa ? 'is-active' : ''}" data-pilot-cat="${esc(cat)}" aria-pressed="${ativa}"><span class="pilot-cat-name">${esc(cat)}</span><span class="pilot-cat-counts">${cs.c} ok · ${cs.n} N · ${cs.na} N/A · ${cs.pend} pend.</span><progress max="${cs.total || 1}" value="${cs.av}" aria-label="Progresso de ${esc(cat)}"></progress></button>`;
  }).join('');
  const opcoesCat = cats.map(cat => { const cs = catStats(cat); return `<option value="${esc(cat)}" ${it.cat === cat ? 'selected' : ''}>${esc(cat)} — ${cs.pend} pendência(s)</option>`; }).join('');
  const statusOpts = STATUS.map(st => `<label class="pilot-status-option ${tone(st.k)} ${it.status === st.k ? 'is-selected' : ''}"><input type="radio" name="pilot-status" value="${st.k}" data-pilot-status ${it.status === st.k ? 'checked' : ''}><span><b aria-hidden="true">${st.icon}</b>${st.label}</span></label>`).join('');
  const info = statusInfo(it.status);
  const fotoHtml = foto ? `<div class="pilot-photo-context"><div class="pilot-photo-large"><img class="pilot-photo" src="${foto.src}" alt="${esc(foto.legenda || it.desc)}"><span class="pilot-photo-error" hidden>Não foi possível carregar esta imagem.</span></div><div class="pilot-photo-meta"><p class="pilot-kicker">Contexto da evidência</p><p class="pilot-context-line"><span>Item</span><b>${esc(it.desc)}</b></p><label for="pilot-legend">Legenda</label><input id="pilot-legend" data-pilot-legend value="${esc(foto.legenda || '')}" placeholder="Descreva a evidência"><p class="pilot-context-line"><span>Observação do item</span><span class="pilot-context-value" data-pilot-obs-text>${esc(it.obs || '—')}</span></p><p class="pilot-item-state">${it.status === 'N' ? 'Item não conforme no checklist' : it.status === 'C' ? 'Item conforme' : it.status === 'NA' ? 'Item não aplicável' : 'Item não avaliado'}</p>${it.anomalia ? `<div class="pilot-anomaly-context"><span>Anomalia vinculada</span><b>${esc(it.anomalia.titulo)}</b><small>${esc(it.anomalia.gravidade)} · ${esc(it.anomalia.status)}</small></div>` : `<p class="pilot-no-anomaly">${it.status === 'N' ? 'Este item não tem registro de anomalia vinculado.' : 'Nenhuma anomalia vinculada a este item.'}</p>`}<div class="pilot-photo-actions"><button type="button" class="btn btn-sm" data-pilot-zoom>Ampliar</button><button type="button" class="btn btn-sm ghost" data-pilot-mark>Marcar</button><button type="button" class="btn btn-sm ghost pilot-danger-action" data-pilot-remove>Remover</button></div></div></div>` : `<div class="pilot-empty"><b>Sem foto vinculada</b><p>Este item ainda não tem evidência fotográfica.</p><label class="btn btn-sm" for="pilot-file">Anexar foto</label></div>`;
  const thumbs = it.fotos.length ? it.fotos.map((f, j) => `<button type="button" class="pilot-thumb ${j === estado.foto ? 'is-active' : ''}" data-pilot-photo="${j}" aria-label="Selecionar evidência ${j + 1} de ${esc(it.desc)}"><span class="pilot-thumb-img"><img class="pilot-photo" src="${f.src}" alt="${esc(f.legenda || it.desc)}" loading="lazy"><span class="pilot-photo-error" hidden>Imagem indisponível</span></span><span class="pilot-thumb-legend" data-pilot-thumb-legend="${esc(f.id)}">${esc(f.legenda || 'Sem legenda')}</span></button>`).join('') : '';
  const next = proximoPendente();
  const tomBadge = tone(it.status);
  app.innerHTML = `<div class="pilot" data-pilot-root>
    <header class="pilot-header">
      <div class="pilot-heading"><p class="pilot-eyebrow">Piloto visual · dados fictícios · nada é salvo</p><h2>${esc(DEMO.imovel)}</h2><p>${esc(DEMO.cliente)} · ${esc(DEMO.endereco)} · ${esc(DEMO.tipo)}</p></div>
      <div class="pilot-header-meta"><span class="status-badge draft">Rascunho</span><span class="pilot-demo-tag">Demonstração isolada</span><a class="btn btn-sm ghost" href="#/vistorias">Tela atual</a></div>
      <div class="pilot-progress"><div class="pilot-progress-copy"><span>Progresso do checklist</span><b id="pilot-progress-label">${s.av} de ${s.total} · ${s.pct}%</b></div><progress id="pilot-progress-bar" max="${s.total || 1}" value="${s.av}" aria-label="Progresso da inspeção"></progress><p id="pilot-progress-meta">${s.pend} pendente(s) · ${s.n} não conforme(s) · ${s.na} N/A</p></div>
    </header>
    <div class="pilot-toolbar" aria-label="Acessos do piloto"><button type="button" class="pilot-tool" data-pilot-sheet="dados">Dados gerais</button><button type="button" class="pilot-tool" data-pilot-sheet="docs">Documentos</button><button type="button" class="pilot-tool" data-pilot-sheet="laudo">Laudo</button><button type="button" class="pilot-tool pilot-tool-strong" data-pilot-sheet="revisao">Revisão final</button></div>
    <div class="pilot-mobile-cat"><label for="pilot-cat-mobile">Categoria</label><select id="pilot-cat-mobile" data-pilot-cat-select>${opcoesCat}</select></div>
    <div class="pilot-grid">
      <aside class="pilot-cat-index" aria-label="Categorias da inspeção"><div class="pilot-index-head"><h3>Categorias</h3><span>${cats.length}</span></div><div class="pilot-cat-list">${catHtml}</div><p class="pilot-index-hint">Selecione uma categoria para revisar os itens.</p></aside>
      <main class="pilot-main">
        <div class="pilot-item-head"><div><p class="pilot-kicker">${esc(it.cat)}</p><h3 id="pilot-item-title" tabindex="-1">${esc(it.desc)}</h3></div><span id="pilot-item-badge" class="pilot-item-badge ${tone(it.status)}">${info.icon} ${info.label}</span></div>
        <div class="pilot-item-nav"><button type="button" class="pilot-nav-btn" data-pilot-prev aria-label="Item anterior">← Anterior</button><span>Item ${estado.item + 1} de ${DEMO.itens.length}</span><button type="button" class="pilot-nav-btn" data-pilot-next-item aria-label="Próximo item">Próximo →</button></div>
        <div class="pilot-status-options" role="radiogroup" aria-label="Avaliação de ${esc(it.desc)}">${statusOpts}</div>
        <label for="pilot-obs">Observações do item</label><textarea id="pilot-obs" data-pilot-obs placeholder="Registre a observação deste item…">${esc(it.obs || '')}</textarea>
        <div class="pilot-item-actions"><label class="btn btn-sm ghost" for="pilot-file">Anexar foto</label><button type="button" class="btn btn-sm" data-pilot-next ${next < 0 ? 'disabled' : ''}>${next < 0 ? 'Nenhum pendente' : 'Próximo pendente'}</button><button type="button" class="btn btn-sm ghost" data-pilot-sheet="revisao">Revisar antes de assinar</button></div>
      </main>
      <aside class="pilot-evidence"><details open><summary><span>Evidências</span><span class="pilot-evidence-count">${it.fotos.length}</span></summary><div class="pilot-evidence-body">${it.fotos.length ? `<div class="pilot-thumbs">${thumbs}</div>` : ''}<div class="pilot-context-slot">${fotoHtml}</div></div></details></aside>
    </div>
    <input id="pilot-file" class="pilot-file-input" type="file" accept="image/*" data-pilot-add>
    <div id="pilot-sheet-backdrop" class="pilot-sheet-backdrop" hidden></div>
    <aside id="pilot-sheet" class="pilot-sheet" role="dialog" aria-modal="true" aria-labelledby="pilot-sheet-title" hidden><div class="pilot-sheet-head"><div><p class="pilot-eyebrow">Piloto visual</p><h2 id="pilot-sheet-title"></h2></div><button type="button" class="pilot-sheet-close" data-pilot-sheet-close aria-label="Fechar painel">×</button></div><div id="pilot-sheet-body" class="pilot-sheet-body"></div></aside>
    <div id="pilot-lightbox" class="pilot-lightbox" role="dialog" aria-modal="true" aria-labelledby="pilot-lightbox-title" hidden><div class="pilot-lightbox-panel"><button type="button" class="pilot-sheet-close" data-pilot-lightbox-close aria-label="Fechar imagem">×</button><img id="pilot-lightbox-img" alt=""><span id="pilot-lightbox-error" class="pilot-photo-error" hidden>Não foi possível carregar esta imagem.</span><div id="pilot-lightbox-context" class="pilot-lightbox-context"></div></div></div>
  </div>`;
  ligarErrosDeImagem();
  if (sheetTipo) preencherSheet();
}

function ligarErrosDeImagem() {
  document.querySelectorAll('.pilot-photo').forEach(img => {
    const fallback = img.closest('.pilot-thumb-img, .pilot-photo-large')?.querySelector('.pilot-photo-error');
    const falhar = () => { img.hidden = true; if (fallback) fallback.hidden = false; };
    img.addEventListener('error', falhar, { once: true });
    if (img.complete && img.naturalWidth === 0) falhar();
  });
}

function atualizarResumoPiloto() {
  const s = stats(DEMO.itens);
  const label = document.querySelector('#pilot-progress-label'); if (label) label.textContent = `${s.av} de ${s.total} · ${s.pct}%`;
  const bar = document.querySelector('#pilot-progress-bar'); if (bar) { bar.max = s.total || 1; bar.value = s.av; }
  const meta = document.querySelector('#pilot-progress-meta'); if (meta) meta.textContent = `${s.pend} pendente(s) · ${s.n} não conforme(s) · ${s.na} N/A`;
  document.querySelectorAll('.pilot-cat').forEach(btn => {
    const cs = catStats(btn.dataset.pilotCat);
    const cont = btn.querySelector('.pilot-cat-counts'); if (cont) cont.textContent = `${cs.c} ok · ${cs.n} N · ${cs.na} N/A · ${cs.pend} pend.`;
    const pr = btn.querySelector('progress'); if (pr) { pr.max = cs.total || 1; pr.value = cs.av; }
    btn.classList.toggle('is-active', btn.dataset.pilotCat === itemAtual().cat);
  });
  const sel = document.querySelector('[data-pilot-cat-select]');
  if (sel) sel.querySelectorAll('option').forEach(o => { const cs = catStats(o.value); o.textContent = `${o.value} — ${cs.pend} pendência(s)`; o.selected = o.value === itemAtual().cat; });
  const it = itemAtual(); const inf = statusInfo(it.status);
  const badge = document.querySelector('#pilot-item-badge'); if (badge) { badge.className = 'pilot-item-badge ' + tone(it.status); badge.textContent = `${inf.icon} ${inf.label}`; }
  document.querySelectorAll('.pilot-status-option').forEach(l => l.classList.toggle('is-selected', l.querySelector('input')?.value === it.status));
  const state = document.querySelector('.pilot-item-state'); if (state) state.textContent = it.status === 'N' ? 'Item não conforme no checklist' : it.status === 'C' ? 'Item conforme' : it.status === 'NA' ? 'Item não aplicável' : 'Item não avaliado';
  const next = proximoPendente(); const nb = document.querySelector('[data-pilot-next]'); if (nb) { nb.disabled = next < 0; nb.textContent = next < 0 ? 'Nenhum pendente' : 'Próximo pendente'; }
}

function selecionarItem(i, foco = 'status') {
  if (!DEMO.itens[i]) return;
  fecharSheet(false); fecharLightbox(false);
  estado.item = i; estado.foto = 0;
  const y = scrollY; renderPiloto(); scrollTo(0, y);
  requestAnimationFrame(() => {
    const alvo = foco === 'status' ? document.querySelector('#pilot-item-title') : document.querySelector(foco);
    alvo?.focus({ preventScroll: true });
  });
}

function selecionarFoto(j) {
  estado.foto = j;
  const y = scrollY; renderPiloto(); scrollTo(0, y);
  requestAnimationFrame(() => document.querySelector(`[data-pilot-photo="${j}"]`)?.focus({ preventScroll: true }));
}

function conteudoSheet(tipo) {
  if (tipo === 'dados') return `<dl class="pilot-data-list"><div><dt>Imóvel</dt><dd>${esc(DEMO.imovel)}</dd></div><div><dt>Cliente</dt><dd>${esc(DEMO.cliente)}</dd></div><div><dt>Endereço</dt><dd>${esc(DEMO.endereco)}</dd></div><div><dt>Unidade</dt><dd>${esc(DEMO.unidade)}</dd></div><div><dt>Matrícula</dt><dd>${esc(DEMO.matricula)}</dd></div><div><dt>Área construída</dt><dd>${esc(DEMO.areaConstruida)} m²</dd></div><div><dt>Responsável</dt><dd>${esc(DEMO.responsavel)} · CREA ${esc(DEMO.crea)}</dd></div></dl><label for="pilot-art">Nº da ART</label><input id="pilot-art" data-pilot-art value="${esc(DEMO.artNumero)}" placeholder="Informe o número da ART"><p class="pilot-sheet-note">Dados fictícios. Edições neste piloto ficam apenas em memória e não são gravadas.</p>`;
  if (tipo === 'docs') return `<ul class="pilot-docs">${DEMO.docs.map(d => `<li><span class="pilot-doc-type">${esc(d.tipo)}</span><div><b>${esc(d.nome)}</b><small>${esc(d.tamanho)}</small></div></li>`).join('')}</ul><p class="pilot-sheet-note">Documentos de demonstração; nenhum upload é feito no piloto.</p>`;
  if (tipo === 'laudo') return `<div class="pilot-laudo-preview"><h3>Texto do laudo</h3><p>${esc(DEMO.laudoObjetivo)}</p><p>${esc(DEMO.laudoMetodologia)}</p><p>${esc(DEMO.laudoRecomendacoes)}</p><p>${esc(DEMO.laudoConclusao)}</p></div><label for="pilot-nome">Nome do responsável</label><input id="pilot-nome" data-pilot-nome value="${esc(DEMO.nome)}"><p class="pilot-sheet-note">A assinatura real não é feita neste piloto. Ela continua na tela atual, com as regras e proteções existentes.</p>`;
  if (tipo === 'revisao') {
    const pend = pendentes(); const ncs = naoConformes(); const ans = anomalias();
    const semNome = !DEMO.nome.trim();
    return `<div class="pilot-review-summary"><b>${stats(DEMO.itens).av} de ${stats(DEMO.itens).total} avaliados</b><span>${stats(DEMO.itens).pend} pendente(s) · ${ncs.length} não conforme(s) · ${ans.length} anomalia(s)</span></div>
      <section class="pilot-review-group"><h3>Impedimentos reais para assinar</h3><ul><li class="pilot-review-blocker">${semNome ? '<button type="button" data-pilot-review-laudo>Nome do responsável não informado.</button>' : 'Assinatura não registrada neste piloto.'} A assinatura real acontece na tela atual, com as regras existentes. <a href="#/vistorias">Abrir tela atual</a></li></ul></section>
      <section class="pilot-review-group"><h3>Precisa de confirmação</h3><ul>${pend.length ? pend.map(x => `<li class="pilot-review-warning"><button type="button" data-pilot-review-item="${x.i}">${esc(x.it.desc)} — sem avaliação</button><small>${esc(x.it.cat)}</small></li>`).join('') : '<li class="pilot-review-ok">Nenhum item sem avaliação.</li>'}<li class="pilot-review-warning"><button type="button" data-pilot-review-art>${DEMO.artNumero ? `ART ${esc(DEMO.artNumero)} informada` : 'Nº da ART não informado'}</button><small>Confirmável no ato da assinatura</small></li></ul></section>
      <section class="pilot-review-group"><h3>Informativo</h3><ul>${ncs.length ? ncs.map(x => `<li class="pilot-review-info"><button type="button" data-pilot-review-item="${x.i}">${esc(x.it.desc)} — não conforme</button><small>${esc(x.it.cat)}</small></li>`).join('') : '<li class="pilot-review-ok">Nenhum item não conforme.</li>'}${ans.length ? ans.map(x => `<li class="pilot-review-info"><button type="button" data-pilot-review-item="${x.i}">${esc(x.it.anomalia.titulo)} — anomalia vinculada</button><small>${esc(x.it.desc)}</small></li>`).join('') : '<li class="pilot-review-ok">Nenhuma anomalia registrada.</li>'}</ul></section>
      <p class="pilot-sheet-note">Esta revisão não cria exigências novas e não altera os dados da vistoria.</p>`;
  }
  return '';
}

function preencherSheet() {
  const sheet = document.querySelector('#pilot-sheet'); const body = document.querySelector('#pilot-sheet-body'); const title = document.querySelector('#pilot-sheet-title');
  if (!sheet || !body || !title || !sheetTipo) return;
  title.textContent = sheetTipo === 'dados' ? 'Dados gerais' : sheetTipo === 'docs' ? 'Documentos' : sheetTipo === 'laudo' ? 'Laudo' : 'Revisão final';
  body.innerHTML = conteudoSheet(sheetTipo);
}

function abrirSheet(tipo, trigger, focoSel = '') {
  if (!document.querySelector('#pilot-sheet')) return;
  sheetTipo = tipo; sheetTrigger = trigger || document.activeElement;
  preencherSheet();
  const sheet = document.querySelector('#pilot-sheet'); const backdrop = document.querySelector('#pilot-sheet-backdrop');
  sheet.hidden = false; backdrop.hidden = false; document.body.classList.add('pilot-layer-open');
  const alvo = focoSel ? sheet.querySelector(focoSel) : sheet.querySelector('[data-pilot-sheet-close]');
  requestAnimationFrame(() => alvo?.focus({ preventScroll: true }));
  sheet.onkeydown = e => {
    if (e.key === 'Escape') { e.preventDefault(); fecharSheet(); }
    if (e.key === 'Tab') prenderFoco(sheet, e);
  };
}

function fecharSheet(restaurar = true) {
  const sheet = document.querySelector('#pilot-sheet'); const backdrop = document.querySelector('#pilot-sheet-backdrop');
  if (sheet) sheet.hidden = true; if (backdrop) backdrop.hidden = true;
  document.body.classList.remove('pilot-layer-open');
  sheetTipo = '';
  if (restaurar && sheetTrigger && document.contains(sheetTrigger)) sheetTrigger.focus({ preventScroll: true });
  sheetTrigger = null;
}

function prenderFoco(container, e) {
  const els = [...container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(el => !el.disabled && el.getClientRects().length);
  if (!els.length) return; const first = els[0], last = els[els.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

function abrirLightbox(trigger) {
  const foto = fotoAtual(); if (!foto) return;
  const lb = document.querySelector('#pilot-lightbox'); const img = document.querySelector('#pilot-lightbox-img'); const ctx = document.querySelector('#pilot-lightbox-context'); const erro = document.querySelector('#pilot-lightbox-error');
  if (!lb || !img || !ctx) return;
  lightboxTrigger = trigger || document.activeElement;
  img.hidden = false; if (erro) erro.hidden = true; img.src = foto.src; img.alt = foto.legenda || itemAtual().desc;
  ctx.innerHTML = `<p class="pilot-kicker">${esc(itemAtual().cat)}</p><h2 id="pilot-lightbox-title">${esc(itemAtual().desc)}</h2><p><b>Legenda:</b> ${esc(foto.legenda || '—')}</p><p><b>Observação:</b> ${esc(itemAtual().obs || '—')}</p>${itemAtual().anomalia ? `<div class="pilot-anomaly-context"><span>Anomalia vinculada</span><b>${esc(itemAtual().anomalia.titulo)}</b><small>${esc(itemAtual().anomalia.gravidade)} · ${esc(itemAtual().anomalia.status)}</small></div>` : `<p class="pilot-no-anomaly">Nenhuma anomalia vinculada a este item.</p>`}`;
  lb.hidden = false; document.body.classList.add('pilot-layer-open');
  img.onerror = () => { img.hidden = true; if (erro) erro.hidden = false; };
  const close = lb.querySelector('[data-pilot-lightbox-close]');
  requestAnimationFrame(() => close?.focus({ preventScroll: true }));
  lb.onkeydown = e => { if (e.key === 'Escape') { e.preventDefault(); fecharLightbox(); } if (e.key === 'Tab') prenderFoco(lb, e); };
}

function fecharLightbox(restaurar = true) {
  const lb = document.querySelector('#pilot-lightbox'); if (!lb) return;
  lb.hidden = true; document.body.classList.remove('pilot-layer-open');
  if (restaurar && lightboxTrigger && document.contains(lightboxTrigger)) lightboxTrigger.focus({ preventScroll: true });
  lightboxTrigger = null;
}

function ligarAcoesPiloto() {
  if (acoesLigadas) return;
  acoesLigadas = true;
  app.addEventListener('click', async e => {
    if (e.target.id === 'pilot-sheet-backdrop') { fecharSheet(); return; }
    if (e.target.id === 'pilot-lightbox') { fecharLightbox(); return; }
    const alvo = e.target.closest('[data-pilot-cat], [data-pilot-photo], [data-pilot-next], [data-pilot-prev], [data-pilot-next-item], [data-pilot-zoom], [data-pilot-mark], [data-pilot-remove], [data-pilot-sheet], [data-pilot-sheet-close], [data-pilot-review-item], [data-pilot-review-art], [data-pilot-review-laudo], [data-pilot-lightbox-close]');
    if (!alvo) return;
    const d = alvo.dataset;
    if (d.pilotCat !== undefined) { const idx = DEMO.itens.findIndex(i => i.cat === d.pilotCat); if (idx >= 0) selecionarItem(idx); return; }
    if (d.pilotPhoto !== undefined) { selecionarFoto(Number(d.pilotPhoto)); return; }
    if (d.pilotPrev !== undefined) { selecionarItem((estado.item - 1 + DEMO.itens.length) % DEMO.itens.length); return; }
    if (d.pilotNextItem !== undefined) { selecionarItem((estado.item + 1) % DEMO.itens.length); return; }
    if (d.pilotNext !== undefined) { const i = proximoPendente(); if (i >= 0) selecionarItem(i); return; }
    if (d.pilotZoom !== undefined) { abrirLightbox(alvo); return; }
    if (d.pilotMark !== undefined) {
      const foto = fotoAtual(); if (!foto) return;
      abrirMarcador(foto.src, async dataUrl => { foto.src = dataUrl; const y = scrollY; renderPiloto(); scrollTo(0, y); });
      return;
    }
    if (d.pilotRemove !== undefined) {
      const it = itemAtual(); const foto = fotoAtual(); if (!foto) return;
      if (!confirm('Remover esta foto do piloto? A alteração fica apenas em memória.')) return;
      it.fotos.splice(estado.foto, 1); estado.foto = 0; const y = scrollY; renderPiloto(); scrollTo(0, y);
      return;
    }
    if (d.pilotSheet !== undefined) { abrirSheet(d.pilotSheet, alvo); return; }
    if (d.pilotSheetClose !== undefined) { fecharSheet(); return; }
    if (d.pilotLightboxClose !== undefined) { fecharLightbox(); return; }
    if (d.pilotReviewItem !== undefined) { const i = Number(d.pilotReviewItem); fecharSheet(false); selecionarItem(i, 'status'); return; }
    if (d.pilotReviewArt !== undefined) { fecharSheet(false); const trigger = document.querySelector('[data-pilot-sheet="dados"]'); abrirSheet('dados', trigger, '#pilot-art'); return; }
    if (d.pilotReviewLaudo !== undefined) { fecharSheet(false); const trigger = document.querySelector('[data-pilot-sheet="laudo"]'); abrirSheet('laudo', trigger, '#pilot-nome'); return; }
  });

  app.addEventListener('change', async e => {
    const t = e.target;
    if (t.matches('[data-pilot-status]')) {
      itemAtual().status = t.value;
      atualizarResumoPiloto();
      return;
    }
    if (t.matches('[data-pilot-cat-select]')) {
      const idx = DEMO.itens.findIndex(i => i.cat === t.value); if (idx >= 0) selecionarItem(idx);
      return;
    }
    if (t.matches('[data-pilot-add]')) {
      const arquivos = [...(t.files || [])]; if (!arquivos.length) return;
      const it = itemAtual(); let adicionadas = 0;
      for (const file of arquivos) {
        if (!file.type.startsWith('image/')) continue;
        try { it.fotos.push({ id: 'piloto-' + Date.now() + '-' + it.fotos.length, legenda: 'Nova evidência', src: await comprimir(file) }); adicionadas++; } catch (err) { alert('Não foi possível ler a imagem.'); }
      }
      estado.foto = adicionadas ? it.fotos.length - 1 : 0;
      const y = scrollY; renderPiloto(); scrollTo(0, y); t.value = '';
      requestAnimationFrame(() => document.querySelector(`[data-pilot-photo="${estado.foto}"]`)?.focus({ preventScroll: true }));
    }
  });

  app.addEventListener('input', e => {
    const t = e.target;
    if (t.matches('[data-pilot-obs]')) { itemAtual().obs = t.value; document.querySelectorAll('[data-pilot-obs-text]').forEach(el => { el.textContent = t.value || '—'; }); return; }
    if (t.matches('[data-pilot-legend]')) {
      const foto = fotoAtual(); if (!foto) return; foto.legenda = t.value;
      document.querySelectorAll(`[data-pilot-thumb-legend="${CSS.escape(foto.id)}"]`).forEach(el => { el.textContent = t.value || 'Sem legenda'; });
      return;
    }
    if (t.matches('[data-pilot-art]')) { DEMO.artNumero = t.value; return; }
    if (t.matches('[data-pilot-nome]')) { DEMO.nome = t.value; return; }
  });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const lb = document.querySelector('#pilot-lightbox'); if (lb && !lb.hidden) { e.preventDefault(); fecharLightbox(); return; }
    const sheet = document.querySelector('#pilot-sheet'); if (sheet && !sheet.hidden) { e.preventDefault(); fecharSheet(); }
  });
}

export function piloto() {
  ligarAcoesPiloto();
  renderPiloto();
}
