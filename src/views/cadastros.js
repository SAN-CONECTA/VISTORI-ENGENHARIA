// Telas de cadastros: clientes, imóveis/obras, fornecedores, tipos, preços e catálogo.
import { TIPOS_OBRA, UFS, UNIDADES } from '../core/config.js';
import { all, get, put } from '../core/db/index.js';
import { docMsg, fmtDoc } from '../core/docs.js';
import { $, app, crud, esc } from '../core/dom.js';
import { getTipos } from '../core/tipos.js';
import { brl } from '../core/utils.js';

/* ---------- 1.1 Clientes e vínculo com imóveis/obras ---------- */
export async function clientes(q) {
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
export async function cliente(id) {
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

export async function obras(q) {
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
export const fornecedores = q => crud('fornecedores', 'Fornecedores e Empreiteiros', [
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

export async function tiposServico(q) {
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

export const catalogo = q => crud('catalogo', 'Catálogo de Itens e Serviços Adicionais', [
  { k: 'nome', l: 'Item / serviço (ex.: Deslocamento, Hora técnica, Taxa de ART)', req: 1 },
  { k: 'unidade', l: 'Unidade', req: 1, opts: UNIDADES.map(u => [u, u]) },
  { k: 'valor', l: 'Valor unitário (R$)', req: 1, type: 'number' },
  { k: 'observacoes', l: 'Observações', type: 'textarea' }
], [
  { l: 'Item', fn: i => esc(i.nome) },
  { l: 'Unidade', fn: i => esc(i.unidade) },
  { l: 'Valor', fn: i => brl(i.valor) }
], q);

export async function precos() {
  const [ts, ps] = await Promise.all([getTipos(), all('precos')]);
  const pm = Object.fromEntries(ps.map(p => [p.id, p.valor]));
  app.innerHTML = `<p class="noprint"><a href="#/cadastros">← Cadastros</a></p><h2>Tabela de Preços</h2>
  <div class="card"><p>Valor padrão (R$) por tipo de serviço e tipo de imóvel. Ao criar uma vistoria, o valor correspondente já vem preenchido e pode ser ajustado. Deixe em branco quando não houver preço padrão. Salva ao sair do campo.</p>
  <table class="matrix-table"><thead><tr><th>Serviço</th>${TIPOS_OBRA.map(t => `<th>${esc(t)}</th>`).join('')}</tr></thead><tbody>
  ${ts.map(t => `<tr><td>${esc(t.nome)}</td>${TIPOS_OBRA.map(o => `<td><input type="number" step="0.01" min="0" data-p="${t.id}|${o}" value="${pm[t.id + '|' + o] ?? ''}"></td>`).join('')}</tr>`).join('') || '<tr><td colspan="5">Cadastre os tipos de serviço primeiro.</td></tr>'}
  </tbody></table></div>
  <p><a href="#/catalogo">Catálogo de itens e serviços adicionais →</a></p>`;
}

export async function cadastros() {
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
