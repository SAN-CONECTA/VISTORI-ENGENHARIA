// GED de documentos.
import { auditar } from '../core/auditoria.js';
import { DOC_TIPOS } from '../core/config.js';
import { all, get, put } from '../core/db/index.js';
import { $, app, esc, fieldHtml } from '../core/dom.js';
import { refresh } from '../core/navigate.js';
import { comprimir, fmtBytes, lerArquivo, uid } from '../core/utils.js';

export async function documentos() {
  const [docs, obras, cls, vs] = await Promise.all([all('documentos'), all('obras'), all('clientes'), all('vistorias')]);
  const om = Object.fromEntries(obras.map(o => [o.id, o]));
  const cm = Object.fromEntries(cls.map(c => [c.id, c.nome]));
  const vm = Object.fromEntries(vs.map(v => [v.id, v]));
  const vinculo = d => d.vistoriaId ? `Vistoria ${vm[d.vistoriaId]?.numeroLaudo || ''}`.trim() : d.obraId ? `${om[d.obraId]?.nome || 'Obra'}${om[d.obraId]?.clienteId ? ' — ' + (cm[om[d.obraId].clienteId] || '') : ''}` : '—';
  const opVinc = [...obras.map(o => [`obra:${o.id}`, `${o.nome} — ${cm[o.clienteId] || ''}`]), ...vs.map(v => [`vistoria:${v.id}`, `Vistoria ${v.numeroLaudo || v.tipo || ''} — ${om[v.obraId]?.nome || ''}`])];
  app.innerHTML = `<section class="section-heading client-head"><div><h2>Documentos</h2><p>ARTs, plantas, contratos e arquivos vinculados.</p></div></section>
  <form id="doc-form" class="card grid">
    ${fieldHtml({ k: 'tipo', l: 'Tipo', req: 1, opts: DOC_TIPOS.map(t => [t, t]) }, 'Outro')}
    ${fieldHtml({ k: 'nome', l: 'Nome do documento', req: 1 }, '')}
    ${fieldHtml({ k: 'vinculo', l: 'Vincular a', opts: opVinc }, '')}
    ${fieldHtml({ k: 'descricao', l: 'Descrição' }, '')}
    <div><label>Arquivo</label><input type="file" id="doc-file"></div>
    <p style="grid-column:1/-1;color:var(--subtle);font-size:.78rem">Limite atual: ~700 KB por arquivo (armazenamento no Firestore). Imagens são comprimidas automaticamente.</p>
    <div class="row" style="grid-column:1/-1"><button class="btn">Enviar documento</button></div>
  </form>
  <div class="card">
    <div class="list-filters"><input id="d-busca" placeholder="Buscar nome ou descrição…"><select id="d-tipo"><option value="">Todos os tipos</option>${DOC_TIPOS.map(t => `<option>${t}</option>`).join('')}</select></div>
    <table><thead><tr><th>Nome</th><th>Tipo</th><th>Vínculo</th><th>Tamanho</th><th>Data</th><th></th></tr></thead><tbody id="d-tbody">
    ${docs.sort((a, b) => (b.criado || '').localeCompare(a.criado || '')).map(d => `<tr data-tipo="${esc(d.tipo)}"><td>${esc(d.nome)}</td><td>${esc(d.tipo)}</td><td>${esc(vinculo(d))}</td><td>${fmtBytes(d.tamanho)}</td><td>${d.criado ? new Date(d.criado).toLocaleDateString('pt-BR') : '—'}</td><td class="act"><a href="#" data-download="${d.id}">Baixar</a><a href="#" data-del="documentos:${d.id}">Excluir</a></td></tr>`).join('') || '<tr><td colspan="6">Nenhum documento cadastrado.</td></tr>'}
    </tbody></table>
  </div>`;
  const f = $('#doc-form');
  if (f) f.onsubmit = async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    const file = $('#doc-file')?.files[0];
    if (!file) return alert('Selecione um arquivo.');
    const [tipoV, idV] = (d.vinculo || '').split(':');
    if (tipoV === 'vistoria' && idV) {
      const v = await get('vistorias', idV);
      if (v?.status === 'assinada') return alert('Laudo assinado: reabra a vistoria para anexar documentos.');
    }
    const src = file.type.startsWith('image/') ? await comprimir(file) : await lerArquivo(file);
    if (src.length > 750000) return alert('Arquivo muito grande para o armazenamento atual (limite ~700 KB).');
    const docId = uid();
    await put('documentos', { id: docId, nome: d.nome || file.name, tipo: d.tipo || 'Outro', mime: file.type, tamanho: file.size, src, descricao: d.descricao || '', obraId: tipoV === 'obra' ? idV : '', vistoriaId: tipoV === 'vistoria' ? idV : '', criado: new Date().toISOString() });
    await auditar('Anexou documento', 'documentos', docId, d.nome || file.name);
    refresh();
  };
  const filtrar = () => {
    const t = ($('#d-busca')?.value || '').toLowerCase().trim();
    const tp = $('#d-tipo')?.value || '';
    document.querySelectorAll('#d-tbody tr[data-tipo]').forEach(r => { r.hidden = !!((t && !r.textContent.toLowerCase().includes(t)) || (tp && r.dataset.tipo !== tp)); });
  };
  const b = $('#d-busca'); if (b) b.oninput = filtrar;
  const st = $('#d-tipo'); if (st) st.onchange = filtrar;
}
