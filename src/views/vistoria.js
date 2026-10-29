// Detalhe da vistoria: dados, checklist, anomalias, documentos e laudo em abas.
import { auditar } from '../core/auditoria.js';
import { categoriasDaVistoria, rotulosChecklist } from '../core/checklist.js';
import { DOC_TIPOS, GRAV, PRAZOS } from '../core/config.js';
import { all, get, put } from '../core/db/index.js';
import { $, app, esc, fieldHtml, hf, sigPad } from '../core/dom.js';
import { fotosMap } from '../core/fotos.js';
import { setCurV, setPad } from '../core/state.js';
import { comprimir, dataBR, fmt, fmtBytes, lerArquivo, uid } from '../core/utils.js';

const ABAS = [
  { id: 'dados', label: 'Dados gerais', icon: '▤' },
  { id: 'checklist', label: 'Checklist', icon: '☑' },
  { id: 'anomalias', label: 'Anomalias', icon: '△' },
  { id: 'documentos', label: 'Documentos', icon: '▣' },
  { id: 'laudo', label: 'Laudo', icon: '✎' }
];
const statusLabel = (rot, k) => k ? (rot[k] || '—') : 'Não avaliado';
const statusIcon = k => k === 'C' ? '✓' : k === 'N' ? '✕' : k === 'NA' ? '—' : '○';
const statusTone = k => 'st-' + (k ? String(k).toLowerCase() : 'empty');

function emitirSalvamento(estado, detalhe = '') {
  document.dispatchEvent(new CustomEvent('vistori:save', { detail: { estado, detalhe } }));
}
function atualizarStatusSalvamento(estado, detalhe = '') {
  const el = document.querySelector('#save-status');
  if (!el) return;
  el.dataset.estado = estado;
  el.textContent = estado === 'pending' ? 'Alterações pendentes'
    : estado === 'saving' ? 'Salvando…'
      : estado === 'error' ? 'Falha ao salvar'
        : estado === 'locked' ? 'Somente leitura — assinada' : 'Salvo no app';
  el.title = estado === 'error' ? (detalhe || 'Não foi possível salvar as alterações.') : estado === 'saved' ? 'Salvo no armazenamento do app. O envio à nuvem é independente.' : '';
}
document.addEventListener('vistori:save', e => atualizarStatusSalvamento(e.detail?.estado || 'saved', e.detail?.detalhe || ''));
document.addEventListener('input', e => {
  if (document.querySelector('#save-status') && e.target.matches('[data-h], [data-f]')) atualizarStatusSalvamento('pending');
});
// A troca de aba acontece antes do handler global de data-anom-item.
app.addEventListener('click', e => {
  if (e.target.closest('[data-anom-item]')) document.querySelector('[data-aba="anomalias"]')?.click();
});

const calcularStats = arr => {
  const total = arr.length;
  const c = arr.filter(i => i.status === 'C').length;
  const n = arr.filter(i => i.status === 'N').length;
  const na = arr.filter(i => i.status === 'NA').length;
  const pend = arr.filter(i => !i.status).length;
  const avaliados = c + n + na;
  return { total, c, n, na, pend, avaliados, pct: total ? Math.round(avaliados / total * 100) : 0 };
};

export async function vistoria(id) {
  const v = await get('vistorias', id);
  if (!v) { app.innerHTML = '<div class="warn">Vistoria não encontrada.</div>'; return; }
  setCurV(v);
  const [obra, fm] = await Promise.all([get('obras', v.obraId), fotosMap(v)]);
  const cli = obra ? await get('clientes', obra.clienteId) : null;
  const anomalias = (await all('anomalias')).filter(a => a.vistoriaId === v.id).sort((a, b) => (a.criado || '').localeCompare(b.criado || ''));
  const docsV = (await all('documentos')).filter(d => d.vistoriaId === v.id);
  const locked = v.status === 'assinada';
  const rot = rotulosChecklist(v);
  const cats = categoriasDaVistoria(v);
  const descCat = Object.fromEntries(cats.map(c => [c.nome, c.descricao || '']));
  const stats = calcularStats(v.itens || []);
  const naoConformes = stats.n;
  const pendentes = stats.pend;

  let abaSalva = 'dados';
  try {
    const salva = sessionStorage.getItem(`vistori_aba_${v.id}`);
    if (ABAS.some(a => a.id === salva)) abaSalva = salva;
  } catch (e) {}

  const anomDoItem = {};
  for (const a of anomalias) if (a.itemIndex !== undefined && a.itemIndex !== null) (anomDoItem[a.itemIndex] ||= []).push(a);
  const grupos = [];
  const porCat = new Map();
  v.itens.forEach((it, i) => {
    let g = porCat.get(it.cat);
    if (!g) { g = { cat: it.cat, desc: descCat[it.cat] || '', itens: [] }; porCat.set(it.cat, g); grupos.push(g); }
    g.itens.push({ it, i });
  });
  const opcoesItem = cats.map(c => `<optgroup label="${esc(c.nome)}">${v.itens.map((it, i) => it.cat === c.nome ? `<option value="${i}">${esc(it.desc)}</option>` : '').join('')}</optgroup>`).join('');
  const statusOpcoes = ['', 'C', 'N', 'NA'].map(k => ({ k, label: statusLabel(rot, k), icon: statusIcon(k), tone: statusTone(k) }));
  const badgeStatus = s => s === 'assinada' ? 'signed' : 'draft';
  const labelStatusVistoria = s => s === 'assinada' ? 'Assinada' : 'Rascunho';

  const renderItem = (it, i, num) => {
    const atual = it.status || '';
    const label = statusLabel(rot, atual);
    const anoms = anomDoItem[i] || [];
    const disabled = locked ? 'disabled' : '';
    const fotos = (it.fotos || []).map((f, j) => `<figure class="foto photo-thumb"><img src="${f.src || fm[f.id] || ''}" alt="Foto ${num} do item"><figcaption><label class="sr-only" for="leg-${i}-${j}">Legenda da foto</label><input id="leg-${i}-${j}" data-i="${i}" data-j="${j}" data-f="legenda" placeholder="Legenda" value="${esc(f.legenda)}" ${disabled}><div class="photo-actions">${locked ? '' : `<a href="#" data-rm="${i}:${j}">Remover</a><a href="#" data-marcar="${i}:${j}">Marcar</a>`}</div></figcaption></figure>`).join('');
    return `<article class="item ${atual === 'N' ? 'reprovado' : ''}" id="item-${i}" data-item-status="${esc(atual)}" data-item-cat="${esc(it.cat)}">
      <div class="item-head"><h4><span class="item-num">${num}.</span> ${esc(it.desc)}</h4><span class="item-status ${statusTone(atual)}" data-item-status-label>${esc(label)}</span></div>
      <div class="status-options" role="radiogroup" aria-label="Avaliação de ${esc(it.desc)}">${statusOpcoes.map(o => `<label class="status-option ${o.tone}"><input type="radio" name="st-${i}" value="${o.k}" data-i="${i}" data-f="status" ${atual === o.k ? 'checked' : ''} ${disabled}><span><b aria-hidden="true">${o.icon}</b>${esc(o.label)}</span></label>`).join('')}</div>
      <select class="status-sync" data-i="${i}" data-f="status" tabindex="-1" aria-hidden="true" ${disabled}>${statusOpcoes.map(o => `<option value="${o.k}" ${atual === o.k ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>
      <label for="item-obs-${i}">Observações do item</label><textarea id="item-obs-${i}" data-i="${i}" data-f="obs" placeholder="Observações / descrição da anomalia" ${disabled}>${esc(it.obs)}</textarea>
      ${anoms.length ? `<div class="item-anoms">${anoms.map(a => `<span class="item-anom">${esc(a.titulo)} <small>${esc(a.gravidade || '')} · ${esc(a.status || '')}</small></span>`).join('')}</div>` : ''}
      <div class="fotos photo-grid">${fotos}</div>
      <label class="photo-add" for="photo-${i}">+ Foto</label><input id="photo-${i}" type="file" accept="image/*" multiple data-photo="${i}" ${disabled}>
      ${locked ? '' : `<div class="item-links"><a href="#" data-anom-item="${i}">+ Registrar anomalia ${atual === 'N' ? 'desta não conformidade' : 'deste item'}</a></div>`}
    </article>`;
  };

  const renderCategoria = g => {
    const s = calcularStats(g.itens.map(x => x.it));
    return `<details class="check-cat" data-cat="${esc(g.cat)}" open><summary><span class="cat-name">${esc(g.cat)}</span><span class="cat-progress"><span data-cat-progress>${s.avaliados}/${s.total}</span><progress data-cat-bar max="${s.total || 1}" value="${s.avaliados}" aria-label="Progresso de ${esc(g.cat)}"></progress></span></summary>${g.desc ? `<p class="cat-desc">${esc(g.desc)}</p>` : ''}<div class="check-items">${g.itens.map(({ it, i }, k) => renderItem(it, i, k + 1)).join('')}</div></details>`;
  };
  const checklistHtml = grupos.map(renderCategoria).join('');

  const abas = ABAS.map(a => {
    const contagem = a.id === 'checklist' ? pendentes : a.id === 'anomalias' ? anomalias.length : a.id === 'documentos' ? docsV.length : 0;
    const ativa = a.id === abaSalva;
    const badge = (a.id === 'checklist' || a.id === 'anomalias' || a.id === 'documentos') ? `<span class="tab-badge" ${contagem ? '' : 'hidden'}>${contagem}</span>` : '';
    return `<button type="button" role="tab" id="tab-btn-${a.id}" data-aba="${a.id}" aria-controls="tab-${a.id}" aria-selected="${ativa}" tabindex="${ativa ? 0 : -1}" class="${ativa ? 'is-active' : ''}"><span aria-hidden="true">${a.icon}</span>${a.label}${badge}</button>`;
  }).join('');
  const painel = (id, conteudo) => `<section id="tab-${id}" class="tab-panel" role="tabpanel" aria-labelledby="tab-btn-${id}" data-tabpanel="${id}" ${abaSalva === id ? '' : 'hidden'}>${conteudo}</section>`;

  app.innerHTML = `<section class="vistoria-header">
    <div class="vistoria-head">
      <div class="vistoria-title">
        <p class="eyebrow">Vistoria</p>
        <h2>Vistoria — ${esc(obra?.nome || 'Imóvel não vinculado')}</h2>
        <p class="vistoria-sub">${esc(cli?.nome || 'Cliente não informado')} · ${esc(v.tipo)} · ${esc(dataBR(v.data))}${v.hora ? ' ' + esc(v.hora) : ''}${v.numeroLaudo ? ' · ' + esc(v.numeroLaudo) : ''}</p>
        ${v.checklistModeloNome ? `<p class="modelo-tag"><b>Modelo de checklist:</b> ${esc(v.checklistModeloNome)} <small>· copiado para esta vistoria</small></p>` : ''}
      </div>
      <div class="vistoria-head-side">
        <span class="status-badge ${badgeStatus(v.status)}">${labelStatusVistoria(v.status)}</span>
        <span id="save-status" class="save-status" data-estado="${locked ? 'locked' : 'saved'}" role="status" aria-live="polite">${locked ? 'Somente leitura — assinada' : 'Sem alterações pendentes'}</span>
        <div class="vistoria-actions"><a class="btn btn-sm ghost" href="#/piloto">Piloto visual</a><a class="btn btn-sm ghost" href="#/laudo/${v.id}">Ver laudo</a><a class="btn btn-sm ghost" href="#/vistorias">Voltar</a></div>
      </div>
    </div>
    <div class="progress-block">
      <div class="progress-copy"><span>Progresso do checklist</span><b id="progress-label">${stats.avaliados} de ${stats.total} avaliados (${stats.pct}%)</b></div>
      <progress id="progress-bar" max="${stats.total || 1}" value="${stats.avaliados}" aria-label="Progresso do checklist"></progress>
      <p id="progress-meta">${stats.pend} sem avaliação · ${stats.n} não conforme(s) · ${stats.na} N/A</p>
    </div>
    ${locked ? `<div class="warn locked-warn">Assinada em ${fmt(v.assinatura?.ts)}${v.versao ? ' · Versão ' + esc(v.versao) : ''}. <a href="#" data-reopen="1">Reabrir com justificativa</a><br><small>Fotos, anomalias e documentos estão protegidos pela assinatura. O PDF do laudo assinado pode ser gerado e anexado na tela do laudo.</small></div>` : ''}
  </section>
  <nav class="vistoria-tabs" role="tablist" aria-label="Seções da vistoria">${abas}</nav>`;

  const dadosPainel = `<fieldset ${locked ? 'disabled' : ''} class="vistoria-fieldset">
    <div class="form-section"><h3>Dados gerais</h3><div class="grid">${hf(v, 'data', 'Data', 'date')}${hf(v, 'hora', 'Horário', 'time')}${hf(v, 'vistoriador', 'Responsável técnico')}${hf(v, 'crea', 'CREA / UF')}${hf(v, 'artNumero', 'Nº da ART')}${hf(v, 'valor', 'Valor do serviço (R$)', 'number')}<div><label>Orientações / contato no local</label><textarea data-h="orientacoes">${esc(v.orientacoes)}</textarea></div></div></div>
    ${v.checklistModeloId ? `<div class="form-section"><h3>Dados do imóvel</h3><div class="grid">
      ${hf(v, 'contratante', 'Contratante / representante')}
      ${hf(v, 'proprietario', 'Proprietário')}
      ${hf(v, 'empreendimento', 'Empreendimento')}
      ${hf(v, 'procuradora', 'Procuradora')}
      ${hf(v, 'unidade', 'Unidade')}
      ${hf(v, 'matricula', 'Matrícula')}
      ${hf(v, 'areaLote', 'Área do lote (m²)', 'number')}
      ${hf(v, 'areaConstruida', 'Área construída (m²)', 'number')}
      ${hf(v, 'incorporadora', 'Incorporadora / construtora')}
      ${hf(v, 'responsavelConstrutora', 'Responsável da construtora presente')}
      ${hf(v, 'tipoImovel', 'Tipo de imóvel')}
      <div><label>Observações gerais</label><textarea data-h="observacoesGerais" placeholder="Observações gerais da vistoria…">${esc(v.observacoesGerais)}</textarea></div>
    </div></div>` : ''}
  </fieldset>`;

  const checklistPainel = `<div class="check-toolbar">
      <div class="check-filters" role="group" aria-label="Filtrar itens do checklist">
        <button type="button" class="filter-chip is-active" data-check-filter="all" aria-pressed="true">Todos <span class="chip-count" data-filter-count="all">${stats.total}</span></button>
        <button type="button" class="filter-chip" data-check-filter="pending" aria-pressed="false">Pendentes <span class="chip-count" data-filter-count="pending">${stats.pend}</span></button>
        <button type="button" class="filter-chip" data-check-filter="n" aria-pressed="false">Não conformes <span class="chip-count" data-filter-count="n">${stats.n}</span></button>
      </div>
      <span id="check-visible" class="check-visible">${stats.total} item(ns)</span>
    </div>
    <div class="check-list">${checklistHtml || '<div class="empty-state"><p>Checklist vazio. Edite o modelo ou use o checklist genérico.</p></div>'}</div>
    <p id="check-empty" class="empty-state compact" hidden>Nenhum item corresponde a este filtro.</p>`;

  const anomaliasPainel = `<div class="section-heading"><div><h3>Anomalias</h3><p>Registros separados do checklist, com gravidade, prazo e responsável.</p></div></div>
    ${locked ? '' : `<form id="anom-form" class="grid form-section">
      ${fieldHtml({ k: 'titulo', l: 'Título', req: 1 }, '')}
      ${fieldHtml({ k: 'gravidade', l: 'Gravidade', req: 1, opts: GRAV.map(g => [g, g]) }, 'Média')}
      ${fieldHtml({ k: 'ambiente', l: 'Local / ambiente' }, '')}
      <div><label>Item vinculado (opcional)</label><select name="item"><option value="">— não vinculado —</option>${opcoesItem}</select></div>
      ${fieldHtml({ k: 'prazo', l: 'Prazo para correção', opts: PRAZOS.map(p => [p, p]) }, '30 dias')}
      ${fieldHtml({ k: 'responsavel', l: 'Responsável pela correção' }, '')}
      <div><label>Foto (opcional)</label><input type="file" id="anom-foto" accept="image/*"></div>
      <div style="grid-column:1/-1"><label>Descrição</label><textarea name="descricao" placeholder="Descreva a anomalia…"></textarea></div>
      <div class="row" style="grid-column:1/-1"><button class="btn" type="submit">Registrar anomalia</button></div>
    </form>`}
    <div class="anom-list">${anomalias.length ? anomalias.map(a => `<article class="anom"><div class="anom-head"><b>${esc(a.titulo)}</b><span class="grav grav-${esc((a.gravidade || '').toLowerCase())}">${esc(a.gravidade)}</span></div>${a.descricao ? `<p>${esc(a.descricao)}</p>` : ''}<div class="anom-meta"><span><b>Local:</b> ${esc(a.ambiente || '—')}</span>${a.itemDesc ? `<span><b>Item:</b> ${esc(a.itemDesc)} <small>(${esc(a.itemCat || '')})</small></span>` : ''}<span><b>Prazo:</b> ${esc(a.prazo || '—')}</span><span><b>Responsável:</b> ${esc(a.responsavel || '—')}</span></div>${a.foto ? `<img class="anom-foto" src="${a.foto}" alt="Foto da anomalia: ${esc(a.titulo)}">` : ''}<div class="row">${locked ? `<span class="status-badge draft">${esc(a.status || '—')}</span>` : `<select data-anom-status="${a.id}" aria-label="Status da anomalia ${esc(a.titulo)}">${['Aberta', 'Em correção', 'Corrigida'].map(s => `<option ${a.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select><a href="#" data-del="anomalias:${a.id}">Excluir</a>`}</div></article>`).join('') : '<div class="empty-state"><p>Nenhuma anomalia registrada.</p></div>'}</div>`;

  const documentosPainel = `<div class="section-heading"><div><h3>Documentos</h3><p>ART, plantas, contratos e demais anexos vinculados.</p></div></div>
    ${locked ? '' : `<form id="vdoc-form" class="grid form-section">
      ${fieldHtml({ k: 'tipo', l: 'Tipo', req: 1, opts: DOC_TIPOS.map(t => [t, t]) }, 'ART')}
      ${fieldHtml({ k: 'nome', l: 'Nome', req: 1 }, '')}
      <div><label>Arquivo</label><input type="file" id="vdoc-file"></div>
      <div class="row" style="grid-column:1/-1"><button class="btn" type="submit">Anexar</button></div>
    </form>`}
    ${docsV.length ? `<ul class="docs">${docsV.map(d => `<li><b>${esc(d.tipo)}</b> · ${esc(d.nome)} <small>${fmtBytes(d.tamanho)}</small> <a href="#" data-download="${d.id}">baixar</a>${locked ? '' : `<a href="#" data-del="documentos:${d.id}">excluir</a>`}</li>`).join('')}</ul>` : '<div class="empty-state"><p>Nenhum documento anexado.</p></div>'}`;

  const resumoLaudo = `<div class="sign-summary"><h3>Antes de assinar</h3><ul>
    <li id="sign-pend" class="${pendentes ? 'warn-item' : 'ok-item'}">${pendentes ? `${pendentes} item(ns) sem avaliação. A assinatura pedirá confirmação para continuar.` : 'Todos os itens do checklist foram avaliados.'}</li>
    <li id="sign-art" class="${v.artNumero ? 'ok-item' : 'warn-item'}">${v.artNumero ? `ART ${esc(v.artNumero)} informada.` : 'Nº da ART não informado. A assinatura pedirá confirmação para continuar.'}</li>
    <li id="sign-resumo">${naoConformes} não conformidade(s) e ${anomalias.length} anomalia(s) registradas. Pelas regras atuais, isso não bloqueia a assinatura.</li>
    <li>É necessário informar o nome do responsável e assinar no quadro.</li>
  </ul><button type="button" class="link-button" data-aba-jump="checklist" ${pendentes ? '' : 'hidden'}>Revisar itens pendentes</button></div>`;

  const laudoPainel = `<fieldset ${locked ? 'disabled' : ''} class="vistoria-fieldset"><div class="form-section"><h3>Texto do laudo</h3><div class="laudo-fields">
      <div><label>Objetivo</label><textarea data-h="laudoObjetivo" placeholder="Objetivo do laudo…">${esc(v.laudoObjetivo)}</textarea></div>
      <div><label>Metodologia</label><textarea data-h="laudoMetodologia" placeholder="Metodologia aplicada…">${esc(v.laudoMetodologia)}</textarea></div>
      <div><label>Recomendações</label><textarea data-h="laudoRecomendacoes" placeholder="Recomendações técnicas…">${esc(v.laudoRecomendacoes)}</textarea></div>
      <div><label>Conclusão</label><textarea data-h="laudoConclusao" placeholder="Conclusão…">${esc(v.laudoConclusao)}</textarea></div>
    </div></div></fieldset>
    ${locked ? `<div class="sign-locked"><b>Laudo assinado.</b> ${v.assinatura?.ts ? `Assinado em ${fmt(v.assinatura.ts)}.` : ''} O conteúdo está protegido; use a tela do laudo para PDF e verificação de integridade.</div>` : `${resumoLaudo}<div class="sign-card"><h3>Finalizar e assinar</h3><label>Nome do responsável</label><input id="signNome" value="${esc(v.vistoriador)}"><label>Assinatura</label><canvas id="sig" width="840" height="300"></canvas><div class="row"><button type="button" class="btn ghost" id="clr">Limpar</button><button type="button" class="btn" id="sign">Assinar e gerar laudo</button></div></div>`}`;

  app.innerHTML += painel('dados', dadosPainel) + painel('checklist', checklistPainel) + painel('anomalias', anomaliasPainel) + painel('documentos', documentosPainel) + painel('laudo', laudoPainel);

  const tabsBtns = [...document.querySelectorAll('.vistoria-tabs [role="tab"]')];
  const ativarAba = (id, focar = false) => {
    if (!tabsBtns.some(b => b.dataset.aba === id)) return;
    tabsBtns.forEach(b => {
      const ativa = b.dataset.aba === id;
      b.classList.toggle('is-active', ativa);
      b.setAttribute('aria-selected', String(ativa));
      b.tabIndex = ativa ? 0 : -1;
    });
    document.querySelectorAll('[data-tabpanel]').forEach(p => {
      const ativa = p.dataset.tabpanel === id;
      p.classList.toggle('is-active', ativa);
      p.hidden = !ativa;
    });
    try { sessionStorage.setItem(`vistori_aba_${v.id}`, id); } catch (e) {}
    if (focar) document.querySelector(`[data-aba="${id}"]`)?.focus();
  };
  tabsBtns.forEach((btn, idx) => {
    btn.addEventListener('click', () => ativarAba(btn.dataset.aba));
    btn.addEventListener('keydown', e => {
      let alvo = null;
      if (e.key === 'ArrowRight') alvo = tabsBtns[(idx + 1) % tabsBtns.length];
      else if (e.key === 'ArrowLeft') alvo = tabsBtns[(idx - 1 + tabsBtns.length) % tabsBtns.length];
      else if (e.key === 'Home') alvo = tabsBtns[0];
      else if (e.key === 'End') alvo = tabsBtns[tabsBtns.length - 1];
      if (alvo) { e.preventDefault(); ativarAba(alvo.dataset.aba, true); }
    });
  });
  document.querySelectorAll('[data-aba-jump]').forEach(btn => btn.addEventListener('click', () => ativarAba(btn.dataset.abaJump, true)));

  const checkPanel = $('#tab-checklist');
  let filtroCheck = 'all';
  const statsAtuais = () => calcularStats(v.itens || []);
  const atualizarProgresso = () => {
    const s = statsAtuais();
    const barra = $('#progress-bar');
    if (barra) { barra.max = s.total || 1; barra.value = s.avaliados; }
    const label = $('#progress-label'); if (label) label.textContent = `${s.avaliados} de ${s.total} avaliados (${s.pct}%)`;
    const meta = $('#progress-meta'); if (meta) meta.textContent = `${s.pend} sem avaliação · ${s.n} não conforme(s) · ${s.na} N/A`;
    checkPanel?.querySelectorAll('.check-cat').forEach(det => {
      const cs = calcularStats((v.itens || []).filter(i => i.cat === det.dataset.cat));
      const cont = det.querySelector('[data-cat-progress]'); if (cont) cont.textContent = `${cs.avaliados}/${cs.total}`;
      const catBar = det.querySelector('[data-cat-bar]'); if (catBar) { catBar.max = cs.total || 1; catBar.value = cs.avaliados; }
    });
    const contar = (chave, n) => { const el = document.querySelector(`[data-filter-count="${chave}"]`); if (el) el.textContent = n; };
    contar('all', s.total); contar('pending', s.pend); contar('n', s.n);
    const badge = document.querySelector('#tab-btn-checklist .tab-badge'); if (badge) { badge.textContent = s.pend; badge.hidden = !s.pend; }
    const sp = $('#sign-pend'); if (sp) {
      sp.className = s.pend ? 'warn-item' : 'ok-item';
      sp.textContent = s.pend ? `${s.pend} item(ns) sem avaliação. A assinatura pedirá confirmação para continuar.` : 'Todos os itens do checklist foram avaliados.';
    }
    const pular = document.querySelector('[data-aba-jump="checklist"]'); if (pular) pular.hidden = !s.pend;
    const sr = $('#sign-resumo'); if (sr) sr.textContent = `${s.n} não conformidade(s) e ${anomalias.length} anomalia(s) registradas. Pelas regras atuais, isso não bloqueia a assinatura.`;
  };

  const aplicarFiltro = () => {
    const items = [...(checkPanel?.querySelectorAll('.item') || [])];
    items.forEach(item => {
      const st = item.dataset.itemStatus || '';
      const mostrar = filtroCheck === 'all' || (filtroCheck === 'pending' && !st) || (filtroCheck === 'n' && st === 'N');
      item.hidden = !mostrar;
    });
    checkPanel?.querySelectorAll('.check-cat').forEach(det => {
      const visivel = [...det.querySelectorAll('.item')].some(i => !i.hidden);
      det.hidden = !visivel;
      if (filtroCheck !== 'all' && visivel) det.open = true;
    });
    const visiveis = items.filter(i => !i.hidden).length;
    const visible = $('#check-visible'); if (visible) visible.textContent = `${visiveis} de ${items.length} item(ns)`;
    const vazio = $('#check-empty'); if (vazio) vazio.hidden = visiveis > 0 || items.length === 0;
    document.querySelectorAll('[data-check-filter]').forEach(b => {
      const ativa = b.dataset.checkFilter === filtroCheck;
      b.classList.toggle('is-active', ativa);
      b.setAttribute('aria-pressed', String(ativa));
    });
  };

  const atualizarItem = (alvo, valor) => {
    const i = Number(alvo.dataset.i);
    v.itens[i].status = valor;
    const item = document.querySelector('#item-' + i);
    if (!item) return;
    item.dataset.itemStatus = valor;
    item.classList.toggle('reprovado', valor === 'N');
    const label = item.querySelector('[data-item-status-label]');
    if (label) { label.className = 'item-status ' + statusTone(valor); label.textContent = statusLabel(rot, valor); }
    const linkAnom = item.querySelector('.item-links a[data-anom-item]');
    if (linkAnom) linkAnom.textContent = `+ Registrar anomalia ${valor === 'N' ? 'desta não conformidade' : 'deste item'}`;
    const sync = item.querySelector('select.status-sync'); if (sync && sync.value !== valor) sync.value = valor;
    if (alvo.matches('select.status-sync')) { const radio = item.querySelector(`input[type="radio"][value="${valor}"]`); if (radio) radio.checked = true; }
    atualizarProgresso();
    aplicarFiltro();
  };
  checkPanel?.addEventListener('change', e => {
    if (e.target.matches('[data-i][data-f="status"]')) atualizarItem(e.target, e.target.value);
  });
  document.querySelectorAll('[data-check-filter]').forEach(btn => btn.addEventListener('click', () => { filtroCheck = btn.dataset.checkFilter; aplicarFiltro(); }));
  atualizarProgresso();
  aplicarFiltro();

  const artInput = document.querySelector('[data-h="artNumero"]');
  artInput?.addEventListener('change', () => {
    const li = $('#sign-art'); if (!li) return;
    const valor = artInput.value.trim();
    li.className = valor ? 'ok-item' : 'warn-item';
    li.textContent = valor ? `ART ${valor} informada.` : 'Nº da ART não informado. A assinatura pedirá confirmação para continuar.';
  });

  const canvas = $('#sig');
  if (canvas) setPad(sigPad(canvas));

  const af = $('#anom-form');
  if (af) af.onsubmit = async e => {
    e.preventDefault();
    emitirSalvamento('saving');
    try {
      const d = Object.fromEntries(new FormData(af));
      let foto = '';
      const file = $('#anom-foto')?.files[0];
      if (file) foto = await comprimir(file);
      const idx = d.item === '' || d.item === undefined ? null : Number(d.item);
      const item = idx !== null ? v.itens[idx] : null;
      const anomId = uid();
      await put('anomalias', {
        id: anomId, vistoriaId: v.id, titulo: d.titulo, gravidade: d.gravidade || 'Média', ambiente: d.ambiente || '', descricao: d.descricao || '', prazo: d.prazo || '', responsavel: d.responsavel || '', status: 'Aberta', foto, criado: new Date().toISOString(),
        ...(item ? { itemIndex: idx, itemCat: item.cat, itemDesc: item.desc } : {})
      });
      await auditar('Registrou anomalia', 'anomalias', anomId, d.titulo);
      emitirSalvamento('saved');
      vistoria(v.id);
    } catch (err) {
      emitirSalvamento('error', err.message || String(err));
      alert('Não foi possível registrar a anomalia: ' + (err.message || err));
    }
  };

  const vf = $('#vdoc-form');
  if (vf) vf.onsubmit = async e => {
    e.preventDefault();
    const file = $('#vdoc-file')?.files[0];
    if (!file) return alert('Selecione um arquivo.');
    const d = Object.fromEntries(new FormData(vf));
    emitirSalvamento('saving');
    try {
      const src = file.type.startsWith('image/') ? await comprimir(file) : await lerArquivo(file);
      if (src.length > 750000) { emitirSalvamento('error', 'Arquivo acima do limite.'); return alert('Arquivo muito grande para o armazenamento atual (limite ~700 KB).'); }
      const docId = uid();
      await put('documentos', { id: docId, nome: d.nome || file.name, tipo: d.tipo || 'Outro', mime: file.type, tamanho: file.size, src, descricao: '', obraId: obra?.id || '', vistoriaId: v.id, criado: new Date().toISOString() });
      await auditar('Anexou documento', 'documentos', docId, d.nome || file.name);
      emitirSalvamento('saved');
      vistoria(v.id);
    } catch (err) {
      emitirSalvamento('error', err.message || String(err));
      alert('Não foi possível anexar o documento: ' + (err.message || err));
    }
  };
}
