// Editor do checklist padrão.
import { getCheck, parseCheck, toText } from '../core/checklist.js';
import { del, put } from '../core/db/index.js';
import { $, app, esc } from '../core/dom.js';
import { refresh } from '../core/navigate.js';

export async function checklist() {
  const chk = await getCheck();
  app.innerHTML = `<section class="section-heading client-head"><div><h2>Checklist genérico</h2><p>Usado por vistorias criadas sem um modelo específico. As vistorias já criadas não são alteradas.</p></div><a class="btn ghost" href="#/modelos">Modelos de checklist</a></section>
  <div class="card"><p>Use <code>## Categoria</code> e, abaixo, um item por linha. Vale para as <b>próximas</b> vistorias criadas com o checklist genérico.</p>
  <textarea id="ck" style="min-height:360px">${esc(toText(chk))}</textarea>
  <div class="row"><button class="btn" id="ckS">Salvar</button><button class="btn ghost" id="ckR">Restaurar padrão</button></div></div>`;
  $('#ckS').onclick = async () => { await put('config', { id: 'checklist', data: parseCheck($('#ck').value) }); alert('Salvo.'); };
  $('#ckR').onclick = async () => { await del('config', 'checklist'); refresh(); };
}
