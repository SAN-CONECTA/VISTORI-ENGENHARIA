'use strict';
const VERSION = '0.5.1';
/* Modos: 'nuvem' (padrão: Firebase + login) | 'local' (só este aparelho, para testes)
   | 'nuvem-teste' (Firebase sem tela de login; só para testes — as regras do Firestore continuam valendo). */
const AMBIENTE_LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname)
  || (location.hostname === 'san-conecta.github.io' && location.pathname.startsWith('/VISTORI-ENGENHARIA-DEV/'));
const MODO = AMBIENTE_LOCAL ? 'local' : (localStorage.getItem('vistori_modo') || 'nuvem');
const SDK_VERSIONS = ['11.10.0', '10.14.1'];
const STORES = ['clientes', 'obras', 'vistorias', 'agendamentos', 'orcamentos', 'config', 'fornecedores', 'tipos', 'catalogo', 'precos', 'fotos'];
const STORES_DADOS = ['clientes', 'obras', 'vistorias', 'agendamentos', 'orcamentos', 'fornecedores', 'catalogo', 'precos'];
const TIPOS_DEFAULT = ['Particular', 'Indicação', 'Judicial', 'Avaliação bancária', 'Vistoria de entrega', 'Inspeção predial'];
const TIPOS_OBRA = ['Residencial', 'Comercial', 'Obra particular', 'Obra corporativa'];
const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
const UNIDADES = ['un', 'h', 'm²', 'km', 'visita'];
const CAD = ['cadastros', 'clientes', 'obras', 'fornecedores', 'tipos', 'catalogo', 'precos'];
const ST = { '': '— avaliar —', C: 'Conforme', N: 'Não conforme', NA: 'N/A' };
const DEFAULT_CHECK = {
  'Análise estrutural': ['Fissuras e trincas', 'Infiltrações em lajes e paredes', 'Pilares, vigas e lajes aparentes'],
  'Acabamento': ['Pisos e revestimentos', 'Pintura', 'Forro e gesso'],
  'Hidráulica': ['Pontos de água', 'Esgoto e caimento', 'Vazamentos', 'Louças e metais'],
  'Elétrica': ['Quadro de distribuição', 'Tomadas e interruptores', 'Iluminação', 'Aterramento'],
  'Esquadrias': ['Portas', 'Janelas', 'Vedação e ferragens']
};

const $ = s => document.querySelector(s);
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const fmt = iso => iso ? new Date(iso).toLocaleString('pt-BR') : '';
const brl = v => (v === '' || v == null || isNaN(v)) ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/* ---------- Armazenamento local (IndexedDB v3) ---------- */
const openDB = () => new Promise((res, rej) => {
  const r = indexedDB.open('vistori', 5);
  r.onupgradeneeded = () => STORES.forEach(s => { if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s, { keyPath: 'id' }); });
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
async function tx(store, mode, fn) {
  const d = await openDB();
  return new Promise((res, rej) => {
    const t = d.transaction(store, mode);
    const rq = fn(t.objectStore(store));
    t.oncomplete = () => res(rq && rq.result);
    t.onerror = () => rej(t.error);
  });
}
const L = {
  all: s => tx(s, 'readonly', o => o.getAll()),
  get: (s, id) => tx(s, 'readonly', o => o.get(id)),
  put: (s, v) => tx(s, 'readwrite', o => o.put(v)),
  del: (s, id) => tx(s, 'readwrite', o => o.delete(id))
};

/* ---------- Armazenamento na nuvem (Firestore, com cache offline) ---------- */
function makeCloud(F, fs) {
  // Offline, setDoc só conclui quando o servidor confirma. Esperamos no máximo 2,5 s e seguimos:
  // o dado já está no cache local e sobe sozinho quando a internet voltar.
  const wait = p => Promise.race([p, new Promise(r => setTimeout(r, 2500))]);
  const log = (s, p) => { p.catch(e => console.error('Falha ao sincronizar', s, e)); return p; };
  return {
    all: async s => (await F.getDocs(F.collection(fs, s))).docs.map(d => d.data()),
    get: async (s, id) => {
      try { const d = await F.getDoc(F.doc(fs, s, id)); return d.exists() ? d.data() : undefined; }
      catch (e) { if (e.code === 'unavailable') return undefined; throw e; }
    },
    put: (s, v, ack) => { const p = log(s, F.setDoc(F.doc(fs, s, v.id), v)); return ack ? p : wait(p); },
    del: (s, id) => wait(log(s, F.deleteDoc(F.doc(fs, s, id))))
  };
}

let B = null;        // backend ativo (L ou nuvem)
let F = null, auth = null, USER = null;
const all = s => B.all(s);
const get = (s, id) => B.get(s, id);
const put = (s, v, ack) => B.put(s, v, ack);
const del = (s, id) => B.del(s, id);

/* ---------- utilidades ---------- */
const sha = async s => {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
};
// JSON canônico (chaves ordenadas): o Firestore não preserva a ordem das chaves.
const canon = o => Array.isArray(o) ? '[' + o.map(canon).join(',') + ']'
  : (o && typeof o === 'object') ? '{' + Object.keys(o).filter(k => o[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canon(o[k])).join(',') + '}'
    : JSON.stringify(o);
const comprimir = f => new Promise(res => {
  const img = new Image();
  img.onload = () => {
    const s = Math.min(1, 1024 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * s);
    c.height = Math.round(img.height * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(img.src);
    res(c.toDataURL('image/jpeg', 0.65));
  };
  img.src = URL.createObjectURL(f);
});
const toText = o => Object.entries(o).map(([c, a]) => `## ${c}\n${a.join('\n')}`).join('\n\n');
const parseCheck = t => {
  const o = {}; let c = null;
  t.split('\n').forEach(l => {
    l = l.trim(); if (!l) return;
    if (l.startsWith('## ')) { c = l.slice(3); o[c] = []; } else if (c) o[c].push(l);
  });
  return o;
};
const getCheck = async () => (await get('config', 'checklist'))?.data || DEFAULT_CHECK;

/* CPF / CNPJ */
const dig = s => String(s || '').replace(/\D/g, '');
function cpfOk(c) {
  c = dig(c);
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  let s = 0; for (let i = 0; i < 9; i++) s += c[i] * (10 - i);
  let d = (s * 10) % 11 % 10; if (d != c[9]) return false;
  s = 0; for (let i = 0; i < 10; i++) s += c[i] * (11 - i);
  d = (s * 10) % 11 % 10; return d == c[10];
}
function cnpjOk(c) {
  c = dig(c);
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const calc = n => { let s = 0, p = n - 7; for (let i = 0; i < n; i++) { s += c[i] * p--; if (p < 2) p = 9; } const r = s % 11; return r < 2 ? 0 : 11 - r; };
  return calc(12) == c[12] && calc(13) == c[13];
}
const fmtDoc = raw => {
  raw = dig(raw);
  return raw.length === 11 ? raw.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
    : raw.length === 14 ? raw.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : raw;
};
function docMsg(d, items, cur) {
  const raw = dig(d.documento);
  if (!raw) return null;
  const tipo = d.pessoa || (raw.length === 11 ? 'PF' : 'PJ');
  if (tipo === 'PF' && !cpfOk(raw)) return 'CPF inválido.';
  if (tipo === 'PJ' && !cnpjOk(raw)) return 'CNPJ inválido.';
  if (items.some(i => i.id !== cur.id && dig(i.documento) === raw)) return 'Já existe um cadastro com este documento.';
  return null;
}

/* Tipos de serviço: semeados uma única vez com os 6 padrões */
const getTipos = async () => {
  if (!(await get('config', 'seedTipos'))) {
    for (const n of TIPOS_DEFAULT) {
      const slug = n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-');
      await put('tipos', { id: 'tp-' + slug, nome: n, descricao: '', criado: new Date().toISOString() });
    }
    await put('config', { id: 'seedTipos', ok: true });
  }
  return (await all('tipos')).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
};

/* Fotos ficam em documentos próprios (limite de 1 MB por documento no Firestore) */
async function fotosMap(v) {
  const ids = v.itens.flatMap(i => i.fotos.filter(f => f.id).map(f => f.id));
  const arr = await Promise.all(ids.map(id => get('fotos', id)));
  const m = {}; arr.forEach((x, k) => { if (x) m[ids[k]] = x.src; });
  return m;
}
async function fotosSha(v) {
  const o = {};
  for (const [i, it] of v.itens.entries()) for (const [j, f] of it.fotos.entries())
    o[`${i}:${j}`] = await sha(f.src || (await get('fotos', f.id))?.src || '');
  return o;
}
async function calcHash(v, ts) {
  const { assinatura, status, ...base } = v;
  return sha(canon({ ...base, fotosSha: await fotosSha(v) }) + ts);
}

let curV = null;
let pad = null;

/* ---------- CRUD genérico ---------- */
function fieldHtml(f, v) {
  const req = f.req ? 'required' : '';
  let inp;
  if (f.opts) inp = `<select name="${f.k}" ${req}><option value="">—</option>${f.opts.map(([a, b]) => `<option value="${esc(a)}" ${a === v ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select>`;
  else if (f.type === 'textarea') inp = `<textarea name="${f.k}" ${req}>${esc(v)}</textarea>`;
  else inp = `<input name="${f.k}" type="${f.type || 'text'}" ${f.type === 'number' ? 'step="any" min="0"' : ''} value="${esc(v)}" ${req}>`;
  return `<div><label>${f.l}${f.req ? ' *' : ''}</label>${inp}</div>`;
}

async function crud(store, title, fields, cols, q, opts = {}) {
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
    render();
  };
}

/* ---------- 1.1 Clientes e vínculo com imóveis/obras ---------- */
async function clientes(q) {
  const os = await all('obras');
  const n = id => os.filter(o => o.clienteId === id).length;
  return crud('clientes', 'Clientes', [
    { k: 'pessoa', l: 'Tipo de pessoa', req: 1, opts: [['PF', 'Pessoa Física'], ['PJ', 'Pessoa Jurídica']] },
    { k: 'nome', l: 'Nome / Razão social', req: 1 },
    { k: 'fantasia', l: 'Nome fantasia / Contato' },
    { k: 'documento', l: 'CPF / CNPJ' },
    { k: 'telefone', l: 'Telefone', type: 'tel' },
    { k: 'email', l: 'E-mail', type: 'email' },
    { k: 'endereco', l: 'Endereço' },
    { k: 'cidade', l: 'Cidade' },
    { k: 'uf', l: 'UF', opts: UFS.map(u => [u, u]) },
    { k: 'observacoes', l: 'Observações', type: 'textarea' }
  ], [
    { l: 'Cliente', fn: i => `<a href="#/cliente/${i.id}">${esc(i.nome)}</a><br><small>${esc(i.pessoa)} ${esc(i.documento)}</small>` },
    { l: 'Contato', fn: i => `${esc(i.telefone)}<br><small>${esc(i.email)}</small>` },
    { l: 'Imóveis', fn: i => n(i.id) }
  ], q, {
    validate: (d, cur, items) => docMsg(d, items, cur),
    fix: d => { d.documento = fmtDoc(d.documento); },
    extra: cur => {
      if (!cur.id) return '';
      const mine = os.filter(o => o.clienteId === cur.id);
      return `<div class="card"><h3>Imóveis/obras de ${esc(cur.nome)}</h3>
      ${mine.map(o => `<div>${esc(o.nome)} <small>${esc(o.tipo)} · ${esc(o.cidade)}</small> · <a href="#/obras?e=${o.id}">abrir</a></div>`).join('') || '<p>Nenhum vínculo ainda.</p>'}
      <a class="btn ghost" href="#/obras?clienteId=${cur.id}">+ Novo imóvel/obra para este cliente</a></div>`;
    }
  });
}

/* ---------- 1.1.1 Ficha do cliente ---------- */
async function cliente(id) {
  const [c, os, vs] = await Promise.all([get('clientes', id), all('obras'), all('vistorias')]);
  if (!c) { app.innerHTML = '<div class="warn">Cliente não encontrado.</div>'; return; }
  const obras = os.filter(o => o.clienteId === id);
  const vist = vs.filter(v => obras.some(o => o.id === v.obraId)).sort((a, b) => (b.criado || '').localeCompare(a.criado || ''));
  const doc = [c.documento, c.pessoa].filter(Boolean).join(' · ');
  const cidade = [c.cidade, c.uf].filter(Boolean).join('/');
  const desde = c.criado ? new Date(c.criado).toLocaleDateString('pt-BR') : '—';
  app.innerHTML = `<p class="noprint"><a href="#/clientes">← Clientes</a></p>
  <section class="section-heading client-head"><div><h2>${esc(c.nome)}</h2><p>${esc(doc)}${cidade ? ' · ' + esc(cidade) : ''}</p></div>
    <div class="dashboard-actions"><a class="btn" href="#/obras?clienteId=${encodeURIComponent(c.id)}">+ Novo imóvel/obra</a><a class="btn ghost" href="#/clientes?e=${encodeURIComponent(c.id)}">Editar</a></div></section>
  <div class="grid">
    <div class="card"><h3>Contato</h3>
      ${c.fantasia ? `<p><b>Contato / responsável:</b> ${esc(c.fantasia)}</p>` : ''}
      ${c.telefone ? `<p><b>Telefone:</b> ${esc(c.telefone)}</p>` : ''}
      ${c.email ? `<p><b>E-mail:</b> ${esc(c.email)}</p>` : ''}
      ${c.endereco ? `<p><b>Endereço:</b> ${esc(c.endereco)}</p>` : ''}
      <p><b>Cliente desde:</b> ${esc(desde)}</p>
      ${c.observacoes ? `<p><b>Observações:</b> ${esc(c.observacoes)}</p>` : ''}
    </div>
    <div class="card"><h3>Consentimento LGPD</h3>
      ${c.consentimento ? `<p class="ok">Registrado em ${new Date(c.consentimento).toLocaleString('pt-BR')}</p>` : `<p class="warn">Sem registro de consentimento.</p><button class="btn" id="consentir">Registrar consentimento</button>`}
    </div>
  </div>
  <div class="card"><h3>Imóveis / obras</h3>
    ${obras.map(o => { const n = vist.filter(v => v.obraId === o.id).length; return `<div>${esc(o.nome)} <small>${esc(o.tipo)}${o.cidade ? ' · ' + esc(o.cidade) : ''} · ${n} vistoria(s)</small> · <a href="#/obras?e=${o.id}">abrir</a></div>`; }).join('') || '<p>Nenhum imóvel/obra vinculado.</p>'}
  </div>
  <div class="card"><h3>Histórico de vistorias</h3>
    <table><thead><tr><th>Data</th><th>Imóvel/Obra</th><th>Tipo</th><th>Status</th><th></th></tr></thead><tbody>
    ${vist.map(v => { const o = obras.find(x => x.id === v.obraId); return `<tr><td>${esc(v.data)}${v.hora ? ' ' + esc(v.hora) : ''}</td><td>${esc(o?.nome || '?')}</td><td>${esc(v.tipo)}</td><td>${v.status === 'assinada' ? 'Assinada' : 'Rascunho'}</td><td class="act"><a href="#/vistoria/${v.id}">Abrir</a><a href="#/laudo/${v.id}">Laudo</a></td></tr>`; }).join('') || '<tr><td colspan="5">Nenhuma vistoria.</td></tr>'}
    </tbody></table>
  </div>`;
  const btn = $('#consentir');
  if (btn) btn.onclick = async () => { await put('clientes', { ...c, consentimento: new Date().toISOString() }); cliente(c.id); };
}

async function obras(q) {
  const cls = await all('clientes');
  const map = Object.fromEntries(cls.map(c => [c.id, c.nome]));
  if (!cls.length) { app.innerHTML = '<p><a href="#/cadastros">← Cadastros</a></p><h2>Imóveis / Obras</h2><div class="warn">Cadastre um cliente primeiro.</div>'; return; }
  return crud('obras', 'Imóveis / Obras', [
    { k: 'nome', l: 'Identificação (ex.: Apto 302 – Ed. Sol)', req: 1 },
    { k: 'clienteId', l: 'Cliente', req: 1, opts: cls.map(c => [c.id, c.nome]) },
    { k: 'tipo', l: 'Tipo', req: 1, opts: TIPOS_OBRA.map(t => [t, t]) },
    { k: 'endereco', l: 'Endereço' },
    { k: 'cidade', l: 'Cidade' },
    { k: 'uf', l: 'UF', opts: UFS.map(u => [u, u]) },
    { k: 'area', l: 'Área (m²)', type: 'number' },
    { k: 'observacoes', l: 'Observações', type: 'textarea' }
  ], [
    { l: 'Imóvel/Obra', fn: i => `${esc(i.nome)}<br><small>${esc(i.endereco)}</small>` },
    { l: 'Cliente', fn: i => esc(map[i.clienteId] || '?') },
    { l: 'Tipo', fn: i => esc(i.tipo) },
    { l: 'Cidade', fn: i => `${esc(i.cidade)}${i.uf ? '/' + esc(i.uf) : ''}` }
  ], q);
}

/* ---------- 1.2 Cadastros gerais ---------- */
const fornecedores = q => crud('fornecedores', 'Fornecedores e Empreiteiros', [
  { k: 'categoria', l: 'Categoria', req: 1, opts: [['Fornecedor', 'Fornecedor'], ['Empreiteiro', 'Empreiteiro'], ['Ambos', 'Fornecedor e empreiteiro']] },
  { k: 'nome', l: 'Nome / Razão social', req: 1 },
  { k: 'pessoa', l: 'Tipo de pessoa', opts: [['PF', 'Pessoa Física'], ['PJ', 'Pessoa Jurídica']] },
  { k: 'documento', l: 'CPF / CNPJ' },
  { k: 'especialidade', l: 'Especialidade (ex.: hidráulica, elétrica, pintura)' },
  { k: 'contato', l: 'Pessoa de contato' },
  { k: 'telefone', l: 'Telefone', type: 'tel' },
  { k: 'email', l: 'E-mail', type: 'email' },
  { k: 'cidade', l: 'Cidade' },
  { k: 'uf', l: 'UF', opts: UFS.map(u => [u, u]) },
  { k: 'observacoes', l: 'Observações', type: 'textarea' }
], [
  { l: 'Nome', fn: i => `${esc(i.nome)}<br><small>${esc(i.documento)}</small>` },
  { l: 'Categoria', fn: i => `${esc(i.categoria)}<br><small>${esc(i.especialidade)}</small>` },
  { l: 'Contato', fn: i => `${esc(i.contato)}<br><small>${esc(i.telefone)}</small>` }
], q, {
  validate: (d, cur, items) => docMsg(d, items, cur),
  fix: d => { d.documento = fmtDoc(d.documento); }
});

async function tiposServico(q) {
  await getTipos();
  return crud('tipos', 'Categorias e Tipos de Serviço', [
    { k: 'nome', l: 'Nome do tipo de serviço', req: 1 },
    { k: 'descricao', l: 'Descrição', type: 'textarea' }
  ], [
    { l: 'Tipo de serviço', fn: i => esc(i.nome) },
    { l: 'Descrição', fn: i => esc(i.descricao) }
  ], q, {
    validate: (d, cur, items) => items.some(i => i.id !== cur.id && i.nome.toLowerCase() === d.nome.trim().toLowerCase()) ? 'Já existe um tipo com este nome.' : null,
    fix: d => { d.nome = d.nome.trim(); },
    after: async (d, cur) => {
      if (cur.id && cur.nome && cur.nome !== d.nome)
        for (const v of await all('vistorias')) if (v.tipo === cur.nome && v.status !== 'assinada') { v.tipo = d.nome; await put('vistorias', v); }
    }
  });
}

const catalogo = q => crud('catalogo', 'Catálogo de Itens e Serviços Adicionais', [
  { k: 'nome', l: 'Item / serviço (ex.: Deslocamento, Hora técnica, Taxa de ART)', req: 1 },
  { k: 'unidade', l: 'Unidade', req: 1, opts: UNIDADES.map(u => [u, u]) },
  { k: 'valor', l: 'Valor unitário (R$)', req: 1, type: 'number' },
  { k: 'observacoes', l: 'Observações', type: 'textarea' }
], [
  { l: 'Item', fn: i => esc(i.nome) },
  { l: 'Unidade', fn: i => esc(i.unidade) },
  { l: 'Valor', fn: i => brl(i.valor) }
], q);

async function precos() {
  const [ts, ps] = await Promise.all([getTipos(), all('precos')]);
  const pm = Object.fromEntries(ps.map(p => [p.id, p.valor]));
  app.innerHTML = `<p class="noprint"><a href="#/cadastros">← Cadastros</a></p><h2>Tabela de Preços</h2>
  <div class="card"><p>Valor padrão (R$) por tipo de serviço e tipo de imóvel. Ao criar uma vistoria, o valor correspondente já vem preenchido e pode ser ajustado. Deixe em branco quando não houver preço padrão. Salva ao sair do campo.</p>
  <table class="matrix-table"><thead><tr><th>Serviço</th>${TIPOS_OBRA.map(t => `<th>${esc(t)}</th>`).join('')}</tr></thead><tbody>
  ${ts.map(t => `<tr><td>${esc(t.nome)}</td>${TIPOS_OBRA.map(o => `<td><input type="number" step="0.01" min="0" data-p="${t.id}|${o}" value="${pm[t.id + '|' + o] ?? ''}"></td>`).join('')}</tr>`).join('') || '<tr><td colspan="5">Cadastre os tipos de serviço primeiro.</td></tr>'}
  </tbody></table></div>
  <p><a href="#/catalogo">Catálogo de itens e serviços adicionais →</a></p>`;
}

async function cadastros() {
  const [c, o, f, t, k, p] = await Promise.all([all('clientes'), all('obras'), all('fornecedores'), getTipos(), all('catalogo'), all('precos')]);
  const card = (h, titulo, n, desc) => `<a class="card hubcard" href="${h}"><b>${titulo}</b><div class="stat">${n}</div><small>${desc}</small></a>`;
  app.innerHTML = `<h2>Cadastros e Estrutura Base</h2><div class="grid">
    ${card('#/clientes', 'Clientes', c.length, 'Pessoa física e jurídica')}
    ${card('#/obras', 'Imóveis / Obras', o.length, 'Vinculados aos clientes')}
    ${card('#/fornecedores', 'Fornecedores e Empreiteiros', f.length, 'Parceiros e prestadores')}
    ${card('#/tipos', 'Tipos de Serviço', t.length, 'Particular, judicial, entrega…')}
    ${card('#/precos', 'Tabela de Preços', p.length, 'Valores por serviço × imóvel')}
    ${card('#/catalogo', 'Catálogo de Itens', k.length, 'Deslocamento, hora técnica…')}
  </div>`;
}

/* ---------- migração: dados antigos deste aparelho → nuvem ---------- */
const migFlag = () => 'vistori_migrado_' + (USER?.uid || 'teste');
async function contaLocal() {
  let n = 0;
  for (const s of STORES_DADOS) n += (await L.all(s)).length;
  return n;
}
async function bannerMigracao() {
  if (MODO === 'local' || localStorage.getItem(migFlag())) return '';
  const n = await contaLocal();
  if (!n) return '';
  return `<div class="warn"><b>${n} registro(s)</b> de versões anteriores estão salvos só neste aparelho.
  <div><button class="btn" id="migrar">Enviar para a nuvem</button></div><small>Precisa de internet. Não apaga nada deste aparelho.</small></div>`;
}
async function migrarLocal(prog) {
  let n = 0;
  const passo = () => { n++; if (prog && n % 5 === 0) prog(n); };
  for (const s of ['clientes', 'obras', 'agendamentos', 'orcamentos', 'fornecedores', 'tipos', 'catalogo', 'precos', 'config']) for (const x of await L.all(s)) { await B.put(s, x, true); passo(); }
  for (const f of await L.all('fotos')) { await B.put('fotos', f, true); passo(); }
  for (const v of await L.all('vistorias')) {
    for (const it of v.itens || []) {
      it.fotos = await Promise.all((it.fotos || []).map(async f => {
        if (!f.src) return f;
        const id = uid();
        await B.put('fotos', { id, vistoriaId: v.id, src: f.src }, true);
        return { id, legenda: f.legenda || '' };
      }));
    }
    await B.put('vistorias', v, true); passo();
  }
  localStorage.setItem(migFlag(), '1');
  return n;
}

/* ---------- início ---------- */
async function inicio() {
  const [c, o, v, ag] = await Promise.all([all('clientes'), all('obras'), all('vistorias'), all('agendamentos')]);
  const om = Object.fromEntries(o.map(x => [x.id, x]));
  const cm = Object.fromEntries(c.map(x => [x.id, x.nome]));
  const agora = new Date();
  const saudacao = agora.getHours() < 12 ? 'Bom dia' : agora.getHours() < 18 ? 'Boa tarde' : 'Boa noite';
  const dataExtenso = agora.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const emAndamento = v.filter(x => x.status !== 'assinada');
  const assinadas = v.filter(x => x.status === 'assinada');
  const naoConformes = v.reduce((n, x) => n + (x.itens || []).filter(i => i.status === 'N').length, 0);
  const semAvaliacao = v.reduce((n, x) => n + (x.itens || []).filter(i => !i.status).length, 0);
  const recentes = [...v].sort((a, b) => (b.criado || '').localeCompare(a.criado || '')).slice(0, 5);
  const hoje = agora.toISOString().slice(0, 10);
  const visitasHoje = ag.filter(x => x.data === hoje && x.status !== 'Cancelada');
  const proximos = ag.filter(x => x.data && x.data >= hoje && x.status !== 'Cancelada' && x.status !== 'Concluída').sort((a, b) => `${a.data} ${a.hora || ''}`.localeCompare(`${b.data} ${b.hora || ''}`)).slice(0, 5);
  const atividades = [];
  for (const x of v) { atividades.push({ ts: x.criado, tipo: 'vistoria', v: x }); if (x.assinatura?.ts) atividades.push({ ts: x.assinatura.ts, tipo: 'laudo', v: x }); }
  for (const x of ag) atividades.push({ ts: x.criado, tipo: 'agenda', a: x });
  const ultimas = atividades.filter(e => e.ts).sort((a, b) => (b.ts || '').localeCompare(a.ts || '')).slice(0, 6);
  const statusClass = s => 'agenda-' + String(s || '').toLowerCase().replace(/\s+/g, '-');
  const evt = e => {
    if (e.tipo === 'agenda') { const o = om[e.a.obraId]; return { icon: 'AG', txt: 'Visita agendada', sub: `${o?.nome || 'Imóvel não encontrado'} · ${dataBR(e.a.data)} ${e.a.hora || ''}`.trim(), href: `#/agenda?e=${e.a.id}` }; }
    const o = om[e.v.obraId];
    if (e.tipo === 'laudo') return { icon: 'AS', txt: 'Laudo assinado', sub: `${o?.nome || 'Imóvel não encontrado'} · ${e.v.tipo}`, href: `#/laudo/${e.v.id}` };
    return { icon: 'VI', txt: 'Vistoria criada', sub: `${o?.nome || 'Imóvel não encontrado'} · ${e.v.tipo}`, href: `#/vistoria/${e.v.id}` };
  };
  const aviso = MODO === 'local'
    ? '<div class="warn"><b>Modo local (teste):</b> os dados ficam somente neste aparelho/navegador.</div>'
    : '<div class="ok">Dados na nuvem (Firebase). Funciona offline: o que você salvar sem internet sobe sozinho quando a conexão voltar.</div>';
  const kpi = (href, titulo, valor, detalhe, tone = '') => `<a class="kpi-card ${tone}" href="${href}"><span>${titulo}</span><strong>${valor}</strong><small>${detalhe}</small><i>Ver detalhes →</i></a>`;
  app.innerHTML = `<section class="dashboard-heading">
    <div><h2>${saudacao}</h2><p>${dataExtenso.charAt(0).toUpperCase() + dataExtenso.slice(1)}</p></div>
    <div class="dashboard-actions"><a class="btn" href="#/vistorias">+ Nova vistoria</a><a class="btn ghost" href="#/agenda?nova=1">Agendar visita</a><a class="btn ghost" href="#/clientes">Novo cliente</a><a class="btn ghost" href="#/obras">Novo imóvel</a></div>
  </section>
  ${aviso}${await bannerMigracao()}
  <section class="kpi-grid" aria-label="Resumo operacional">
    ${kpi('#/agenda', 'Visitas de hoje', visitasHoje.length, visitasHoje.length ? visitasHoje.map(x => x.hora).filter(Boolean).join(' e ') : 'Nenhuma visita agendada')}
    ${kpi('#/vistorias', 'Vistorias em andamento', emAndamento.length, emAndamento.length ? 'Registros que ainda podem ser editados' : 'Nenhuma vistoria pendente')}
    ${kpi('#/vistorias', 'Laudos assinados', assinadas.length, assinadas.length ? 'Documentos finalizados' : 'Nenhum laudo assinado', 'success')}
    ${kpi('#/clientes', 'Clientes', c.length, `${o.length} imóvel(is) ou obra(s) vinculados`)}
    ${kpi('#/vistorias', 'Não conformidades', naoConformes, semAvaliacao ? `${semAvaliacao} item(ns) ainda sem avaliação` : 'Todos os itens avaliados', naoConformes ? 'danger' : 'success')}
  </section>
  <section class="dashboard-grid">
    <div class="card dashboard-recent"><div class="section-heading"><div><h3>Vistorias recentes</h3><p>Acompanhe os últimos registros do sistema.</p></div><a href="#/vistorias">Ver todas →</a></div>
      <table><thead><tr><th>Data</th><th>Imóvel/Obra</th><th>Tipo</th><th>Status</th></tr></thead><tbody>
      ${recentes.map(x => `<tr><td>${esc(x.data)}</td><td><a href="#/vistoria/${x.id}">${esc(om[x.obraId]?.nome || 'Não informado')}</a></td><td>${esc(x.tipo)}</td><td><span class="status-badge ${x.status === 'assinada' ? 'signed' : 'draft'}">${x.status === 'assinada' ? 'Assinada' : 'Em andamento'}</span></td></tr>`).join('') || '<tr><td colspan="4">Nenhuma vistoria cadastrada. Use o botão Nova vistoria para começar.</td></tr>'}
      </tbody></table>
    </div>
    <aside class="card dashboard-summary"><div class="section-heading"><div><h3>Estrutura da base</h3><p>Cadastros usados nas vistorias.</p></div></div>
      <a href="#/clientes"><span>Clientes cadastrados</span><b>${c.length}</b></a>
      <a href="#/obras"><span>Imóveis e obras</span><b>${o.length}</b></a>
      <a href="#/cadastros"><span>Gerenciar cadastros auxiliares</span><b>→</b></a>
      <a href="#/backup"><span>Exportar cópia de segurança</span><b>→</b></a>
    </aside>
  </section>
  <section class="dashboard-grid">
    <div class="card dashboard-upcoming">
      <div class="section-heading"><div><h3>Próximos compromissos</h3><p>Visitas agendadas a partir de hoje.</p></div><a href="#/agenda">Ver agenda →</a></div>
      ${proximos.length ? `<div class="agenda-mini">${proximos.map(x => { const obra = om[x.obraId]; return `<a class="agenda-mini-item" href="#/agenda?e=${encodeURIComponent(x.id)}"><span class="agenda-mini-when"><b>${dataBR(x.data)}</b><small>${esc(x.hora || '—')}</small></span><span class="agenda-mini-info"><b>${esc(obra?.nome || 'Imóvel não encontrado')}</b><small>${esc(cm[obra?.clienteId] || '')} · ${esc(x.tipo)}</small></span><span class="status-badge ${statusClass(x.status)}">${esc(x.status)}</span></a>`; }).join('')}</div>` : '<p>Nenhuma visita agendada para os próximos dias.</p>'}
    </div>
    <aside class="card dashboard-activity">
      <div class="section-heading"><div><h3>Atividades recentes</h3><p>Últimos movimentos no sistema.</p></div></div>
      ${ultimas.length ? `<ol class="timeline">${ultimas.map(e => { const d = evt(e); return `<li><span class="tl-code">${d.icon}</span><div><a href="${d.href}">${esc(d.txt)}</a><small>${esc(d.sub)}</small><em>${fmt(e.ts)}</em></div></li>`; }).join('')}</ol>` : '<p>Nenhuma atividade registrada ainda.</p>'}
    </aside>
  </section>`;
}

/* ---------- agenda ---------- */
const dataBR = data => data ? new Date(data + 'T12:00:00').toLocaleDateString('pt-BR') : '—';

async function novaVistoriaDaAgenda(agendamento) {
  const [obra, ts] = await Promise.all([get('obras', agendamento.obraId), getTipos()]);
  if (!obra) throw new Error('O imóvel/obra deste agendamento não foi encontrado.');
  const chk = await getCheck();
  const itens = [];
  for (const [cat, arr] of Object.entries(chk)) for (const desc of arr) itens.push({ cat, desc, status: '', obs: '', fotos: [] });
  const tp = ts.find(t => t.nome === agendamento.tipo);
  const pr = tp ? await get('precos', `${tp.id}|${obra.tipo}`) : null;
  const v = {
    id: uid(), obraId: obra.id, tipo: agendamento.tipo, data: agendamento.data, hora: agendamento.hora || '',
    vistoriador: agendamento.responsavel || '', crea: '', artNumero: '', valor: pr ? pr.valor : '',
    orientacoes: agendamento.observacoes || '', itens, status: 'rascunho', agendamentoId: agendamento.id, criado: new Date().toISOString()
  };
  await put('vistorias', v);
  await put('agendamentos', { ...agendamento, vistoriaId: v.id, status: 'Em andamento', atualizado: new Date().toISOString() });
  return v;
}

async function agenda(q) {
  const [ags, os, cls, ts] = await Promise.all([all('agendamentos'), all('obras'), all('clientes'), getTipos()]);
  const om = Object.fromEntries(os.map(o => [o.id, o]));
  const cm = Object.fromEntries(cls.map(c => [c.id, c.nome]));
  const qp = new URLSearchParams(q || '');
  const cur = ags.find(x => x.id === qp.get('e')) || (qp.has('nova') ? { obraId: qp.get('obraId') || '', tipo: qp.get('tipo') || '', data: qp.get('data') || '' } : {});
  const mostrarForm = qp.has('nova') || !!cur.id;
  const hoje = new Date().toISOString().slice(0, 10);
  const status = ['Agendada', 'Confirmada', 'Em andamento', 'Concluída', 'Cancelada'];
  const ordenados = [...ags].sort((a, b) => `${a.data || ''} ${a.hora || ''}`.localeCompare(`${b.data || ''} ${b.hora || ''}`));
  const opcaoObra = os.map(o => [o.id, `${o.nome} — ${cm[o.clienteId] || 'Cliente não informado'}`]);
  app.innerHTML = `<section class="section-heading agenda-title"><div><h2>Agenda</h2><p>Organize visitas e inicie a vistoria usando os dados do agendamento.</p></div>
    <a class="btn" href="#/agenda?nova=1">+ Agendar visita</a></section>
  ${mostrarForm ? `<form id="agenda-form" class="card grid">
    ${fieldHtml({ k: 'data', l: 'Data', type: 'date', req: 1 }, cur.data || hoje)}
    ${fieldHtml({ k: 'hora', l: 'Horário', type: 'time', req: 1 }, cur.hora || '')}
    ${fieldHtml({ k: 'obraId', l: 'Imóvel/Obra', opts: opcaoObra, req: 1 }, cur.obraId || '')}
    ${fieldHtml({ k: 'tipo', l: 'Tipo de serviço', opts: ts.map(t => [t.nome, t.nome]), req: 1 }, cur.tipo || '')}
    ${fieldHtml({ k: 'responsavel', l: 'Responsável técnico' }, cur.responsavel || '')}
    ${fieldHtml({ k: 'status', l: 'Status', opts: status.map(x => [x, x]), req: 1 }, cur.status || 'Agendada')}
    ${fieldHtml({ k: 'observacoes', l: 'Observações', type: 'textarea' }, cur.observacoes || '')}
    <div class="row agenda-form-actions"><button class="btn">${cur.id ? 'Salvar alterações' : 'Agendar visita'}</button><a class="btn ghost" href="#/agenda">Cancelar</a></div>
  </form>` : ''}
  ${!os.length ? '<div class="warn">Cadastre um cliente e um imóvel/obra antes de criar um agendamento.</div>' : ''}
  <div class="card agenda-list">
    <div class="agenda-filters"><input id="agenda-busca" placeholder="Buscar cliente, imóvel, serviço ou responsável…"><select id="agenda-status"><option value="">Todos os status</option>${status.map(x => `<option>${x}</option>`).join('')}</select></div>
    <table><thead><tr><th>Data</th><th>Imóvel/Cliente</th><th>Serviço</th><th>Responsável</th><th>Status</th><th></th></tr></thead><tbody id="agenda-tbody">
    ${ordenados.map(x => { const obra = om[x.obraId]; return `<tr data-status="${esc(x.status)}"><td><b>${dataBR(x.data)}</b><br><small>${esc(x.hora)}</small></td><td>${esc(obra?.nome || 'Não encontrado')}<br><small>${esc(cm[obra?.clienteId] || '')}</small></td><td>${esc(x.tipo)}</td><td>${esc(x.responsavel || '—')}</td><td><span class="status-badge agenda-${esc((x.status || '').toLowerCase().replace(/\s+/g, '-'))}">${esc(x.status)}</span></td><td class="act"><a href="#/agenda?e=${encodeURIComponent(x.id)}">Editar</a>${x.vistoriaId ? `<a href="#/vistoria/${encodeURIComponent(x.vistoriaId)}">Abrir vistoria</a>` : x.status !== 'Cancelada' ? `<a href="#" data-agenda-iniciar="${esc(x.id)}">Iniciar vistoria</a>` : ''}<a href="#" data-del="agendamentos:${esc(x.id)}">Excluir</a></td></tr>`; }).join('') || '<tr><td colspan="6">Nenhuma visita agendada.</td></tr>'}
    </tbody></table>
  </div>`;

  const filtrar = () => {
    const texto = ($('#agenda-busca')?.value || '').toLowerCase();
    const st = $('#agenda-status')?.value || '';
    document.querySelectorAll('#agenda-tbody tr').forEach(row => {
      if (row.querySelector('[colspan]')) return;
      row.hidden = !!((texto && !row.textContent.toLowerCase().includes(texto)) || (st && row.dataset.status !== st));
    });
  };
  $('#agenda-busca').oninput = filtrar;
  $('#agenda-status').onchange = filtrar;
  const form = $('#agenda-form');
  if (form) form.onsubmit = async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(form));
    await put('agendamentos', { ...cur, ...d, id: cur.id || uid(), criado: cur.criado || new Date().toISOString(), atualizado: new Date().toISOString() });
    location.hash = '#/agenda';
    render();
  };
}

/* ---------- vistorias ---------- */
async function vistorias() {
  const [vs, os, cls, ts] = await Promise.all([all('vistorias'), all('obras'), all('clientes'), getTipos()]);
  const om = Object.fromEntries(os.map(o => [o.id, o]));
  const cm = Object.fromEntries(cls.map(c => [c.id, c.nome]));
  const tipos = [...new Set(vs.map(v => v.tipo).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  app.innerHTML = `<h2>Vistorias</h2>
  ${os.length ? `<form id="nv" class="card grid">
    ${fieldHtml({ k: 'obraId', l: 'Imóvel/Obra', req: 1, opts: os.map(o => [o.id, `${o.nome} — ${cm[o.clienteId] || ''}`]) })}
    ${fieldHtml({ k: 'tipo', l: 'Tipo de serviço', req: 1, opts: ts.map(t => [t.nome, t.nome]) })}
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
    ${vs.sort((a, b) => (b.criado || '').localeCompare(a.criado || '')).map(v => `<tr data-status="${esc(v.status)}" data-tipo="${esc(v.tipo)}" data-data="${esc(v.data)}"><td>${esc(v.data)}${v.hora ? ' ' + esc(v.hora) : ''}</td><td>${esc(om[v.obraId]?.nome || '?')}<br><small>${esc(cm[om[v.obraId]?.clienteId] || '')}</small></td><td>${esc(v.tipo)}</td><td>${esc(v.vistoriador || '—')}</td><td>${brl(v.valor)}</td><td><span class="status-badge ${v.status === 'assinada' ? 'signed' : 'draft'}">${v.status === 'assinada' ? 'Assinada' : 'Rascunho'}</span></td>
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
    const chk = await getCheck();
    const itens = [];
    for (const [cat, arr] of Object.entries(chk)) for (const desc of arr) itens.push({ cat, desc, status: '', obs: '', fotos: [] });
    const obra = om[d.obraId];
    const tp = ts.find(t => t.nome === d.tipo);
    const pr = tp && obra ? await get('precos', `${tp.id}|${obra.tipo}`) : null;
    const v = { id: uid(), obraId: d.obraId, tipo: d.tipo, data: new Date().toISOString().slice(0, 10), hora: '', vistoriador: '', crea: '', artNumero: '', valor: pr ? pr.valor : '', orientacoes: '', itens, status: 'rascunho', criado: new Date().toISOString() };
    await put('vistorias', v);
    location.hash = `#/vistoria/${v.id}`;
  };
}

/* ---------- orçamentos ---------- */
const ORC_STATUS = ['Rascunho', 'Enviado', 'Aprovado', 'Recusado'];
const orcTotais = o => {
  const sub = (o.itens || []).reduce((n, i) => n + (Number(i.qtd) || 0) * (Number(i.valor) || 0), 0);
  const dsc = sub * (Number(o.desconto) || 0) / 100;
  const tax = sub * (Number(o.taxas) || 0) / 100;
  return { sub, dsc, tax, tot: sub - dsc + tax };
};
const orcNumero = lista => {
  const ano = new Date().getFullYear();
  const nums = lista.map(o => o.numero || '').filter(n => n.startsWith(`ORC-${ano}-`)).map(n => parseInt(n.split('-')[2], 10)).filter(n => !isNaN(n));
  return `ORC-${ano}-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(4, '0')}`;
};
const orcItemRow = (it = {}) => `<tr>
  <td><input data-of="descricao" value="${esc(it.descricao || '')}" placeholder="Descrição do item"></td>
  <td><input data-of="qtd" type="number" step="any" min="0" value="${esc(it.qtd ?? 1)}"></td>
  <td><select data-of="unidade">${UNIDADES.map(u => `<option value="${esc(u)}" ${u === (it.unidade || 'un') ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select></td>
  <td><input data-of="valor" type="number" step="any" min="0" value="${esc(it.valor ?? '')}"></td>
  <td><a href="#" data-orc-rm="1">remover</a></td>
</tr>`;

async function orcamentos(q) {
  const [os, obras, cls, ts] = await Promise.all([all('orcamentos'), all('obras'), all('clientes'), getTipos()]);
  const cm = Object.fromEntries(cls.map(c => [c.id, c.nome]));
  const om = Object.fromEntries(obras.map(o => [o.id, o]));
  const qp = new URLSearchParams(q || '');
  const cur = os.find(x => x.id === qp.get('e')) || {};
  const mostrarForm = qp.has('nova') || !!cur.id;
  const itens0 = (cur.itens && cur.itens.length) ? cur.itens : [{ descricao: '', qtd: 1, unidade: 'un', valor: '' }];
  const opObra = obras.map(o => [o.id, `${o.nome} — ${cm[o.clienteId] || 'Cliente não informado'}`]);
  app.innerHTML = `<section class="section-heading client-head"><div><h2>Orçamentos</h2><p>Propostas comerciais vinculadas a imóveis e tipos de serviço.</p></div>
    <a class="btn" href="#/orcamentos?nova=1">+ Novo orçamento</a></section>
  ${mostrarForm ? `<form id="orc-form" class="card">
    <div class="grid">
      ${fieldHtml({ k: 'obraId', l: 'Imóvel/Obra', req: 1, opts: opObra }, cur.obraId || '')}
      ${fieldHtml({ k: 'tipo', l: 'Tipo de serviço', req: 1, opts: ts.map(t => [t.nome, t.nome]) }, cur.tipo || '')}
      ${fieldHtml({ k: 'status', l: 'Status', req: 1, opts: ORC_STATUS.map(s => [s, s]) }, cur.status || 'Rascunho')}
      ${fieldHtml({ k: 'validade', l: 'Validade', type: 'date' }, cur.validade || '')}
    </div>
    <h3 style="margin-top:14px">Itens</h3>
    <div style="overflow-x:auto"><table class="orc-itens"><thead><tr><th>Descrição</th><th>Qtd.</th><th>Un.</th><th>Valor unit.</th><th></th></tr></thead><tbody id="orc-itens">
      ${itens0.map(it => orcItemRow(it)).join('')}
    </tbody></table></div>
    <div class="row"><button type="button" class="btn ghost" id="orc-add">+ Adicionar item</button></div>
    <div class="grid" style="margin-top:12px">
      ${fieldHtml({ k: 'desconto', l: 'Desconto (%)', type: 'number' }, cur.desconto ?? '')}
      ${fieldHtml({ k: 'taxas', l: 'Taxas / ISS (%)', type: 'number' }, cur.taxas ?? '')}
      ${fieldHtml({ k: 'condicoes', l: 'Condições de pagamento' }, cur.condicoes || '')}
      ${fieldHtml({ k: 'observacoes', l: 'Observações', type: 'textarea' }, cur.observacoes || '')}
    </div>
    <div class="orc-totais">
      <div><span>Subtotal</span><b id="orc-sub">—</b></div>
      <div><span>Desconto</span><b id="orc-dsc">—</b></div>
      <div><span>Taxas</span><b id="orc-tax">—</b></div>
      <div class="total"><span>Total</span><b id="orc-tot">—</b></div>
    </div>
    <div class="row"><button class="btn">${cur.id ? 'Salvar orçamento' : 'Criar orçamento'}</button><a class="btn ghost" href="#/orcamentos">Cancelar</a></div>
  </form>` : (!obras.length ? '<div class="warn">Cadastre um cliente e um imóvel/obra antes de criar um orçamento.</div>' : '')}
  <div class="card">
    <div class="list-filters">
      <input id="o-busca" placeholder="Buscar número, imóvel, cliente ou serviço…">
      <select id="o-status"><option value="">Todos os status</option>${ORC_STATUS.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}</select>
    </div>
    <table><thead><tr><th>Número</th><th>Imóvel/Cliente</th><th>Tipo</th><th>Total</th><th>Status</th><th></th></tr></thead><tbody id="o-tbody">
    ${os.sort((a, b) => (b.criado || '').localeCompare(a.criado || '')).map(o => { const obra = om[o.obraId]; const t = orcTotais(o); return `<tr data-status="${esc(o.status)}"><td><b>${esc(o.numero || '—')}</b><br><small>${esc(o.validade ? 'val. ' + o.validade : '')}</small></td><td>${esc(obra?.nome || '?')}<br><small>${esc(cm[obra?.clienteId] || '')}</small></td><td>${esc(o.tipo)}</td><td>${brl(t.tot)}</td><td><span class="status-badge orc-${esc(String(o.status || '').toLowerCase())}">${esc(o.status)}</span></td>
    <td class="act"><a href="#/orcamento/${o.id}">Ver proposta</a><a href="#/orcamentos?e=${o.id}">Editar</a><a href="#" data-del="orcamentos:${o.id}">Excluir</a></td></tr>`; }).join('') || '<tr><td colspan="6">Nenhum orçamento cadastrado.</td></tr>'}
    <tr id="o-vazio" hidden><td colspan="6">Nenhum registro corresponde aos filtros.</td></tr>
    </tbody></table>
  </div>`;
  const lerItens = () => [...document.querySelectorAll('#orc-itens tr')].map(tr => ({
    descricao: tr.querySelector('[data-of=descricao]').value.trim(),
    qtd: tr.querySelector('[data-of=qtd]').value,
    unidade: tr.querySelector('[data-of=unidade]').value,
    valor: tr.querySelector('[data-of=valor]').value
  })).filter(i => i.descricao || i.valor);
  const recalcular = () => {
    const t = orcTotais({ itens: lerItens(), desconto: $('#orc-form [name=desconto]')?.value, taxas: $('#orc-form [name=taxas]')?.value });
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = brl(v); };
    set('orc-sub', t.sub); set('orc-dsc', t.dsc); set('orc-tax', t.tax); set('orc-tot', t.tot);
  };
  const form = $('#orc-form');
  if (form) {
    $('#orc-add').onclick = () => { $('#orc-itens').insertAdjacentHTML('beforeend', orcItemRow()); recalcular(); };
    $('#orc-itens').addEventListener('click', e => { const a = e.target.closest('[data-orc-rm]'); if (!a) return; e.preventDefault(); const tr = a.closest('tr'); if ($('#orc-itens').children.length > 1) tr.remove(); else tr.querySelectorAll('input').forEach(i => i.value = ''); recalcular(); });
    form.addEventListener('input', recalcular);
    recalcular();
    form.onsubmit = async e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(form));
      const itens = lerItens();
      if (!itens.length) return alert('Adicione ao menos um item.');
      const obra = om[d.obraId];
      const o = { ...cur, ...d, itens, clienteId: obra?.clienteId || cur.clienteId || '', numero: cur.numero || orcNumero(os), id: cur.id || uid(), criado: cur.criado || new Date().toISOString(), atualizado: new Date().toISOString() };
      await put('orcamentos', o);
      location.hash = '#/orcamentos'; render();
    };
  }
  const filtrar = () => {
    const texto = ($('#o-busca')?.value || '').toLowerCase().trim();
    const st = $('#o-status')?.value || '';
    const rows = [...document.querySelectorAll('#o-tbody tr[data-status]')];
    rows.forEach(r => { let ok = true; if (texto && !r.textContent.toLowerCase().includes(texto)) ok = false; if (st && r.dataset.status !== st) ok = false; r.hidden = !ok; });
    const vis = rows.filter(r => !r.hidden).length;
    const vazio = $('#o-vazio'); if (vazio) vazio.hidden = !(rows.length > 0 && vis === 0);
  };
  const b = $('#o-busca'); if (b) b.oninput = filtrar;
  const s = $('#o-status'); if (s) s.onchange = filtrar;
}

async function orcamento(id) {
  const o = await get('orcamentos', id);
  if (!o) { app.innerHTML = '<div class="warn">Orçamento não encontrado.</div>'; return; }
  const obra = o.obraId ? await get('obras', o.obraId) : null;
  const cliente = obra ? await get('clientes', obra.clienteId) : null;
  const t = orcTotais(o);
  const statusAcoes = [['Enviado', 'Marcar como enviado'], ['Aprovado', 'Aprovar'], ['Recusado', 'Recusar']].filter(([s]) => s !== o.status).map(([s, l]) => `<a class="btn ghost" href="#" data-orc-status="${s}" data-orc-status-id="${o.id}">${l}</a>`).join('');
  app.innerHTML = `<div class="noprint row"><button class="btn" onclick="print()">Imprimir / Salvar PDF</button>${o.status === 'Aprovado' ? `<a class="btn" href="#/agenda?nova=1&obraId=${encodeURIComponent(o.obraId || '')}&tipo=${encodeURIComponent(o.tipo || '')}">Agendar visita</a>` : ''}<a class="btn ghost" href="#/orcamentos">Voltar</a><a class="btn ghost" href="#/orcamentos?e=${o.id}">Editar</a>${statusAcoes}</div>
  ${o.status === 'Aprovado' ? '<div class="ok">Orçamento aprovado. Agende a visita para iniciar a vistoria.</div>' : ''}
  <div class="card laudo proposta">
    <img class="laudo-logo" src="logo.png" alt="VISTORI ENGENHARIA">
    <div class="proposta-head"><div><h1>Proposta Comercial</h1><p>${esc(o.numero || '')} · ${esc(o.status || '')}</p></div><div class="proposta-val"><small>Validade</small><b>${o.validade ? esc(dataBR(o.validade)) : '—'}</b></div></div>
    <p><b>Cliente:</b> ${esc(cliente?.nome || '—')} ${esc(cliente?.documento || '')}<br><b>Imóvel/Obra:</b> ${esc(obra?.nome || '—')} — ${esc(obra?.endereco || '')} ${esc(obra?.cidade || '')}${obra?.uf ? '/' + esc(obra.uf) : ''}<br><b>Serviço:</b> ${esc(o.tipo || '—')}</p>
    <table class="orc-proposta"><thead><tr><th>Descrição</th><th>Qtd.</th><th>Un.</th><th>Valor unit.</th><th>Total</th></tr></thead><tbody>
      ${(o.itens || []).map(i => `<tr><td>${esc(i.descricao)}</td><td>${esc(i.qtd)}</td><td>${esc(i.unidade)}</td><td>${brl(i.valor)}</td><td>${brl((Number(i.qtd) || 0) * (Number(i.valor) || 0))}</td></tr>`).join('') || '<tr><td colspan="5">Sem itens.</td></tr>'}
    </tbody></table>
    <div class="orc-totais">
      <div><span>Subtotal</span><b>${brl(t.sub)}</b></div>
      <div><span>Desconto (${esc(o.desconto || 0)}%)</span><b>${brl(t.dsc)}</b></div>
      <div><span>Taxas (${esc(o.taxas || 0)}%)</span><b>${brl(t.tax)}</b></div>
      <div class="total"><span>Total</span><b>${brl(t.tot)}</b></div>
    </div>
    ${o.condicoes ? `<p><b>Condições de pagamento:</b> ${esc(o.condicoes)}</p>` : ''}
    ${o.observacoes ? `<p><b>Observações:</b> ${esc(o.observacoes)}</p>` : ''}
  </div>`;
}

const hf = (v, k, l, type = 'text') => `<div><label>${l}</label><input type="${type}" ${type === 'number' ? 'step="any" min="0"' : ''} data-h="${k}" value="${esc(v[k])}"></div>`;

function sigPad(c) {
  const x = c.getContext('2d');
  x.lineWidth = 2.5; x.lineCap = 'round'; x.strokeStyle = '#000';
  let d = false, empty = true;
  const p = e => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * c.width / r.width, (e.clientY - r.top) * c.height / r.height]; };
  c.onpointerdown = e => { d = true; empty = false; const [a, b] = p(e); x.beginPath(); x.moveTo(a, b); c.setPointerCapture(e.pointerId); };
  c.onpointermove = e => { if (!d) return; const [a, b] = p(e); x.lineTo(a, b); x.stroke(); };
  c.onpointerup = () => { d = false; };
  return { isEmpty: () => empty, clear: () => { x.clearRect(0, 0, c.width, c.height); empty = true; } };
}

async function vistoria(id) {
  const v = await get('vistorias', id);
  if (!v) { app.innerHTML = '<div class="warn">Vistoria não encontrada.</div>'; return; }
  curV = v;
  const [obra, fm] = await Promise.all([get('obras', v.obraId), fotosMap(v)]);
  const cli = obra ? await get('clientes', obra.clienteId) : null;
  const locked = v.status === 'assinada';
  let last = '';
  const itens = v.itens.map((it, i) => {
    const hd = it.cat !== last ? `<h3>${esc(it.cat)}</h3>` : '';
    last = it.cat;
    return `${hd}<div class="item"><h4>${esc(it.desc)}</h4>
    <select data-i="${i}" data-f="status">${Object.entries(ST).map(([k, l]) => `<option value="${k}" ${it.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <textarea data-i="${i}" data-f="obs" placeholder="Observações / descrição da anomalia">${esc(it.obs)}</textarea>
    <div class="fotos">${it.fotos.map((f, j) => `<div class="foto"><img src="${f.src || fm[f.id] || ''}" alt=""><input data-i="${i}" data-j="${j}" data-f="legenda" placeholder="Legenda" value="${esc(f.legenda)}"><a href="#" data-rm="${i}:${j}">remover</a></div>`).join('')}</div>
    <label>+ Foto</label><input type="file" accept="image/*" multiple data-photo="${i}"></div>`;
  }).join('');
  app.innerHTML = `<h2>Vistoria — ${esc(obra?.nome)}</h2>
  <p>${esc(cli?.nome)} · ${esc(v.tipo)}${v.hora ? ' · ' + esc(v.hora) : ''} · <a href="#/laudo/${v.id}">Ver laudo</a></p>
  ${locked ? `<div class="warn">Assinada em ${fmt(v.assinatura.ts)}. <a href="#" data-reopen="1">Reabrir (apaga a assinatura)</a></div>` : ''}
  <fieldset ${locked ? 'disabled' : ''} style="border:0;padding:0;margin:0">
    <div class="card grid">${hf(v, 'data', 'Data', 'date')}${hf(v, 'hora', 'Horário', 'time')}${hf(v, 'vistoriador', 'Responsável técnico')}${hf(v, 'crea', 'CREA / UF')}${hf(v, 'artNumero', 'Nº da ART (emitida no CREA)')}${hf(v, 'valor', 'Valor do serviço (R$)', 'number')}<div><label>Orientações / contato no local</label><textarea data-h="orientacoes">${esc(v.orientacoes)}</textarea></div></div>
    <div class="card">${itens || 'Checklist vazio. Edite em Checklist.'}</div>
    ${locked ? '' : `<div class="card"><h3>Finalizar e assinar</h3>
      <label>Nome do responsável</label><input id="signNome" value="${esc(v.vistoriador)}">
      <label>Assinatura</label><canvas id="sig" width="840" height="300"></canvas>
      <div class="row"><button type="button" class="btn ghost" id="clr">Limpar</button><button type="button" class="btn" id="sign">Assinar e gerar laudo</button></div></div>`}
  </fieldset>`;
  const c = $('#sig'); if (c) pad = sigPad(c);
}

/* ---------- laudo ---------- */
async function laudo(id) {
  const v = await get('vistorias', id);
  if (!v) { app.innerHTML = '<div class="warn">Laudo não encontrado.</div>'; return; }
  const [obra, fm] = await Promise.all([get('obras', v.obraId), fotosMap(v)]);
  const cli = obra ? await get('clientes', obra.clienteId) : null;
  const nc = v.itens.filter(i => i.status === 'N');
  let last = '';
  app.innerHTML = `<div class="noprint row"><button class="btn" onclick="print()">Imprimir / Salvar PDF</button><a class="btn ghost" href="#/vistoria/${v.id}">Voltar à vistoria</a>${v.assinatura ? `<button class="btn ghost" id="verif" data-id="${v.id}">Verificar integridade</button>` : ''}</div>
  <div class="card laudo">
    <img class="laudo-logo" src="logo.png" alt="VISTORI ENGENHARIA">
    <h1>Laudo de Vistoria — ${esc(v.tipo)}</h1>
    ${v.status !== 'assinada' ? '<div class="warn">RASCUNHO — não assinado.</div>' : ''}
    <p><b>Cliente:</b> ${esc(cli?.nome)} ${esc(cli?.documento)}<br><b>Imóvel/Obra:</b> ${esc(obra?.nome)} — ${esc(obra?.endereco)} ${esc(obra?.cidade)}${obra?.uf ? '/' + esc(obra.uf) : ''}<br>
    <b>Data:</b> ${esc(v.data)}${v.hora ? ' às ' + esc(v.hora) : ''}<br><b>Responsável técnico:</b> ${esc(v.vistoriador)} — CREA ${esc(v.crea)}<br><b>ART nº:</b> ${esc(v.artNumero) || 'não informada'}</p>
    ${v.orientacoes ? `<p><b>Orientações:</b> ${esc(v.orientacoes)}</p>` : ''}
    <p><b>Resumo:</b> ${v.itens.length} itens analisados, ${nc.length} não conforme(s).</p>
    ${v.itens.map(it => {
      const hd = it.cat !== last ? `<h3>${esc(it.cat)}</h3>` : ''; last = it.cat;
      return `${hd}<div class="item"><b>${esc(it.desc)}</b> — <span class="st-${it.status}">${ST[it.status]}</span>${it.obs ? `<br>${esc(it.obs)}` : ''}
      <div class="fotos">${it.fotos.map(f => `<div class="foto"><img src="${f.src || fm[f.id] || ''}" alt=""><small>${esc(f.legenda)}</small></div>`).join('')}</div></div>`;
    }).join('')}
    ${v.assinatura ? `<h3>Assinatura</h3><img src="${v.assinatura.img}" alt="assinatura" style="max-width:300px;border-bottom:1px solid #000"><br>
    ${esc(v.assinatura.nome)} — ${fmt(v.assinatura.ts)}<br><small>Integridade (SHA-256):</small><div class="hash">${v.assinatura.hash}</div>` : ''}
  </div>`;
}

/* ---------- checklist e backup ---------- */
async function checklist() {
  const chk = await getCheck();
  app.innerHTML = `<h2>Checklist padrão</h2><div class="card"><p>Use <code>## Categoria</code> e, abaixo, um item por linha. Vale para as <b>próximas</b> vistorias.</p>
  <textarea id="ck" style="min-height:360px">${esc(toText(chk))}</textarea>
  <div class="row"><button class="btn" id="ckS">Salvar</button><button class="btn ghost" id="ckR">Restaurar padrão</button></div></div>`;
  $('#ckS').onclick = async () => { await put('config', { id: 'checklist', data: parseCheck($('#ck').value) }); alert('Salvo.'); };
  $('#ckR').onclick = async () => { await del('config', 'checklist'); render(); };
}

async function backup() {
  const nuvem = MODO !== 'local';
  app.innerHTML = `<h2>Backup</h2>
  ${nuvem ? '<div class="ok">Seus dados já estão na nuvem. Mesmo assim, exporte um backup de vez em quando: é a sua cópia fora do Firebase.</div>' : '<div class="warn">Os dados ficam só neste aparelho/navegador. Exporte com frequência.</div>'}
  ${await bannerMigracao()}
  <div class="card"><button class="btn" id="exp">Exportar backup (.json)</button>
  <label>Restaurar backup (${nuvem ? 'APAGA e substitui os dados da nuvem' : 'substitui tudo'})</label><input type="file" id="imp" accept=".json"></div>`;
  $('#exp').onclick = async () => {
    const d = { versao: VERSION, quando: new Date().toISOString() };
    for (const s of STORES) d[s] = await all(s);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(d)], { type: 'application/json' }));
    a.download = `vistori-backup-${d.quando.slice(0, 10)}.json`;
    a.click();
  };
  $('#imp').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    let d; try { d = JSON.parse(await f.text()); } catch { return alert('Arquivo inválido.'); }
    if (nuvem && !navigator.onLine) return alert('Conecte-se à internet para restaurar na nuvem.');
    const ok = nuvem ? prompt('Isso APAGA TODOS os dados da nuvem e restaura o arquivo. Digite SUBSTITUIR para continuar.') === 'SUBSTITUIR'
      : confirm('Isso SUBSTITUI todos os dados atuais. Continuar?');
    if (!ok) return;
    for (const s of STORES) { for (const x of await all(s)) await del(s, x.id); for (const x of d[s] || []) await put(s, x, nuvem); }
    alert('Restaurado.'); location.hash = '#/'; render();
  };
}

/* ---------- eventos globais ---------- */
app.addEventListener('change', async e => {
  const t = e.target;
  if (t.dataset.p !== undefined) {
    const [tipoId, tipoObra] = t.dataset.p.split('|');
    if (t.value === '') await del('precos', t.dataset.p);
    else {
      const valor = parseFloat(t.value);
      if (isNaN(valor) || valor < 0) { alert('Informe um valor válido.'); return; }
      await put('precos', { id: t.dataset.p, tipoId, tipoObra, valor });
    }
    return;
  }
  if (!curV) return;
  if (t.dataset.h) { curV[t.dataset.h] = t.value; await put('vistorias', curV); }
  else if (t.dataset.f) {
    const it = curV.itens[+t.dataset.i];
    if (t.dataset.f === 'legenda') it.fotos[+t.dataset.j].legenda = t.value; else it[t.dataset.f] = t.value;
    await put('vistorias', curV);
  } else if (t.dataset.photo !== undefined) {
    const it = curV.itens[+t.dataset.photo];
    for (const f of t.files) {
      const id = uid();
      await put('fotos', { id, vistoriaId: curV.id, src: await comprimir(f) });
      it.fotos.push({ id, legenda: '' });
    }
    await put('vistorias', curV);
    const y = scrollY; await vistoria(curV.id); scrollTo(0, y);
  }
});

document.addEventListener('click', async e => {
  const a = e.target.closest('a,button'); if (!a) return;
  const d = a.dataset;
  if (d.del) {
    e.preventDefault();
    const [s, id] = d.del.split(':');
    if (s === 'clientes' && (await all('obras')).some(o => o.clienteId === id)) return alert('Este cliente tem imóveis/obras vinculados.');
    if (s === 'obras' && (await all('vistorias')).some(v => v.obraId === id)) return alert('Este imóvel/obra tem vistorias vinculadas.');
    if (s === 'tipos') {
      const t = await get('tipos', id);
      if ((await all('vistorias')).some(v => v.tipo === t?.nome)) return alert('Este tipo de serviço já foi usado em vistorias.');
    }
    if (confirm('Excluir definitivamente?')) {
      if (s === 'vistorias') {
        const v = await get('vistorias', id);
        for (const it of v?.itens || []) for (const f of it.fotos || []) if (f.id) await del('fotos', f.id);
      }
      await del(s, id);
      if (s === 'tipos') for (const p of await all('precos')) if (p.tipoId === id) await del('precos', p.id);
      render();
    }
  } else if (d.rm) {
    e.preventDefault();
    const [i, j] = d.rm.split(':').map(Number);
    const f = curV.itens[i].fotos[j];
    if (f.id) await del('fotos', f.id);
    curV.itens[i].fotos.splice(j, 1); await put('vistorias', curV);
    const y = scrollY; await vistoria(curV.id); scrollTo(0, y);
  } else if (d.agendaIniciar) {
    e.preventDefault();
    const agendamento = await get('agendamentos', d.agendaIniciar);
    if (!agendamento) return alert('Agendamento não encontrado.');
    if (agendamento.vistoriaId) { location.hash = `#/vistoria/${agendamento.vistoriaId}`; return; }
    try {
      const v = await novaVistoriaDaAgenda(agendamento);
      location.hash = `#/vistoria/${v.id}`;
    } catch (err) { alert(err.message); }
  } else if (d.orcStatus) {
    e.preventDefault();
    const o = await get('orcamentos', d.orcStatusId);
    if (!o) return;
    await put('orcamentos', { ...o, status: d.orcStatus, atualizado: new Date().toISOString() });
    render();
  } else if (d.reopen) {
    e.preventDefault();
    delete curV.assinatura; curV.status = 'rascunho'; await put('vistorias', curV); vistoria(curV.id);
  } else if (a.id === 'clr') { pad.clear(); }
  else if (a.id === 'sair') { e.preventDefault(); await F.signOut(auth); }
  else if (a.id === 'migrar') {
    if (!navigator.onLine) return alert('Conecte-se à internet para enviar os dados.');
    if (!confirm('Enviar os dados deste aparelho para a nuvem agora?')) return;
    a.disabled = true;
    try { const n = await migrarLocal(k => { a.textContent = `Enviando… ${k}`; }); alert(`${n} registro(s) enviados para a nuvem.`); }
    catch (err) { alert('Falha ao enviar: ' + err.message + '\nPode tentar de novo; nada foi apagado.'); }
    render();
  } else if (a.id === 'verif') {
    const v = await get('vistorias', d.id);
    if (!v.assinatura.fotosSha) return alert('Assinatura feita antes da v0.3.0: a verificação automática não está disponível para este laudo.');
    const ok = (await calcHash(v, v.assinatura.ts)) === v.assinatura.hash;
    alert(ok ? 'ÍNTEGRO: o conteúdo (textos e fotos) é idêntico ao que foi assinado.' : 'ALTERADO: o conteúdo atual é diferente do que foi assinado.');
  } else if (a.id === 'sign') {
    const nome = $('#signNome').value.trim() || (curV.vistoriador || '').trim();
    if (!nome || pad.isEmpty()) return alert('Informe o nome e assine no quadro.');
    const pend = curV.itens.filter(i => !i.status).length;
    if (pend && !confirm(`${pend} item(ns) sem avaliação. Assinar assim mesmo?`)) return;
    if (!curV.artNumero && !confirm('Nº da ART não informado. Assinar assim mesmo?')) return;
    const ts = new Date().toISOString();
    const hash = await calcHash(curV, ts);
    curV.assinatura = { nome, img: $('#sig').toDataURL('image/png'), ts, hash, fotosSha: await fotosSha(curV) };
    curV.status = 'assinada';
    await put('vistorias', curV);
    location.hash = `#/laudo/${curV.id}`;
  }
});

/* ---------- login e inicialização ---------- */
function userBox() {
  const el = $('#userbox'); if (!el) return;
  const sync = $('#syncbox');
  const banner = $('#offline-banner');
  const online = navigator.onLine;
  if (sync) {
    sync.classList.toggle('offline', !online);
    sync.classList.toggle('local', MODO === 'local');
    sync.textContent = MODO === 'local' ? 'Modo local' : online ? 'Sincronizado' : 'Offline';
  }
  if (banner) banner.hidden = MODO === 'local' || online;
  el.innerHTML = MODO === 'local' ? '<span class="tag">Ambiente de teste</span>'
    : USER ? `<small>${esc(USER.email)}</small>${MODO === 'nuvem' ? '<a href="#" id="sair">Sair</a>' : ''}` : '';
}
addEventListener('online', userBox);
addEventListener('offline', userBox);

/* ---------- adaptação da interface a telas menores ---------- */
const nav = $('#nav');
const navToggle = $('#nav-toggle');
const sidebar = $('#sidebar');
const navBackdrop = $('#nav-backdrop');
const sidebarToggle = $('#sidebar-toggle');
document.body.classList.toggle('sidebar-collapsed', localStorage.getItem('vistori_menu_recolhido') === '1');
function closeNav() {
  sidebar.classList.remove('open');
  document.body.classList.remove('nav-open');
  navToggle.setAttribute('aria-expanded', 'false');
  navToggle.setAttribute('aria-label', 'Abrir menu');
}
navToggle.addEventListener('click', () => {
  const open = sidebar.classList.toggle('open');
  document.body.classList.toggle('nav-open', open);
  navToggle.setAttribute('aria-expanded', String(open));
  navToggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
});
nav.addEventListener('click', e => { if (e.target.closest('a')) closeNav(); });
navBackdrop.addEventListener('click', closeNav);
sidebarToggle.addEventListener('click', () => {
  const collapsed = document.body.classList.toggle('sidebar-collapsed');
  localStorage.setItem('vistori_menu_recolhido', collapsed ? '1' : '0');
  sidebarToggle.setAttribute('aria-label', collapsed ? 'Expandir menu' : 'Recolher menu');
});
addEventListener('resize', () => { if (innerWidth > 900) closeNav(); });

function responsiveTables() {
  app.querySelectorAll('table:not(.matrix-table)').forEach(table => {
    table.classList.add('responsive-table');
    const labels = [...table.querySelectorAll('thead th')].map(th => th.textContent.trim() || 'Ações');
    table.querySelectorAll('tbody tr').forEach(row => {
      [...row.cells].forEach((cell, i) => {
        if (!cell.hasAttribute('colspan')) cell.dataset.label = labels[i] || 'Ações';
      });
    });
  });
}

const msgAuth = err => ({
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/wrong-password': 'E-mail ou senha incorretos.',
  'auth/user-not-found': 'E-mail ou senha incorretos.',
  'auth/invalid-email': 'E-mail inválido.',
  'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
  'auth/network-request-failed': 'Sem conexão com a internet.',
  'auth/user-disabled': 'Este usuário foi desativado.'
}[err.code] || 'Não foi possível entrar (' + (err.code || err.message) + ').');

function mostrarLogin() {
  document.body.classList.add('deslogado');
  const conectado = navigator.onLine;
  app.innerHTML = `<div class="login-layout">
    <section class="login-showcase" aria-label="Apresentação do sistema">
      <div class="login-brand"><img src="logo-emblema.png" alt=""><span><b>VISTORI</b><i>ENGENHARIA</i></span></div>
      <div class="login-copy"><h1>Vistorias, laudos e obras organizados do campo ao escritório.</h1>
      <p>Checklists que funcionam sem internet, fotos organizadas e laudos com verificação de integridade.</p></div>
      <div class="login-feature"><span>VI</span><div><b>Trabalho de campo sem interrupções</b><small>Os registros ficam salvos no aparelho e sincronizam quando a conexão voltar.</small></div></div>
      <small class="login-version">v${VERSION} · ambiente seguro</small>
    </section>
    <section class="login-panel">
      <div class="login-form-wrap">
        <div class="login-mobile-brand"><img src="logo-emblema.png" alt=""><b>VISTORI</b></div>
        <div><h2>Entrar</h2><p>Acesse com o e-mail cadastrado pela sua empresa.</p></div>
        <div class="login-error" id="lerr" role="alert" aria-live="polite" hidden></div>
        <form id="lf" class="login-form">
          <label for="login-email">E-mail</label><input id="login-email" type="email" name="email" required autocomplete="username">
          <label for="login-senha">Senha</label><input id="login-senha" type="password" name="senha" required autocomplete="current-password">
          <div class="login-options"><label class="check-label"><input type="checkbox" checked> Manter conectado neste aparelho</label><a href="#" id="esqueci">Esqueci minha senha</a></div>
          <button class="btn login-submit" id="loginBtn">Entrar</button>
        </form>
        <div class="login-network ${conectado ? '' : 'offline'}"><span></span><div><b>${conectado ? 'Conectado' : 'Sem conexão'}</b><small>Vistorias baixadas neste aparelho podem ser preenchidas offline e sincronizadas depois.</small></div></div>
      </div>
    </section>
  </div>`;
  const erro = m => { const x = $('#lerr'); x.textContent = m; x.hidden = false; };
  $('#lf').onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const btn = $('#loginBtn'); btn.disabled = true; btn.textContent = 'Entrando…';
    try { await F.signInWithEmailAndPassword(auth, fd.get('email').trim(), fd.get('senha')); }
    catch (err) { erro(msgAuth(err)); btn.disabled = false; btn.textContent = 'Entrar'; }
  };
  $('#esqueci').onclick = async e => {
    e.preventDefault();
    const em = $('#lf').elements.email.value.trim();
    if (!em) return erro('Digite seu e-mail no campo acima e clique de novo.');
    try { await F.sendPasswordResetEmail(auth, em); alert('Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.'); }
    catch (err) { erro(msgAuth(err)); }
  };
}

async function carregarSDK() {
  let ultimo;
  for (const v of SDK_VERSIONS) {
    try {
      const base = `https://www.gstatic.com/firebasejs/${v}/`;
      const [a, au, fi] = await Promise.all([import(base + 'firebase-app.js'), import(base + 'firebase-auth.js'), import(base + 'firebase-firestore.js')]);
      return { ...a, ...au, ...fi };
    } catch (e) { ultimo = e; console.warn('SDK', v, 'falhou', e); }
  }
  throw ultimo;
}

async function boot() {
  $('#ver').textContent = 'v' + VERSION;
  $('#ver2').textContent = 'v' + VERSION;
  if (MODO === 'local') { B = L; userBox(); render(); return; }
  let fs;
  try {
    F = await carregarSDK();
    const cfg = (await import('./firebase-config.js')).default;
    const fapp = F.initializeApp(cfg);
    auth = F.getAuth(fapp);
    fs = F.initializeFirestore(fapp, {
      localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }),
      ignoreUndefinedProperties: true
    });
  } catch (err) {
    document.body.classList.add('deslogado');
    app.innerHTML = `<div class="warn"><b>Não foi possível carregar o Firebase.</b><br>Verifique a internet (no primeiro acesso ela é necessária).<br><small>${esc(err.message)}</small></div>`;
    return;
  }
  const nuvem = makeCloud(F, fs);
  if (MODO === 'nuvem-teste') { USER = { email: 'teste@local', uid: 'teste' }; B = nuvem; userBox(); render(); return; }
  F.onAuthStateChanged(auth, user => {
    USER = user;
    userBox();
    if (user) { document.body.classList.remove('deslogado'); B = nuvem; render(); }
    else { B = null; mostrarLogin(); }
  });
}

/* ---------- roteador ---------- */
async function render() {
  if (!B) return;
  curV = null; pad = null;
  const [path, q] = (location.hash.slice(2) || '').split('?');
  const [r, arg] = path.split('/');
  const navKey = ['clientes', 'obras'].includes(r) ? r : CAD.includes(r) ? 'cadastros' : r === 'vistoria' || r === 'laudo' ? 'vistorias' : r === 'cliente' ? 'clientes' : r === 'orcamento' ? 'orcamentos' : r;
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === `#/${navKey}`));
  const titles = { '': 'Visão geral', agenda: 'Agenda', cadastros: 'Cadastros', clientes: 'Clientes', cliente: 'Ficha do cliente', obras: 'Imóveis e obras', fornecedores: 'Fornecedores', tipos: 'Tipos de serviço', catalogo: 'Catálogo de itens', precos: 'Tabela de preços', vistorias: 'Vistorias', vistoria: 'Detalhe da vistoria', laudo: 'Laudo técnico', orcamentos: 'Orçamentos', orcamento: 'Proposta comercial', checklist: 'Checklist padrão', backup: 'Backup' };
  $('#page-title').textContent = titles[r] || 'Visão geral';
  closeNav();
  const R = { '': inicio, agenda, cadastros, clientes, cliente: () => cliente(arg), obras, fornecedores, tipos: tiposServico, catalogo, precos, vistorias, vistoria: () => vistoria(arg), laudo: () => laudo(arg), orcamentos, orcamento: () => orcamento(arg), checklist, backup };
  try { await (R[r] || inicio)(q); responsiveTables(); }
  catch (err) {
    console.error(err);
    app.innerHTML = err.code === 'permission-denied'
      ? '<div class="warn"><b>Sem permissão.</b> Este e-mail não está autorizado nas regras do Firestore. Peça ao administrador para incluí-lo em <code>firestore.rules</code>.</div>'
      : `<div class="warn">Erro: ${esc(err.message)}</div>`;
  }
}
addEventListener('hashchange', render);
boot();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
