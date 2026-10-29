// Lista de vistorias.
import { dadosIniciaisRecebimento, getCheck, getModelo, getModelos, snapshotModelo } from '../core/checklist.js';
import { all, get, put } from '../core/db/index.js';
import { $, app, esc, fieldHtml } from '../core/dom.js';
import { getTipos } from '../core/tipos.js';
import { brl, dataBR, uid } from '../core/utils.js';

export async function vistorias() {
  const [vs, os, cls, ts, modelos] = await Promise.all([all('vistorias'), all('obras'), all('clientes'), getTipos(), getModelos()]);
  const om = Object.fromEntries(os.map(o => [o.id, o]));
  const cm = Object.fromEntries(cls.map(c => [c.id, c.nome]));
  const modelosAtivos = modelos.filter(m => m.ativo);
  const tipos = [...new Set(vs.map(v => v.tipo).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const temObras = os.length > 0;
  const linhas = [...vs].sort((a, b) => String(b.criado || '').localeCompare(String(a.criado || ''))).map(v => {
    const imovel = om[v.obraId]?.nome || 'Imóvel não vinculado';
    const cliente = cm[om[v.obraId]?.clienteId] || '';
    return `<tr data-status="${esc(v.status)}" data-tipo="${esc(v.tipo)}" data-data="${esc(v.data)}"><td data-label="Data">${esc(dataBR(v.data))}${v.hora ? ' ' + esc(v.hora) : ''}</td><td data-label="Imóvel/Cliente">${esc(imovel)}<br><small>${esc(cliente)}</small></td><td data-label="Tipo">${esc(v.tipo)}${v.checklistModeloNome ? `<br><small>${esc(v.checklistModeloNome)}</small>` : ''}</td><td data-label="Responsável">${esc(v.vistoriador || '—')}</td><td data-label="Valor">${brl(v.valor)}</td><td data-label="Status"><span class="status-badge ${v.status === 'assinada' ? 'signed' : 'draft'}">${v.status === 'assinada' ? 'Assinada' : 'Rascunho'}</span></td>
    <td class="act"><a class="btn btn-sm open" href="#/vistoria/${v.id}">Abrir</a><details class="row-actions"><summary class="btn btn-sm ghost" aria-label="Ações da vistoria ${esc(imovel)}">Ações <span aria-hidden="true">▾</span></summary><div class="row-actions-menu"><a href="#/laudo/${v.id}">Ver laudo</a><a href="#" data-del="vistorias:${v.id}">Excluir</a></div></details></td></tr>`;
  }).join('');

  app.innerHTML = `<section class="page-heading">
    <div><h2>Vistorias</h2><p>Acompanhe rascunhos, laudos assinados e registros vinculados.</p></div>
    <div class="page-actions"><button class="btn" type="button" id="nv-open" aria-haspopup="dialog" aria-controls="nv-drawer" aria-expanded="false" ${temObras ? '' : 'disabled title="Cadastre um imóvel/obra primeiro"'}>+ Nova vistoria</button></div>
  </section>
  ${temObras ? '' : '<div class="warn">Cadastre um imóvel/obra primeiro em <a href="#/cadastros">Cadastros</a>.</div>'}
  <div class="card vistorias-card">
    <div class="list-filters">
      <input id="v-busca" placeholder="Buscar imóvel, cliente, serviço ou responsável…">
      <select id="v-status"><option value="">Todos os status</option><option value="rascunho">Rascunho</option><option value="assinada">Assinada</option></select>
      <select id="v-tipo"><option value="">Todos os tipos</option>${tipos.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('')}</select>
      <select id="v-periodo"><option value="">Todo o período</option><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option><option value="mes">Este mês</option></select>
    </div>
    <p id="v-count" class="list-count"></p>
    <table class="responsive-table"><thead><tr><th>Data</th><th>Imóvel/Cliente</th><th>Tipo</th><th>Responsável</th><th>Valor</th><th>Status</th><th></th></tr></thead><tbody id="v-tbody">
    ${linhas || '<tr><td colspan="7">Nenhuma vistoria cadastrada. Use “Nova vistoria” para começar.</td></tr>'}
    <tr id="v-vazio" hidden><td colspan="7">Nenhum registro corresponde aos filtros.</td></tr>
    </tbody></table>
  </div>
  ${temObras ? `<div id="nv-backdrop" class="drawer-backdrop" hidden></div>
  <aside id="nv-drawer" class="drawer" role="dialog" aria-modal="true" aria-labelledby="nv-title" hidden>
    <div class="drawer-head"><div><p class="eyebrow">Cadastro</p><h2 id="nv-title">Nova vistoria</h2><p class="drawer-sub">Escolha o imóvel, o serviço e o modelo de checklist.</p></div><button class="drawer-close" type="button" id="nv-close" aria-label="Fechar painel">×</button></div>
    <div class="drawer-body">
      <form id="nv" class="grid">
        ${fieldHtml({ k: 'obraId', l: 'Imóvel/Obra', req: 1, opts: os.map(o => [o.id, `${o.nome} — ${cm[o.clienteId] || ''}`]) })}
        ${fieldHtml({ k: 'tipo', l: 'Tipo de serviço', req: 1, opts: ts.map(t => [t.nome, t.nome]) })}
        <div><label>Modelo de checklist</label><select name="modeloId"><option value="">Checklist genérico (padrão)</option>${modelosAtivos.map(m => `<option value="${esc(m.id)}">${esc(m.nome)}</option>`).join('')}</select></div>
        <div class="drawer-actions"><button type="button" class="btn ghost" id="nv-cancel">Cancelar</button><button class="btn" type="submit">Criar vistoria</button></div>
      </form>
    </div>
  </aside>` : ''}`;

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

  const drawer = $('#nv-drawer');
  const backdrop = $('#nv-backdrop');
  const openBtn = $('#nv-open');
  const closeBtn = $('#nv-close');
  const form = $('#nv');
  if (!drawer || !form) return;
  let dirty = false;
  const focaveis = () => [...drawer.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter(el => !el.disabled && el.getClientRects().length);

  const fechar = (force = false) => {
    if (drawer.hidden) return true;
    if (!force && dirty && !confirm('Descartar os dados preenchidos da nova vistoria?')) {
      (form.querySelector('[name="obraId"]') || closeBtn)?.focus();
      return false;
    }
    drawer.hidden = true;
    backdrop.hidden = true;
    document.body.classList.remove('drawer-open');
    openBtn?.setAttribute('aria-expanded', 'false');
    dirty = false;
    openBtn?.focus();
    return true;
  };

  const abrir = () => {
    if (!drawer.hidden) return;
    form.reset();
    dirty = false;
    drawer.hidden = false;
    backdrop.hidden = false;
    document.body.classList.add('drawer-open');
    openBtn?.setAttribute('aria-expanded', 'true');
    (form.querySelector('[name="obraId"]') || closeBtn)?.focus();
  };

  openBtn?.addEventListener('click', abrir);
  closeBtn?.addEventListener('click', () => fechar());
  $('#nv-cancel')?.addEventListener('click', () => fechar());
  backdrop?.addEventListener('click', () => fechar());
  form.addEventListener('input', () => { dirty = true; });
  form.addEventListener('change', () => { dirty = true; });
  drawer.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fechar(); return; }
    if (e.key !== 'Tab') return;
    const els = focaveis();
    if (!els.length) return;
    const primeiro = els[0], ultimo = els[els.length - 1];
    if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
  });

  form.onsubmit = async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(form));
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
    try {
      await put('vistorias', v);
      dirty = false;
      fechar(true);
      location.hash = `#/vistoria/${v.id}`;
    } catch (err) {
      alert('Não foi possível criar a vistoria: ' + (err.message || err));
    }
  };
}
