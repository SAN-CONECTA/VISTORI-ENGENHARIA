// Helpers de interface: seletores, escape de HTML, formulários e CRUD genérico.
import { all, put } from './db/index.js';
import { refresh } from './navigate.js';
import { uid } from './utils.js';

export const $ = s => document.querySelector(s);
export const app = $('#app');
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function fieldHtml(f, v) {
  const req = f.req ? 'required' : '';
  let inp;
  if (f.opts) inp = `<select name="${f.k}" ${req}><option value="">—</option>${f.opts.map(([a, b]) => `<option value="${esc(a)}" ${a === v ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select>`;
  else if (f.type === 'textarea') inp = `<textarea name="${f.k}" ${req}>${esc(v)}</textarea>`;
  else inp = `<input name="${f.k}" type="${f.type || 'text'}" ${f.type === 'number' ? 'step="any" min="0"' : ''} value="${esc(v)}" ${req}>`;
  return `<div><label>${f.l}${f.req ? ' *' : ''}</label>${inp}</div>`;
}
export async function crud(store, title, fields, cols, q, opts = {}) {
  const items = await all(store);
  const qp = new URLSearchParams(q || '');
  const eid = qp.get('e');
  const cur = items.find(i => i.id === eid) || {};
  const val = k => cur[k] ?? (eid ? undefined : qp.get(k) ?? undefined);
  const extra = opts.extra ? await opts.extra(cur) : '';
  app.innerHTML = `<p class="noprint"><a href="#/cadastros">← Cadastros</a></p><h2>${title}</h2>
  <form id="f" class="card grid">${fields.map(f => fieldHtml(f, val(f.k))).join('')}
    <div class="row"><button class="btn">${eid ? 'Salvar' : 'Adicionar'}</button>${eid ? `<a class="btn ghost" href="#/${store}">Cancelar</a>` : ''}</div>
  </form>
  ${extra}
  <div class="card"><input id="busca" placeholder="Buscar na lista…" style="margin-bottom:.5rem">
  <table><thead><tr>${cols.map(c => `<th>${c.l}</th>`).join('')}<th></th></tr></thead><tbody id="tb">
  ${items.map(i => `<tr>${cols.map(c => `<td>${c.fn(i)}</td>`).join('')}<td class="act"><a href="#/${store}?e=${i.id}">Editar</a><a href="#" data-del="${store}:${i.id}">Excluir</a></td></tr>`).join('') || `<tr><td colspan="9">Nada cadastrado.</td></tr>`}
  </tbody></table></div>`;
  $('#busca').oninput = e => {
    const t = e.target.value.toLowerCase();
    document.querySelectorAll('#tb tr').forEach(r => { r.style.display = r.textContent.toLowerCase().includes(t) ? '' : 'none'; });
  };
  $('#f').onsubmit = async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    if (opts.validate) { const msg = await opts.validate(d, cur, items); if (msg) return alert(msg); }
    if (opts.fix) opts.fix(d);
    await put(store, { ...cur, ...d, id: cur.id || uid(), criado: cur.criado || new Date().toISOString() });
    if (opts.after) await opts.after(d, cur);
    location.hash = `#/${store}`;
    refresh();
  };
}
export const hf = (v, k, l, type = 'text') => `<div><label>${l}</label><input type="${type}" ${type === 'number' ? 'step="any" min="0"' : ''} data-h="${k}" value="${esc(v[k])}"></div>`;
export function sigPad(c) {
  const x = c.getContext('2d');
  x.lineWidth = 2.5; x.lineCap = 'round'; x.strokeStyle = '#000';
  let d = false, empty = true;
  const p = e => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * c.width / r.width, (e.clientY - r.top) * c.height / r.height]; };
  c.onpointerdown = e => { d = true; empty = false; const [a, b] = p(e); x.beginPath(); x.moveTo(a, b); c.setPointerCapture(e.pointerId); };
  c.onpointermove = e => { if (!d) return; const [a, b] = p(e); x.lineTo(a, b); x.stroke(); };
  c.onpointerup = () => { d = false; };
  return { isEmpty: () => empty, clear: () => { x.clearRect(0, 0, c.width, c.height); empty = true; } };
}
export function abrirMarcador(src, onSave) {
  const box = document.createElement('div');
  box.className = 'marker noprint'; box.id = 'marker';
  box.innerHTML = `<div class="marker-panel"><div class="section-heading"><div><h3>Marcar sobre a foto</h3><p>Arraste sobre a imagem para destacar a anomalia.</p></div></div><div class="marker-wrap"><img id="marker-img" src="${src}" alt=""><canvas id="marker-canvas"></canvas></div><div class="row"><button type="button" class="btn ghost" id="marker-clear">Limpar</button><button type="button" class="btn" id="marker-save">Salvar marcação</button><button type="button" class="btn ghost" id="marker-cancel">Cancelar</button></div></div>`;
  document.body.appendChild(box);
  const img = box.querySelector('#marker-img');
  const cv = box.querySelector('#marker-canvas');
  const ctx = cv.getContext('2d');
  let drawing = false, painted = false;
  const setup = () => {
    cv.width = img.naturalWidth || img.width || 800;
    cv.height = img.naturalHeight || img.height || 600;
    const r = img.getBoundingClientRect();
    cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
  };
  if (img.complete && img.naturalWidth) setup(); else img.onload = setup;
  const pos = ev => { const r = cv.getBoundingClientRect(); return [(ev.clientX - r.left) * cv.width / r.width, (ev.clientY - r.top) * cv.height / r.height]; };
  cv.onpointerdown = ev => { drawing = true; painted = true; const [x, y] = pos(ev); ctx.beginPath(); ctx.moveTo(x, y); try { cv.setPointerCapture(ev.pointerId); } catch (e) {} };
  cv.onpointermove = ev => { if (!drawing) return; const [x, y] = pos(ev); ctx.lineWidth = Math.max(3, cv.width / 250); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#e53935'; ctx.lineTo(x, y); ctx.stroke(); };
  cv.onpointerup = () => { drawing = false; };
  box.querySelector('#marker-clear').onclick = () => { ctx.clearRect(0, 0, cv.width, cv.height); painted = false; };
  box.querySelector('#marker-cancel').onclick = () => box.remove();
  box.querySelector('#marker-save').onclick = async () => {
    if (!painted) return alert('Faça uma marcação antes de salvar.');
    const out = document.createElement('canvas'); out.width = cv.width; out.height = cv.height;
    const o = out.getContext('2d');
    o.drawImage(img, 0, 0, out.width, out.height);
    o.drawImage(cv, 0, 0);
    const dataUrl = out.toDataURL('image/jpeg', 0.7);
    box.remove();
    await onSave(dataUrl);
  };
}
export function responsiveTables() {
  app.querySelectorAll('table:not(.matrix-table):not(.laudo-dados)').forEach(table => {
    table.classList.add('responsive-table');
    const labels = [...table.querySelectorAll('thead th')].map(th => th.textContent.trim() || 'Ações');
    table.querySelectorAll('tbody tr').forEach(row => {
      [...row.cells].forEach((cell, i) => {
        if (!cell.hasAttribute('colspan')) cell.dataset.label = labels[i] || 'Ações';
      });
    });
  });
}
