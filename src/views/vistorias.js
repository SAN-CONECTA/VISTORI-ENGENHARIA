// Lista de vistorias.
import { dadosIniciaisRecebimento, getCheck, getModelo, getModelos, snapshotModelo } from '../core/checklist.js';
import { all, get, put } from '../core/db/index.js';
import { $, app, esc, fieldHtml } from '../core/dom.js';
import { getTipos } from '../core/tipos.js';
import { brl, uid } from '../core/utils.js';

export async function vistorias() {
  const [vs, os, cls, ts, modelos] = await Promise.all([all('vistorias'), all('obras'), all('clientes'), getTipos(), getModelos()]);
  const om = Object.fromEntries(os.map(o => [o.id, o]));
  const cm = Object.fromEntries(cls.map(c => [c.id, c.nome]));
  const modelosAtivos = modelos.filter(m => m.ativo);
  const tipos = [...new Set(vs.map(v => v.tipo).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  app.innerHTML = `<h2>Vistorias</h2>
  ${os.length ? `<form id="nv" class="card grid">
    ${fieldHtml({ k: 'obraId', l: 'Imóvel/Obra', req: 1, opts: os.map(o => [o.id, `${o.nome} — ${cm[o.clienteId] || ''}`]) })}
    ${fieldHtml({ k: 'tipo', l: 'Tipo de serviço', req: 1, opts: ts.map(t => [t.nome, t.nome]) })}
    <div><label>Modelo de checklist</label><select name="modeloId"><option value="">Checklist genérico (padrão)</option>${modelosAtivos.map(m => `<option value="${esc(m.id)}">${esc(m.nome)}</option>`).join('')}</select></div>
    <div><button class="btn">Nova vistoria</button></div></form>` : '<div class="warn">Cadastre um imóvel/obra primeiro em <a href="#/cadastros">Cadastros</a>.</div>'}
  <div class="card">
    <div class="list-filters">
      <input id="v-busca" placeholder="Buscar imóvel, cliente, serviço ou responsável…">
      <select id="v-status"><option value="">Todos os status</option><option value="rascunho">Rascunho</option><option value="assinada">Assinada</option></select>
      <select id="v-tipo"><option value="">Todos os tipos</option>${tipos.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('')}</select>
      <select id="v-periodo"><option value="">Todo o período</option><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option><option value="mes">Este mês</option></select>
    </div>
    <p id="v-count" style="color:var(--subtle);font-size:.82rem;margin:0 0 10px"></p>
    <table><thead><tr><th>Data</th><th>Imóvel/Cliente</th><th>Tipo</th><th>Responsável</th><th>Valor</th><th>Status</th><th></th></tr></thead><tbody id="v-tbody">
    ${vs.sort((a, b) => (b.criado || '').localeCompare(a.criado || '')).map(v => `<tr data-status="${esc(v.status)}" data-tipo="${esc(v.tipo)}" data-data="${esc(v.data)}"><td>${esc(v.data)}${v.hora ? ' ' + esc(v.hora) : ''}</td><td>${esc(om[v.obraId]?.nome || '?')}<br><small>${esc(cm[om[v.obraId]?.clienteId] || '')}</small></td><td>${esc(v.tipo)}${v.checklistModeloNome ? `<br><small>${esc(v.checklistModeloNome)}</small>` : ''}</td><td>${esc(v.vistoriador || '—')}</td><td>${brl(v.valor)}</td><td><span class="status-badge ${v.status === 'assinada' ? 'signed' : 'draft'}">${v.status === 'assinada' ? 'Assinada' : 'Rascunho'}</span></td>
    <td class="act"><a href="#/vistoria/${v.id}">Abrir</a><a href="#/laudo/${v.id}">Laudo</a><a href="#" data-del="vistorias:${v.id}">Excluir</a></td></tr>`).join('') || '<tr><td colspan="7">Nenhuma vistoria.</td></tr>'}
    <tr id="v-vazio" hidden><td colspan="7">Nenhum registro corresponde aos filtros.</td></tr>
    </tbody></table>
  </div>`;

  const filtrar = () => {
    const texto = ($('#v-busca')?.value || '').toLowerCase().trim();
    const st = $('#v-status')?.value || '';
    const tp = $('#v-tipo')?.value || '';
    const per = $('#v-periodo')?.value || '';
    const agora = new Date(); agora.setHours(0, 0, 0, 0);
    const rows = [...document.querySelectorAll('#v-tbody tr[data-status]')];
    rows.forEach(row => {
      let ok = true;
      if (texto && !row.textContent.toLowerCase().includes(texto)) ok = false;
      if (st && row.dataset.status !== st) ok = false;
      if (tp && row.dataset.tipo !== tp) ok = false;
      if (per) {
        const d = row.dataset.data ? new Date(row.dataset.data + 'T12:00:00') : null;
        if (!d) ok = false;
        else if (per === 'mes') { if (d.getMonth() !== agora.getMonth() || d.getFullYear() !== agora.getFullYear()) ok = false; }
        else { const lim = new Date(agora); lim.setDate(lim.getDate() - Number(per)); if (d < lim) ok = false; }
      }
      row.hidden = !ok;
    });
    const visiveis = rows.filter(r => !r.hidden).length;
    const vazio = $('#v-vazio'); if (vazio) vazio.hidden = !(rows.length > 0 && visiveis === 0);
    const cnt = $('#v-count'); if (cnt) cnt.textContent = rows.length ? `Exibindo ${visiveis} de ${rows.length} vistoria(s)` : '';
  };
  $('#v-busca').oninput = filtrar;
  ['v-status', 'v-tipo', 'v-periodo'].forEach(id => { const el = $('#' + id); if (el) el.onchange = filtrar; });
  filtrar();
  const f = $('#nv');
  if (f) f.onsubmit = async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    const obra = om[d.obraId];
    const cli = obra ? cls.find(c => c.id === obra.clienteId) : null;
    const modelo = d.modeloId ? await getModelo(d.modeloId) : null;
    const usar = modelo && modelo.ativo ? modelo : null;
    let itens = [], categorias = [], dados = {};
    if (usar) {
      const snap = snapshotModelo(usar);
      itens = snap.itens; categorias = snap.categorias;
      dados = dadosIniciaisRecebimento(obra, cli);
    } else {
      const chk = await getCheck();
      for (const [cat, arr] of Object.entries(chk)) for (const desc of arr) itens.push({ cat, desc, status: '', obs: '', fotos: [] });
    }
    const tp = ts.find(t => t.nome === d.tipo);
    const pr = tp && obra ? await get('precos', `${tp.id}|${obra.tipo}`) : null;
    const v = {
      ...dados, id: uid(), obraId: d.obraId, tipo: d.tipo, data: new Date().toISOString().slice(0, 10), hora: '', vistoriador: '', crea: '', artNumero: '', valor: pr ? pr.valor : '', orientacoes: '', itens, status: 'rascunho', criado: new Date().toISOString(),
      ...(usar ? { checklistModeloId: usar.id, checklistModeloNome: usar.nome, checklistModeloCategorias: categorias } : {})
    };
    await put('vistorias', v);
    location.hash = `#/vistoria/${v.id}`;
  };
}
