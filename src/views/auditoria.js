// Trilha de auditoria.
import { STORE_LABEL } from '../core/config.js';
import { all } from '../core/db/index.js';
import { $, app, esc } from '../core/dom.js';
import { fmt } from '../core/utils.js';

export async function auditoria() {
  const evs = (await all('auditoria')).sort((a, b) => (b.em || '').localeCompare(a.em || '')).slice(0, 300);
  app.innerHTML = `<section class="section-heading client-head"><div><h2>Auditoria</h2><p>Trilha das últimas ações no sistema.</p></div></section>
  <div class="card"><input id="a-busca" placeholder="Buscar ação, entidade ou detalhe…" style="margin-bottom:10px">
  <div class="audit">${evs.map(e => `<div class="audit-item" data-txt="${esc(((e.acao || '') + ' ' + (STORE_LABEL[e.entidade] || e.entidade || '') + ' ' + (e.detalhe || '') + ' ' + (e.por || '')).toLowerCase())}"><span class="audit-when">${fmt(e.em)}</span><span class="audit-what"><b>${esc(e.acao)}</b> · ${esc(STORE_LABEL[e.entidade] || e.entidade || '—')}${e.detalhe ? ' — ' + esc(e.detalhe) : ''}</span><span class="audit-who">${esc(e.por || '—')}</span></div>`).join('') || '<p>Nenhuma ação registrada.</p>'}</div></div>`;
  const b = $('#a-busca'); if (b) b.oninput = () => { const t = b.value.toLowerCase().trim(); document.querySelectorAll('.audit-item').forEach(el => { el.hidden = !!(t && !el.dataset.txt.includes(t)); }); };
}
