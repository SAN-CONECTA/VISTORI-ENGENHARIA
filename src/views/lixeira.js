// Lixeira.
import { STORE_LABEL } from '../core/config.js';
import { all } from '../core/db/index.js';
import { $, app, esc } from '../core/dom.js';
import { excluirLixeira } from '../core/lixeira.js';
import { refresh } from '../core/navigate.js';
import { fmt, labelReg } from '../core/utils.js';

export async function lixeira() {
  const itens = (await all('lixeira')).sort((a, b) => (b.deletedAt || '').localeCompare(a.deletedAt || ''));
  app.innerHTML = `<section class="section-heading client-head"><div><h2>Lixeira</h2><p>Itens excluídos que podem ser restaurados.</p></div>${itens.length ? '<button type="button" class="btn ghost" id="lx-esvaziar">Esvaziar lixeira</button>' : ''}</section>
  <div class="card"><table><thead><tr><th>Item</th><th>Tipo</th><th>Excluído em</th><th>Por</th><th></th></tr></thead><tbody>
  ${itens.map(it => `<tr><td>${esc(labelReg(it.data || {}))}</td><td>${esc(STORE_LABEL[it.store] || it.store)}</td><td>${fmt(it.deletedAt)}</td><td>${esc(it.por || '—')}</td><td class="act"><a href="#" data-restaurar="${it.id}">Restaurar</a><a href="#" data-lx-del="${it.id}">Excluir definitivamente</a></td></tr>`).join('') || '<tr><td colspan="5">Lixeira vazia.</td></tr>'}
  </tbody></table></div>`;
  const esv = $('#lx-esvaziar');
  if (esv) esv.onclick = async () => {
    if (!confirm('Excluir definitivamente TODOS os itens da lixeira? Não pode ser desfeito.')) return;
    for (const it of itens) await excluirLixeira(it.id);
    refresh();
  };
}
