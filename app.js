'use strict';
const VERSION = '0.10.0';
/* Modos: 'nuvem' (padrão: Firebase + login) | 'local' (só este aparelho, para testes)
   | 'nuvem-teste' (Firebase sem tela de login; só para testes — as regras do Firestore continuam valendo). */
const AMBIENTE_LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname)
  || (location.hostname === 'san-conecta.github.io' && location.pathname.startsWith('/VISTORI-ENGENHARIA-DEV/'));
const MODO = AMBIENTE_LOCAL ? 'local' : (localStorage.getItem('vistori_modo') || 'nuvem');
const SDK_VERSIONS = ['11.10.0', '10.14.1'];
const STORES = ['clientes', 'obras', 'vistorias', 'agendamentos', 'orcamentos', 'recebimentos', 'acessos', 'config', 'fornecedores', 'tipos', 'catalogo', 'precos', 'fotos'];
const STORES_DADOS = ['clientes', 'obras', 'vistorias', 'agendamentos', 'orcamentos', 'recebimentos', 'fornecedores', 'catalogo', 'precos'];
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
  const r = indexedDB.open('vistori', 7);
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
  for (const s of ['clientes', 'obras', 'agendamentos', 'orcamentos', 'recebimentos', 'fornecedores', 'tipos', 'catalogo', 'precos', 'config']) for (const x of await L.all(s)) { await B.put(s, x, true); passo(); }
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
  const [c, o, v, ag, recs] = await Promise.all([all('clientes'), all('obras'), all('vistorias'), all('agendamentos'), all('recebimentos')]);
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
  const base = new Date(); base.setHours(0, 0, 0, 0);
  const semanas = [];
  for (let k = 4; k >= 0; k--) { const fim = new Date(base); fim.setDate(fim.getDate() - k * 7); fim.setHours(23, 59, 59, 999); const ini = new Date(fim); ini.setDate(ini.getDate() - 6); ini.setHours(0, 0, 0, 0); semanas.push({ ini, fim, label: ini.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) }); }
  const vSem = semanas.map(s => v.filter(x => { const d = x.data ? new Date(x.data + 'T12:00:00') : new Date(x.criado || 0); return d >= s.ini && d <= s.fim; }).length);
  const meses = [];
  for (let k = 5; k >= 0; k--) { const d = new Date(base.getFullYear(), base.getMonth() - k, 1); meses.push({ y: d.getFullYear(), m: d.getMonth(), label: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '') }); }
  const prevMes = meses.map(x => recs.filter(r => { const d = r.vencimento ? new Date(r.vencimento + 'T12:00:00') : new Date(r.criado || 0); return d.getFullYear() === x.y && d.getMonth() === x.m; }).reduce((n, r) => n + (Number(r.valor) || 0), 0));
  const recMes = meses.map(x => recs.filter(r => r.status === 'Recebido' && r.pagoEm && new Date(r.pagoEm).getFullYear() === x.y && new Date(r.pagoEm).getMonth() === x.m).reduce((n, r) => n + (Number(r.valor) || 0), 0));
  const maxV = Math.max(1, ...vSem);
  const maxR = Math.max(1, ...prevMes, ...recMes);
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
  </section>
  <section class="dashboard-grid">
    <div class="card">
      <div class="section-heading"><div><h3>Vistorias por semana</h3><p>Últimas 5 semanas.</p></div><a href="#/vistorias">Ver vistorias →</a></div>
      <div class="chart" role="img" aria-label="Vistorias por semana">${semanas.map((s, i) => `<div class="chart-col"><div class="bars"><span class="bar" style="height:${Math.round(vSem[i] / maxV * 100)}%" title="${vSem[i]} vistoria(s)"></span></div><b>${vSem[i]}</b><small>${s.label}</small></div>`).join('')}</div>
    </div>
    <aside class="card">
      <div class="section-heading"><div><h3>Receita prevista × recebida</h3><p>Últimos 6 meses.</p></div><a href="#/financeiro">Ver financeiro →</a></div>
      <div class="chart" role="img" aria-label="Receita prevista e recebida por mês">${meses.map((x, i) => `<div class="chart-col"><div class="bars"><span class="bar" style="height:${Math.round(prevMes[i] / maxR * 100)}%" title="Prevista ${brl(prevMes[i])}"></span><span class="bar alt" style="height:${Math.round(recMes[i] / maxR * 100)}%" title="Recebida ${brl(recMes[i])}"></span></div><small>${x.label}</small></div>`).join('')}</div>
      <div class="chart-legend"><span><i class="lg-prev"></i>Prevista</span><span><i class="lg-rec"></i>Recebida</span></div>
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
  const verCal = qp.get('v') === 'cal';
  const profs = [...new Set(ags.map(a => a.responsavel).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const profSel = qp.get('prof') || '';
  const mesAtual = qp.get('mes') || hoje.slice(0, 7);
  const [anoMes, mmMes] = mesAtual.split('-').map(Number);
  const primeiroDia = new Date(anoMes, mmMes - 1, 1);
  const inicioGrid = new Date(primeiroDia); inicioGrid.setDate(1 - primeiroDia.getDay());
  const diasCal = [];
  for (let i = 0; i < 42; i++) { const d = new Date(inicioGrid); d.setDate(inicioGrid.getDate() + i); diasCal.push(d); }
  const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const nomeMes = primeiroDia.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const prevMes = (() => { const d = new Date(anoMes, mmMes - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })();
  const nextMes = (() => { const d = new Date(anoMes, mmMes, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })();
  const linkCal = (mes, prof) => `#/agenda?v=cal&mes=${mes}${prof ? '&prof=' + encodeURIComponent(prof) : ''}`;
  const opProf = `<option value="">Todos os profissionais</option>${profs.map(p => `<option value="${esc(p)}" ${p === profSel ? 'selected' : ''}>${esc(p)}</option>`).join('')}`;
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
  ${verCal ? `<div class="card">
    <div class="calendar-head">
      <a class="btn ghost" href="${linkCal(prevMes, profSel)}" aria-label="Mês anterior">‹</a>
      <b>${nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1)}</b>
      <a class="btn ghost" href="${linkCal(nextMes, profSel)}" aria-label="Próximo mês">›</a>
      <a class="btn ghost" href="#/agenda${profSel ? '?prof=' + encodeURIComponent(profSel) : ''}">Ver lista</a>
    </div>
    <div class="list-filters"><select id="agenda-prof">${opProf}</select></div>
    <div class="calendar-wrap"><div class="calendar-grid">
      ${['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => `<div class="cal-dow">${d}</div>`).join('')}
      ${diasCal.map(d => { const k = ymd(d); const evs = ags.filter(a => a.data === k && (!profSel || a.responsavel === profSel)); const outro = d.getMonth() !== mmMes - 1; return `<div class="cal-day ${outro ? 'out' : ''} ${k === hoje ? 'today' : ''}"><a class="cal-num" href="#/agenda?nova=1&data=${k}" title="Agendar em ${dataBR(k)}">${d.getDate()}</a>${evs.slice(0, 3).map(e => `<a class="cal-ev st-${esc((e.status || '').toLowerCase().replace(/\s+/g, '-'))}" href="#/agenda?e=${encodeURIComponent(e.id)}" title="${esc(e.hora || '')} ${esc(e.tipo || '')}">${esc(e.hora || '')} ${esc(om[e.obraId]?.nome || '')}</a>`).join('')}${evs.length > 3 ? `<small class="cal-more">+${evs.length - 3}</small>` : ''}</div>`; }).join('')}
    </div></div>
  </div>` : `<div class="card agenda-list">
    <div class="list-filters"><input id="agenda-busca" placeholder="Buscar cliente, imóvel, serviço ou responsável…"><select id="agenda-status"><option value="">Todos os status</option>${status.map(x => `<option>${x}</option>`).join('')}</select><select id="agenda-prof">${opProf}</select><a class="btn ghost" href="${linkCal(mesAtual, profSel)}">Calendário</a></div>
    <table><thead><tr><th>Data</th><th>Imóvel/Cliente</th><th>Serviço</th><th>Responsável</th><th>Status</th><th></th></tr></thead><tbody id="agenda-tbody">
    ${ordenados.map(x => { const obra = om[x.obraId]; return `<tr data-status="${esc(x.status)}" data-resp="${esc(x.responsavel || '')}"><td><b>${dataBR(x.data)}</b><br><small>${esc(x.hora)}</small></td><td>${esc(obra?.nome || 'Não encontrado')}<br><small>${esc(cm[obra?.clienteId] || '')}</small></td><td>${esc(x.tipo)}</td><td>${esc(x.responsavel || '—')}</td><td><span class="status-badge agenda-${esc((x.status || '').toLowerCase().replace(/\s+/g, '-'))}">${esc(x.status)}</span></td><td class="act"><a href="#/agenda?e=${encodeURIComponent(x.id)}">Editar</a>${x.vistoriaId ? `<a href="#/vistoria/${encodeURIComponent(x.vistoriaId)}">Abrir vistoria</a>` : x.status !== 'Cancelada' ? `<a href="#" data-agenda-iniciar="${esc(x.id)}">Iniciar vistoria</a>` : ''}<a href="#" data-del="agendamentos:${esc(x.id)}">Excluir</a></td></tr>`; }).join('') || '<tr><td colspan="6">Nenhuma visita agendada.</td></tr>'}
    </tbody></table>
  </div>`}`;

  const filtrar = () => {
    const texto = ($('#agenda-busca')?.value || '').toLowerCase();
    const st = $('#agenda-status')?.value || '';
    const prof = $('#agenda-prof')?.value || '';
    document.querySelectorAll('#agenda-tbody tr').forEach(row => {
      if (row.querySelector('[colspan]')) return;
      row.hidden = !!((texto && !row.textContent.toLowerCase().includes(texto)) || (st && row.dataset.status !== st) || (prof && row.dataset.resp !== prof));
    });
  };
  const buscaEl = $('#agenda-busca'); if (buscaEl) buscaEl.oninput = filtrar;
  const statusEl = $('#agenda-status'); if (statusEl) statusEl.onchange = filtrar;
  const profEl = $('#agenda-prof');
  if (profEl) profEl.onchange = () => {
    if (verCal) location.hash = `#/agenda?v=cal&mes=${mesAtual}${profEl.value ? '&prof=' + encodeURIComponent(profEl.value) : ''}`;
    else filtrar();
  };
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
  app.innerHTML = `<div class="noprint row"><button class="btn" onclick="print()">Imprimir / Salvar PDF</button>${o.status === 'Aprovado' ? `<a class="btn" href="#/agenda?nova=1&obraId=${encodeURIComponent(o.obraId || '')}&tipo=${encodeURIComponent(o.tipo || '')}">Agendar visita</a>` : ''}<button type="button" class="btn" id="orc-enviar">Enviar ao cliente</button><button type="button" class="btn ghost" id="orc-copiar">Copiar link</button><a class="btn ghost" href="#/orcamentos">Voltar</a><a class="btn ghost" href="#/orcamentos?e=${o.id}">Editar</a>${statusAcoes}</div>
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
  </div>
  <div class="card noprint">
    <div class="section-heading"><div><h3>Aprovação do cliente</h3><p>Registre a decisão do cliente sobre esta proposta.</p></div></div>
    ${o.aprovacaoCliente ? `<p class="ok">Cliente ${o.aprovacaoCliente.status === 'Aprovado' ? 'aprovou' : 'recusou'} em ${fmt(o.aprovacaoCliente.em)}.</p>` : ''}
    <div class="row"><button type="button" class="btn" id="orc-aprovar">Cliente aprovou</button><button type="button" class="btn ghost" id="orc-recusar">Cliente recusou</button></div>
  </div>`;
  const enviar = $('#orc-enviar');
  if (enviar) enviar.onclick = async () => {
    await put('orcamentos', { ...o, status: (o.status === 'Aprovado' || o.status === 'Recusado') ? o.status : 'Enviado', atualizado: new Date().toISOString() });
    const assunto = encodeURIComponent(`Proposta ${o.numero || ''} — VISTORI ENGENHARIA`);
    const corpo = encodeURIComponent(`Olá ${cliente?.nome || ''},\n\nSegue a proposta ${o.numero || ''} no valor de ${brl(t.tot)}.\nServiço: ${o.tipo || ''}\nImóvel: ${obra?.nome || ''}\nValidade: ${o.validade ? dataBR(o.validade) : '—'}\n\nAtenciosamente,\nVISTORI ENGENHARIA`);
    render();
    try { window.open(`mailto:${cliente?.email || ''}?subject=${assunto}&body=${corpo}`, '_blank'); } catch (e) {}
  };
  const copiar = $('#orc-copiar');
  if (copiar) copiar.onclick = async () => {
    try { await navigator.clipboard.writeText(location.href); copiar.textContent = 'Link copiado!'; } catch (e) { alert('Copie o link: ' + location.href); }
  };
  const aprov = $('#orc-aprovar');
  if (aprov) aprov.onclick = async () => {
    await put('orcamentos', { ...o, status: 'Aprovado', aprovacaoCliente: { status: 'Aprovado', em: new Date().toISOString() }, atualizado: new Date().toISOString() });
    render();
  };
  const recus = $('#orc-recusar');
  if (recus) recus.onclick = async () => {
    await put('orcamentos', { ...o, status: 'Recusado', aprovacaoCliente: { status: 'Recusado', em: new Date().toISOString() }, atualizado: new Date().toISOString() });
    render();
  };
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

/* ---------- LGPD e privacidade ---------- */
async function lgpd() {
  const [cls, os, vs, ag, orcs] = await Promise.all([all('clientes'), all('obras'), all('vistorias'), all('agendamentos'), all('orcamentos')]);
  const com = cls.filter(c => c.consentimento).length;
  const sem = cls.length - com;
  const exportar = async id => {
    const c = cls.find(x => x.id === id); if (!c) return;
    const minhasObras = os.filter(o => o.clienteId === id);
    const ids = new Set(minhasObras.map(o => o.id));
    const minhasVs = vs.filter(v => ids.has(v.obraId));
    const vIds = new Set(minhasVs.map(v => v.id));
    const todasFotos = await all('fotos');
    const dados = {
      exportadoEm: new Date().toISOString(), sistema: 'VISTORI-ENGENHARIA', versao: VERSION,
      cliente: c, imoveis: minhasObras, vistorias: minhasVs,
      agendamentos: ag.filter(a => ids.has(a.obraId)),
      orcamentos: orcs.filter(o => ids.has(o.obraId)),
      fotos: todasFotos.filter(f => vIds.has(f.vistoriaId))
    };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' }));
    a.download = `dados-cliente-${id}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };
  const anonimizar = async id => {
    const c = cls.find(x => x.id === id); if (!c) return;
    if (!confirm(`Anonimizar os dados pessoais de "${c.nome}"?\n\nOs dados de contato e documento serão apagados e o cadastro ficará identificado como "Anonimizado". Esta ação não pode ser desfeita.`)) return;
    await put('clientes', { ...c, nome: 'Anonimizado #' + id.slice(-6), pessoa: '', fantasia: '', documento: '', telefone: '', email: '', endereco: '', cidade: '', uf: '', observacoes: '', anonimizado: new Date().toISOString() });
    render();
  };
  app.innerHTML = `<section class="section-heading client-head"><div><h2>LGPD e privacidade</h2><p>Consentimentos, exportação e anonimização dos dados pessoais.</p></div></section>
  <div class="lgpd-kpis">
    <div class="kpi-card"><span>Clientes cadastrados</span><strong>${cls.length}</strong><small>Base de dados pessoais</small></div>
    <div class="kpi-card success"><span>Com consentimento</span><strong>${com}</strong><small>Registro de consentimento</small></div>
    <div class="kpi-card ${sem ? 'danger' : 'success'}"><span>Sem consentimento</span><strong>${sem}</strong><small>${sem ? 'Pendente de registro' : 'Todos registrados'}</small></div>
  </div>
  <div class="warn"><b>Governança de dados:</b> estes recursos apoiam a conformidade com a LGPD, mas não substituem avaliação jurídica nem certificam conformidade legal. Laudos assinados são mantidos pelo prazo de retenção; a anonimização remove os dados pessoais do cadastro do cliente.</div>
  <div class="card">
    <div class="section-heading"><div><h3>Consentimentos e direitos do titular</h3><p>Registre o consentimento, exporte os dados ou anonimize o cadastro.</p></div></div>
    <table><thead><tr><th>Cliente</th><th>Documento</th><th>Consentimento</th><th></th></tr></thead><tbody id="lgpd-tbody">
    ${cls.map(c => `<tr><td>${esc(c.nome)}<br><small>${esc(c.pessoa)}</small></td><td>${esc(c.documento || '—')}</td><td>${c.consentimento ? `<span class="status-badge signed">${new Date(c.consentimento).toLocaleDateString('pt-BR')}</span>` : '<span class="status-badge draft">Pendente</span>'}${c.anonimizado ? '<br><small>Anonimizado</small>' : ''}</td>
    <td class="act">${!c.consentimento ? `<a href="#" data-lgpd="consentir" data-id="${c.id}">Registrar</a>` : ''}<a href="#" data-lgpd="exportar" data-id="${c.id}">Exportar dados</a><a href="#" data-lgpd="anonimizar" data-id="${c.id}">Anonimizar</a></td></tr>`).join('') || '<tr><td colspan="4">Nenhum cliente cadastrado.</td></tr>'}
    </tbody></table>
  </div>`;
  const tb = $('#lgpd-tbody');
  if (tb) tb.addEventListener('click', async e => {
    const a = e.target.closest('[data-lgpd]'); if (!a) return; e.preventDefault();
    const id = a.dataset.id;
    if (a.dataset.lgpd === 'exportar') await exportar(id);
    else if (a.dataset.lgpd === 'anonimizar') await anonimizar(id);
    else if (a.dataset.lgpd === 'consentir') { const c = cls.find(x => x.id === id); if (c) { await put('clientes', { ...c, consentimento: new Date().toISOString() }); render(); } }
  });
}

/* ---------- financeiro ---------- */
const recStatus = r => r.status === 'Recebido' ? 'Recebido' : (r.vencimento && r.vencimento < new Date().toISOString().slice(0, 10) ? 'Atrasado' : 'Pendente');

async function financeiro(q) {
  const [recs, cls, obras] = await Promise.all([all('recebimentos'), all('clientes'), all('obras')]);
  const om = Object.fromEntries(obras.map(o => [o.id, o]));
  const cm = Object.fromEntries(cls.map(c => [c.id, c.nome]));
  const qp = new URLSearchParams(q || '');
  const mostrarForm = qp.has('nova');
  const soma = arr => arr.reduce((n, r) => n + (Number(r.valor) || 0), 0);
  const prev = soma(recs);
  const receb = soma(recs.filter(r => r.status === 'Recebido'));
  const aberto = soma(recs.filter(r => r.status !== 'Recebido'));
  const atras = soma(recs.filter(r => recStatus(r) === 'Atrasado'));
  const baseF = new Date(); baseF.setHours(0, 0, 0, 0);
  const mesesF = [];
  for (let k = 5; k >= 0; k--) { const d = new Date(baseF.getFullYear(), baseF.getMonth() - k, 1); mesesF.push({ y: d.getFullYear(), m: d.getMonth(), label: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '') }); }
  const prevF = mesesF.map(x => recs.filter(r => { const d = r.vencimento ? new Date(r.vencimento + 'T12:00:00') : new Date(r.criado || 0); return d.getFullYear() === x.y && d.getMonth() === x.m; }).reduce((n, r) => n + (Number(r.valor) || 0), 0));
  const recF = mesesF.map(x => recs.filter(r => r.status === 'Recebido' && r.pagoEm && new Date(r.pagoEm).getFullYear() === x.y && new Date(r.pagoEm).getMonth() === x.m).reduce((n, r) => n + (Number(r.valor) || 0), 0));
  const maxF = Math.max(1, ...prevF, ...recF);
  const opObra = obras.map(o => [o.id, `${o.nome} — ${cm[o.clienteId] || ''}`]);
  app.innerHTML = `<section class="section-heading client-head"><div><h2>Financeiro</h2><p>Receitas previstas, recebidas e contas a receber.</p></div>
    <div class="dashboard-actions"><a class="btn" href="#/financeiro?nova=1">+ Novo recebimento</a><button type="button" class="btn ghost" id="fin-gerar">Gerar de orçamentos/vistorias</button></div></section>
  ${mostrarForm ? `<form id="fin-form" class="card grid">
    ${fieldHtml({ k: 'descricao', l: 'Descrição', req: 1 }, '')}
    ${fieldHtml({ k: 'obraId', l: 'Imóvel/Obra', opts: opObra }, '')}
    ${fieldHtml({ k: 'valor', l: 'Valor (R$)', req: 1, type: 'number' }, '')}
    ${fieldHtml({ k: 'vencimento', l: 'Vencimento', type: 'date' }, '')}
    <div class="row"><button class="btn">Adicionar recebimento</button><a class="btn ghost" href="#/financeiro">Cancelar</a></div>
  </form>` : ''}
  <div class="kpi-grid">
    <div class="kpi-card"><span>Previsto</span><strong>${brl(prev)}</strong><small>Todos os recebimentos</small></div>
    <div class="kpi-card success"><span>Recebido</span><strong>${brl(receb)}</strong><small>${recs.filter(r => r.status === 'Recebido').length} lançamento(s)</small></div>
    <div class="kpi-card"><span>Em aberto</span><strong>${brl(aberto)}</strong><small>${recs.filter(r => r.status !== 'Recebido').length} lançamento(s)</small></div>
    <div class="kpi-card danger"><span>Atrasado</span><strong>${brl(atras)}</strong><small>Vencidos e não recebidos</small></div>
  </div>
  <div class="card" style="margin-bottom:16px">
    <div class="section-heading"><div><h3>Receita prevista × recebida</h3><p>Últimos 6 meses.</p></div></div>
    <div class="chart" role="img" aria-label="Receita prevista e recebida por mês">${mesesF.map((x, i) => `<div class="chart-col"><div class="bars"><span class="bar" style="height:${Math.round(prevF[i] / maxF * 100)}%" title="Prevista ${brl(prevF[i])}"></span><span class="bar alt" style="height:${Math.round(recF[i] / maxF * 100)}%" title="Recebida ${brl(recF[i])}"></span></div><small>${x.label}</small></div>`).join('')}</div>
    <div class="chart-legend"><span><i class="lg-prev"></i>Prevista</span><span><i class="lg-rec"></i>Recebida</span></div>
  </div>
  <div class="card">
    <div class="list-filters">
      <input id="f-busca" placeholder="Buscar descrição, cliente ou imóvel…">
      <select id="f-status"><option value="">Todos os status</option><option value="Pendente">Pendente</option><option value="Recebido">Recebido</option><option value="Atrasado">Atrasado</option></select>
      <select id="f-periodo"><option value="">Todo o período</option><option value="mes">Este mês</option><option value="ano">Este ano</option><option value="12">Últimos 12 meses</option></select>
    </div>
    <table><thead><tr><th>Descrição</th><th>Cliente/Imóvel</th><th>Origem</th><th>Vencimento</th><th>Valor</th><th>Status</th><th></th></tr></thead><tbody id="f-tbody">
    ${recs.sort((a, b) => (a.vencimento || '9999').localeCompare(b.vencimento || '9999') || (b.criado || '').localeCompare(a.criado || '')).map(r => { const obra = om[r.obraId]; const st = recStatus(r); const badge = st === 'Recebido' ? 'signed' : st === 'Atrasado' ? 'orc-recusado' : 'draft'; const cid = r.clienteId || obra?.clienteId; return `<tr data-status="${st}" data-venc="${esc(r.vencimento || '')}"><td>${esc(r.descricao)}</td><td>${esc(cm[cid] || '—')}<br><small>${esc(obra?.nome || '—')}</small></td><td>${esc(r.origem === 'orcamento' ? 'Orçamento' : r.origem === 'vistoria' ? 'Vistoria' : 'Manual')}</td><td>${r.vencimento ? esc(dataBR(r.vencimento)) : '—'}</td><td>${brl(r.valor)}</td><td><span class="status-badge ${badge}">${st}</span>${r.pagoEm ? `<br><small>${new Date(r.pagoEm).toLocaleDateString('pt-BR')}</small>` : ''}</td><td class="act">${r.status === 'Recebido' ? `<a href="#/recibo/${r.id}">Recibo</a><a href="#" data-reabrir="${r.id}">Reabrir</a>` : `<a href="#" data-receber="${r.id}">Receber</a>`}<a href="#" data-del="recebimentos:${r.id}">Excluir</a></td></tr>`; }).join('') || '<tr><td colspan="7">Nenhum recebimento cadastrado.</td></tr>'}
    <tr id="f-vazio" hidden><td colspan="7">Nenhum registro corresponde aos filtros.</td></tr>
    </tbody></table>
  </div>`;
  const form = $('#fin-form');
  if (form) form.onsubmit = async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(form));
    await put('recebimentos', { id: uid(), origem: 'manual', origemId: '', descricao: d.descricao, obraId: d.obraId || '', clienteId: om[d.obraId]?.clienteId || '', valor: d.valor, vencimento: d.vencimento || '', status: 'Pendente', pagoEm: '', criado: new Date().toISOString() });
    location.hash = '#/financeiro'; render();
  };

  const g = $('#fin-gerar');
  if (g) g.onclick = async () => {
    const [orcs, vs, atuais] = await Promise.all([all('orcamentos'), all('vistorias'), all('recebimentos')]);
    const exist = new Set(atuais.map(r => r.origem + ':' + r.origemId));
    let n = 0;
    for (const o of orcs.filter(o => o.status === 'Aprovado')) {
      if (exist.has('orcamento:' + o.id)) continue;
      const t = orcTotais(o);
      await put('recebimentos', { id: uid(), origem: 'orcamento', origemId: o.id, descricao: ('Proposta ' + (o.numero || '')).trim(), obraId: o.obraId || '', clienteId: o.clienteId || '', valor: t.tot, vencimento: '', status: 'Pendente', pagoEm: '', criado: new Date().toISOString() });
      exist.add('orcamento:' + o.id); n++;
    }
    for (const v of vs.filter(v => Number(v.valor) > 0)) {
      if (exist.has('vistoria:' + v.id)) continue;
      await put('recebimentos', { id: uid(), origem: 'vistoria', origemId: v.id, descricao: ('Vistoria ' + (v.tipo || '')).trim(), obraId: v.obraId || '', clienteId: om[v.obraId]?.clienteId || '', valor: Number(v.valor), vencimento: v.data || '', status: 'Pendente', pagoEm: '', criado: new Date().toISOString() });
      exist.add('vistoria:' + v.id); n++;
    }
    alert(n ? `${n} recebimento(s) gerado(s).` : 'Nada novo para gerar.');
    render();
  };

  const filtrar = () => {
    const texto = ($('#f-busca')?.value || '').toLowerCase().trim();
    const st = $('#f-status')?.value || '';
    const per = $('#f-periodo')?.value || '';
    const hoje = new Date(); const mes = hoje.toISOString().slice(0, 7); const ano = hoje.getFullYear();
    const rows = [...document.querySelectorAll('#f-tbody tr[data-status]')];
    rows.forEach(r => {
      let ok = true;
      if (texto && !r.textContent.toLowerCase().includes(texto)) ok = false;
      if (st && r.dataset.status !== st) ok = false;
      if (per) {
        const v = r.dataset.venc || '';
        if (!v) ok = false;
        else if (per === 'mes' && v.slice(0, 7) !== mes) ok = false;
        else if (per === 'ano' && Number(v.slice(0, 4)) !== ano) ok = false;
        else if (per === '12') { const lim = new Date(hoje); lim.setMonth(lim.getMonth() - 12); if (new Date(v + 'T12:00:00') < lim) ok = false; }
      }
      r.hidden = !ok;
    });
    const vis = rows.filter(r => !r.hidden).length;
    const vazio = $('#f-vazio'); if (vazio) vazio.hidden = !(rows.length > 0 && vis === 0);
  };
  const b = $('#f-busca'); if (b) b.oninput = filtrar;
  const s = $('#f-status'); if (s) s.onchange = filtrar;
  const p = $('#f-periodo'); if (p) p.onchange = filtrar;
}

/* ---------- recibo ---------- */
async function recibo(id) {
  const o = await get('recebimentos', id);
  if (!o) { app.innerHTML = '<div class="warn">Recibo não encontrado.</div>'; return; }
  const obra = o.obraId ? await get('obras', o.obraId) : null;
  const cliente = obra ? await get('clientes', obra.clienteId) : null;
  const recs = await all('recebimentos');
  const recebidos = recs.filter(r => r.status === 'Recebido' && r.pagoEm).sort((a, b) => (a.pagoEm || '').localeCompare(b.pagoEm || ''));
  const seq = recebidos.findIndex(r => r.id === o.id) + 1;
  const ano = new Date(o.pagoEm || Date.now()).getFullYear();
  const numero = `REC-${ano}-${String(seq || 1).padStart(4, '0')}`;
  app.innerHTML = `<div class="noprint row"><button class="btn" onclick="print()">Imprimir / Salvar PDF</button><a class="btn ghost" href="#/financeiro">Voltar ao financeiro</a></div>
  <div class="card laudo recibo">
    <img class="laudo-logo" src="logo.png" alt="VISTORI ENGENHARIA">
    <h1>Recibo</h1>
    <p class="recibo-num"><span><b>Nº:</b> ${esc(numero)}</span><span><b>Valor:</b> ${brl(o.valor)}</span><span><b>Data:</b> ${o.pagoEm ? fmt(o.pagoEm) : '—'}</span></p>
    <p class="recibo-corpo">Recebi de <b>${esc(cliente?.nome || '—')}</b> a importância de <b>${brl(o.valor)}</b> referente a <b>${esc(o.descricao || 'serviços de engenharia')}</b>${obra ? ` — ${esc(obra.nome)}` : ''}.</p>
    <p>Para clareza, firmo o presente recibo.</p>
    <div class="recibo-ass"><span></span><small>VISTORI ENGENHARIA</small></div>
  </div>`;
}

/* ---------- usuários e acessos ---------- */
async function usuarios() {
  let lista = []; let erro = '';
  try { lista = await all('acessos'); }
  catch (e) { erro = (e && e.code === 'permission-denied') ? 'Sem permissão para ler a lista de acessos.' : ((e && e.message) || 'Falha ao carregar a lista.'); }
  const nuvem = MODO !== 'local';
  const emailAtual = (USER?.email || '').toLowerCase();
  lista.sort((a, b) => (a.nome || a.id || '').localeCompare(b.nome || b.id || '', 'pt-BR'));
  app.innerHTML = `<section class="section-heading client-head"><div><h2>Usuários e acessos</h2><p>Quem pode entrar no sistema e acessar os dados.</p></div></section>
  ${nuvem ? `<div class="warn"><b>Ambiente em nuvem:</b> a lista abaixo controla o acesso ao Firestore. As regras de segurança precisam estar publicadas no Firebase Console (Firestore → Regras → Publicar). Conectado como <b>${esc(emailAtual || '—')}</b>.</div>` : '<div class="warn"><b>Modo local (teste):</b> a lista abaixo fica só neste aparelho. No ambiente em nuvem ela controla o acesso real.</div>'}
  ${erro ? `<div class="warn">${esc(erro)}</div>` : ''}
  <form id="user-form" class="card grid">
    ${fieldHtml({ k: 'email', l: 'E-mail autorizado', req: 1, type: 'email' }, '')}
    ${fieldHtml({ k: 'nome', l: 'Nome' }, '')}
    ${fieldHtml({ k: 'perfil', l: 'Perfil', opts: [['Administrador', 'Administrador'], ['Engenheiro', 'Engenheiro'], ['Vistoriador', 'Vistoriador'], ['Financeiro', 'Financeiro']] }, 'Administrador')}
    <div class="row"><button class="btn">Autorizar e-mail</button></div>
  </form>
  <div class="card">
    <table><thead><tr><th>E-mail</th><th>Nome</th><th>Perfil</th><th></th></tr></thead><tbody>
    ${lista.map(u => `<tr><td>${esc(u.id)}</td><td>${esc(u.nome || '—')}</td><td>${esc(u.perfil || '—')}</td><td class="act">${u.id === emailAtual ? '<span class="status-badge signed">Você</span>' : ''}<a href="#" data-del="acessos:${esc(u.id)}">Remover</a></td></tr>`).join('') || '<tr><td colspan="4">Nenhum e-mail cadastrado. Os e-mails de bootstrap das regras sempre entram.</td></tr>'}
    </tbody></table>
  </div>`;
  const f = $('#user-form');
  if (f) f.onsubmit = async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    const email = String(d.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return alert('Informe um e-mail válido.');
    await put('acessos', { id: email, nome: (d.nome || '').trim(), perfil: d.perfil || 'Administrador', criado: new Date().toISOString() });
    render();
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
    if (s === 'acessos' && id === (USER?.email || '').toLowerCase()) return alert('Você não pode remover o seu próprio acesso.');
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
  } else if (d.receber) {
    e.preventDefault();
    const r = await get('recebimentos', d.receber);
    if (r) { await put('recebimentos', { ...r, status: 'Recebido', pagoEm: new Date().toISOString() }); render(); }
  } else if (d.reabrir) {
    e.preventDefault();
    const r = await get('recebimentos', d.reabrir);
    if (r) { await put('recebimentos', { ...r, status: 'Pendente', pagoEm: '' }); render(); }
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

/* ---------- sidebar moderna: navegação, tema e busca ---------- */
const nav = $('#nav');
const navToggle = $('#nav-toggle');
const sidebar = $('#sidebar');
const navBackdrop = $('#nav-backdrop');
const sidebarToggle = $('#sidebar-toggle');
const themeToggle = $('#theme-toggle');
const navSearch = $('#nav-search');

const temaInicial = localStorage.getItem('vistori_tema_v2') || 'light';
document.documentElement.dataset.theme = temaInicial;
if (themeToggle) themeToggle.addEventListener('click', () => {
  const novo = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = novo;
  localStorage.setItem('vistori_tema_v2', novo);
});

document.body.classList.toggle('sidebar-collapsed', localStorage.getItem('vistori_menu_recolhido') === '1');
function syncSidebar() {
  if (!sidebarToggle) return;
  const c = document.body.classList.contains('sidebar-collapsed');
  sidebarToggle.setAttribute('aria-label', c ? 'Expandir menu' : 'Recolher menu');
  const lbl = sidebarToggle.querySelector('.nav-label'); if (lbl) lbl.textContent = c ? 'Expandir menu' : 'Recolher menu';
}
syncSidebar();
if (sidebarToggle) sidebarToggle.addEventListener('click', () => {
  const collapsed = document.body.classList.toggle('sidebar-collapsed');
  localStorage.setItem('vistori_menu_recolhido', collapsed ? '1' : '0');
  syncSidebar();
});

document.querySelectorAll('.nav-group-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const g = btn.closest('.nav-group');
    const fechado = g.classList.toggle('is-collapsed');
    btn.setAttribute('aria-expanded', String(!fechado));
  });
});

const navTip = document.createElement('div');
navTip.id = 'nav-tip'; navTip.className = 'nav-tip'; navTip.setAttribute('role', 'tooltip'); navTip.hidden = true;
document.body.appendChild(navTip);
function mostrarTip(el) {
  if (!document.body.classList.contains('sidebar-collapsed') || innerWidth <= 900) return;
  const label = el.dataset.label || el.querySelector('.nav-label')?.textContent || el.getAttribute('aria-label');
  if (!label) return;
  const r = el.getBoundingClientRect();
  navTip.textContent = label;
  navTip.style.left = (r.right + 10) + 'px';
  navTip.style.top = (r.top + r.height / 2) + 'px';
  navTip.hidden = false;
}
function esconderTip() { navTip.hidden = true; }
document.querySelectorAll('#nav a, .nav-search').forEach(el => {
  el.addEventListener('mouseenter', () => mostrarTip(el));
  el.addEventListener('mouseleave', esconderTip);
  el.addEventListener('focus', () => mostrarTip(el));
  el.addEventListener('blur', esconderTip);
});

nav.addEventListener('keydown', e => {
  const links = [...nav.querySelectorAll('a')].filter(a => !a.closest('.nav-group.is-collapsed'));
  const i = links.indexOf(document.activeElement);
  if (e.key === 'ArrowDown') { e.preventDefault(); (links[i + 1] || links[0])?.focus(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); (links[i - 1] || links[links.length - 1])?.focus(); }
  else if (e.key === 'Home') { e.preventDefault(); links[0]?.focus(); }
  else if (e.key === 'End') { e.preventDefault(); links[links.length - 1]?.focus(); }
});

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
addEventListener('resize', () => { if (innerWidth > 900) closeNav(); });
addEventListener('keydown', e => { if (e.key === 'Escape' && !document.body.classList.contains('cmdk-open')) closeNav(); });

/* ---------- busca de módulos (Ctrl+K) ---------- */
(function initCmdk() {
  const box = $('#cmdk'), input = $('#cmdk-input'), list = $('#cmdk-list');
  if (!box || !input || !list) return;
  const mods = [...document.querySelectorAll('#nav a')].map(a => ({
    href: a.getAttribute('href'),
    label: a.dataset.label || a.textContent.trim(),
    group: a.closest('.nav-group')?.querySelector('.nav-group-btn .nav-label')?.textContent || '',
    ico: a.querySelector('.nav-ico')?.innerHTML || ''
  }));
  let atual = mods, idx = 0;
  const render = q => {
    const t = q.toLowerCase().trim();
    atual = mods.filter(m => !t || (m.label + ' ' + m.group).toLowerCase().includes(t));
    idx = 0;
    list.innerHTML = atual.map((m, i) => `<li role="option" class="cmdk-item ${i === 0 ? 'sel' : ''}" data-href="${m.href}" aria-selected="${i === 0}"><span class="cmdk-ico">${m.ico}</span><span class="cmdk-txt"><b>${m.label}</b><small>${m.group}</small></span><span class="cmdk-go">↵</span></li>`).join('') || '<li class="cmdk-empty">Nenhum módulo encontrado.</li>';
  };
  const abrir = () => { box.hidden = false; document.body.classList.add('cmdk-open'); input.value = ''; render(''); input.focus(); };
  const fechar = () => { box.hidden = true; document.body.classList.remove('cmdk-open'); };
  const mover = d => {
    if (!atual.length) return;
    idx = (idx + d + atual.length) % atual.length;
    list.querySelectorAll('.cmdk-item').forEach((el, i) => { el.classList.toggle('sel', i === idx); el.setAttribute('aria-selected', String(i === idx)); });
    list.querySelectorAll('.cmdk-item')[idx]?.scrollIntoView({ block: 'nearest' });
  };
  const ir = href => { if (!href) return; fechar(); location.hash = href; };
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); box.hidden ? abrir() : fechar(); return; }
    if (box.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); fechar(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); mover(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); mover(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); ir(atual[idx]?.href); }
  });
  input.addEventListener('input', () => render(input.value));
  list.addEventListener('click', e => { const li = e.target.closest('[data-href]'); if (li) ir(li.dataset.href); });
  box.addEventListener('click', e => { if (e.target.closest('[data-cmdk-close]')) fechar(); });
  if (navSearch) navSearch.addEventListener('click', abrir);
})();

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
  const navKey = ['clientes', 'obras'].includes(r) ? r : CAD.includes(r) ? 'cadastros' : r === 'vistoria' || r === 'laudo' ? 'vistorias' : r === 'cliente' ? 'clientes' : r === 'orcamento' ? 'orcamentos' : r === 'recibo' ? 'financeiro' : r;
  document.querySelectorAll('#nav a').forEach(a => {
    const on = a.getAttribute('href') === `#/${navKey}`;
    a.classList.toggle('on', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  document.querySelectorAll('.nav-group').forEach(g => {
    const ativo = !!g.querySelector('a.on');
    g.classList.toggle('has-active', ativo);
    if (ativo) { g.classList.remove('is-collapsed'); const b = g.querySelector('.nav-group-btn'); if (b) b.setAttribute('aria-expanded', 'true'); }
  });
  const titles = { '': 'Visão geral', agenda: 'Agenda', cadastros: 'Cadastros', clientes: 'Clientes', cliente: 'Ficha do cliente', obras: 'Imóveis e obras', fornecedores: 'Fornecedores', tipos: 'Tipos de serviço', catalogo: 'Catálogo de itens', precos: 'Tabela de preços', vistorias: 'Vistorias', vistoria: 'Detalhe da vistoria', laudo: 'Laudo técnico', orcamentos: 'Orçamentos', orcamento: 'Proposta comercial', financeiro: 'Financeiro', recibo: 'Recibo', checklist: 'Checklist padrão', lgpd: 'LGPD e privacidade', usuarios: 'Usuários e acessos', backup: 'Backup' };
  $('#page-title').textContent = titles[r] || 'Visão geral';
  closeNav();
  const R = { '': inicio, agenda, cadastros, clientes, cliente: () => cliente(arg), obras, fornecedores, tipos: tiposServico, catalogo, precos, vistorias, vistoria: () => vistoria(arg), laudo: () => laudo(arg), orcamentos, orcamento: () => orcamento(arg), financeiro, recibo: () => recibo(arg), checklist, lgpd, usuarios, backup };
  try { await (R[r] || inicio)(q); responsiveTables(); }
  catch (err) {
    console.error(err);
    app.innerHTML = err.code === 'permission-denied'
      ? '<div class="warn"><b>Sem permissão.</b> Este e-mail não está autorizado a acessar os dados. Peça a um administrador para autorizá-lo em <b>Usuários e acessos</b> (a lista depende das regras do Firestore publicadas no Firebase Console).</div>'
      : `<div class="warn">Erro: ${esc(err.message)}</div>`;
  }
}
addEventListener('hashchange', render);
boot();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
