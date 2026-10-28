// Detalhe da vistoria: checklist, fotos, anomalias, documentos e assinatura.
import { auditar } from '../core/auditoria.js';
import { categoriasDaVistoria, rotulosChecklist } from '../core/checklist.js';
import { DOC_TIPOS, GRAV, PRAZOS } from '../core/config.js';
import { all, get, put } from '../core/db/index.js';
import { $, app, esc, fieldHtml, hf, sigPad } from '../core/dom.js';
import { fotosMap } from '../core/fotos.js';
import { setCurV, setPad } from '../core/state.js';
import { comprimir, fmt, fmtBytes, lerArquivo, uid } from '../core/utils.js';

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
  const anomDoItem = {};
  for (const a of anomalias) if (a.itemIndex !== undefined && a.itemIndex !== null) (anomDoItem[a.itemIndex] ||= []).push(a);
  const seq = {};
  let last = '';
  const itens = v.itens.map((it, i) => {
    const num = seq[it.cat] = (seq[it.cat] || 0) + 1;
    const novaCat = it.cat !== last;
    const hd = novaCat ? `<h3>${esc(it.cat)}</h3>${descCat[it.cat] ? `<p class="cat-desc">${esc(descCat[it.cat])}</p>` : ''}` : '';
    last = it.cat;
    const cls = it.status === 'N' ? ' reprovado' : '';
    const anoms = anomDoItem[i] || [];
    return `${hd}<div class="item${cls}" id="item-${i}"><h4><span class="item-num">${num}.</span> ${esc(it.desc)}</h4>
    <select data-i="${i}" data-f="status">${Object.entries(rot).map(([k, l]) => `<option value="${k}" ${it.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <textarea data-i="${i}" data-f="obs" placeholder="Observações / descrição da anomalia">${esc(it.obs)}</textarea>
    ${anoms.length ? `<div class="item-anoms">${anoms.map(a => `<span class="item-anom">${esc(a.titulo)} <small>${esc(a.gravidade || '')} · ${esc(a.status || '')}</small></span>`).join('')}</div>` : ''}
    <div class="fotos">${it.fotos.map((f, j) => `<div class="foto"><img src="${f.src || fm[f.id] || ''}" alt=""><input data-i="${i}" data-j="${j}" data-f="legenda" placeholder="Legenda" value="${esc(f.legenda)}"><a href="#" data-rm="${i}:${j}">remover</a>${locked ? '' : `<a href="#" data-marcar="${i}:${j}">marcar</a>`}</div>`).join('')}</div>
    <label>+ Foto</label><input type="file" accept="image/*" multiple data-photo="${i}">
    ${locked ? '' : `<div class="item-links"><a href="#" data-anom-item="${i}">+ Registrar anomalia deste item</a></div>`}</div>`;
  }).join('');
  const opcoesItem = cats.map(c => `<optgroup label="${esc(c.nome)}">${v.itens.map((it, i) => it.cat === c.nome ? `<option value="${i}">${esc(it.desc)}</option>` : '').join('')}</optgroup>`).join('');
  app.innerHTML = `<h2>Vistoria — ${esc(obra?.nome)}</h2>
  <p>${esc(cli?.nome)} · ${esc(v.tipo)}${v.hora ? ' · ' + esc(v.hora) : ''}${v.numeroLaudo ? ' · ' + esc(v.numeroLaudo) : ''} · <a href="#/laudo/${v.id}">Ver laudo</a></p>
  ${v.checklistModeloNome ? `<p class="modelo-tag"><b>Modelo de checklist:</b> ${esc(v.checklistModeloNome)} <small>· copiado para esta vistoria</small></p>` : ''}
  ${locked ? `<div class="warn">Assinada em ${fmt(v.assinatura.ts)}${v.versao ? ' · Versão ' + esc(v.versao) : ''}. <a href="#" data-reopen="1">Reabrir com justificativa</a></div>` : ''}
  <fieldset ${locked ? 'disabled' : ''} style="border:0;padding:0;margin:0">
    <div class="card grid">${hf(v, 'data', 'Data', 'date')}${hf(v, 'hora', 'Horário', 'time')}${hf(v, 'vistoriador', 'Responsável técnico')}${hf(v, 'crea', 'CREA / UF')}${hf(v, 'artNumero', 'Nº da ART (emitida no CREA)')}${hf(v, 'valor', 'Valor do serviço (R$)', 'number')}<div><label>Orientações / contato no local</label><textarea data-h="orientacoes">${esc(v.orientacoes)}</textarea></div></div>
    ${v.checklistModeloId ? `<div class="card"><h3>Dados da vistoria de recebimento</h3><div class="grid">
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
    <div class="card"><h3>Texto do laudo</h3><div class="grid">
      <div><label>Objetivo</label><textarea data-h="laudoObjetivo" placeholder="Objetivo do laudo…">${esc(v.laudoObjetivo)}</textarea></div>
      <div><label>Metodologia</label><textarea data-h="laudoMetodologia" placeholder="Metodologia aplicada…">${esc(v.laudoMetodologia)}</textarea></div>
      <div><label>Recomendações</label><textarea data-h="laudoRecomendacoes" placeholder="Recomendações técnicas…">${esc(v.laudoRecomendacoes)}</textarea></div>
      <div><label>Conclusão</label><textarea data-h="laudoConclusao" placeholder="Conclusão…">${esc(v.laudoConclusao)}</textarea></div>
    </div></div>
    <div class="card">${itens || 'Checklist vazio. Edite em Checklist.'}</div>
    ${locked ? '' : `<div class="card"><h3>Finalizar e assinar</h3>
      <label>Nome do responsável</label><input id="signNome" value="${esc(v.vistoriador)}">
      <label>Assinatura</label><canvas id="sig" width="840" height="300"></canvas>
      <div class="row"><button type="button" class="btn ghost" id="clr">Limpar</button><button type="button" class="btn" id="sign">Assinar e gerar laudo</button></div></div>`}
  </fieldset>
  <div class="card"><div class="section-heading"><div><h3>Anomalias</h3><p>Gravidade, prazo e responsável pela correção.</p></div></div>
    ${locked ? '' : `<form id="anom-form" class="grid">
      ${fieldHtml({ k: 'titulo', l: 'Título', req: 1 }, '')}
      ${fieldHtml({ k: 'gravidade', l: 'Gravidade', req: 1, opts: GRAV.map(g => [g, g]) }, 'Média')}
      ${fieldHtml({ k: 'ambiente', l: 'Local / ambiente' }, '')}
      <div><label>Item vinculado (opcional)</label><select name="item"><option value="">— não vinculado —</option>${opcoesItem}</select></div>
      ${fieldHtml({ k: 'prazo', l: 'Prazo para correção', opts: PRAZOS.map(p => [p, p]) }, '30 dias')}
      ${fieldHtml({ k: 'responsavel', l: 'Responsável pela correção' }, '')}
      <div><label>Foto (opcional)</label><input type="file" id="anom-foto" accept="image/*"></div>
      <div style="grid-column:1/-1"><label>Descrição</label><textarea name="descricao" placeholder="Descreva a anomalia…"></textarea></div>
      <div class="row" style="grid-column:1/-1"><button class="btn">Registrar anomalia</button></div>
    </form>`}
    <div class="anom-list">
      ${anomalias.length ? anomalias.map(a => `<div class="anom"><div class="anom-head"><b>${esc(a.titulo)}</b><span class="grav grav-${esc((a.gravidade || '').toLowerCase())}">${esc(a.gravidade)}</span></div>${a.descricao ? `<p>${esc(a.descricao)}</p>` : ''}<div class="anom-meta"><span><b>Local:</b> ${esc(a.ambiente || '—')}</span>${a.itemDesc ? `<span><b>Item:</b> ${esc(a.itemDesc)} <small>(${esc(a.itemCat || '')})</small></span>` : ''}<span><b>Prazo:</b> ${esc(a.prazo || '—')}</span><span><b>Responsável:</b> ${esc(a.responsavel || '—')}</span></div>${a.foto ? `<img class="anom-foto" src="${a.foto}" alt="">` : ''}<div class="row"><select data-anom-status="${a.id}">${['Aberta', 'Em correção', 'Corrigida'].map(s => `<option ${a.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select><a href="#" data-del="anomalias:${a.id}">Excluir</a></div></div>`).join('') : '<p>Nenhuma anomalia registrada.</p>'}
    </div>
  </div>
  <div class="card"><div class="section-heading"><div><h3>Documentos</h3><p>ART, plantas e contratos vinculados.</p></div></div>
    ${locked ? '' : `<form id="vdoc-form" class="grid">
      ${fieldHtml({ k: 'tipo', l: 'Tipo', req: 1, opts: DOC_TIPOS.map(t => [t, t]) }, 'ART')}
      ${fieldHtml({ k: 'nome', l: 'Nome', req: 1 }, '')}
      <div><label>Arquivo</label><input type="file" id="vdoc-file"></div>
      <div class="row" style="grid-column:1/-1"><button class="btn">Anexar</button></div>
    </form>`}
    ${docsV.length ? `<ul class="docs">${docsV.map(d => `<li><b>${esc(d.tipo)}</b> · ${esc(d.nome)} <small>${fmtBytes(d.tamanho)}</small> <a href="#" data-download="${d.id}">baixar</a>${locked ? '' : `<a href="#" data-del="documentos:${d.id}">excluir</a>`}</li>`).join('')}</ul>` : '<p>Nenhum documento anexado.</p>'}
  </div>`;
  const c = $('#sig'); if (c) setPad(sigPad(c));
  const af = $('#anom-form');
  if (af) af.onsubmit = async e => {
    e.preventDefault();
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
    vistoria(v.id);
  };
  const vf = $('#vdoc-form');
  if (vf) vf.onsubmit = async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(vf));
    const file = $('#vdoc-file')?.files[0];
    if (!file) return alert('Selecione um arquivo.');
    const src = file.type.startsWith('image/') ? await comprimir(file) : await lerArquivo(file);
    if (src.length > 750000) return alert('Arquivo muito grande para o armazenamento atual (limite ~700 KB).');
    const docId = uid();
    await put('documentos', { id: docId, nome: d.nome || file.name, tipo: d.tipo || 'Outro', mime: file.type, tamanho: file.size, src, descricao: '', obraId: obra?.id || '', vistoriaId: v.id, criado: new Date().toISOString() });
    await auditar('Anexou documento', 'documentos', docId, d.nome || file.name);
    vistoria(v.id);
  };
}
