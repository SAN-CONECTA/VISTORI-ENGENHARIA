// Orçamentos: lista, edição e proposta comercial.
import { auditar } from '../core/auditoria.js';
import { UNIDADES } from '../core/config.js';
import { all, get, put } from '../core/db/index.js';
import { $, app, esc, fieldHtml } from '../core/dom.js';
import { refresh } from '../core/navigate.js';
import { getTipos } from '../core/tipos.js';
import { brl, dataBR, fmt, labelReg, uid } from '../core/utils.js';

const ORC_STATUS = ['Rascunho', 'Enviado', 'Aprovado', 'Recusado'];
export const orcTotais = o => {
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

export async function orcamentos(q) {
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
      location.hash = '#/orcamentos'; refresh();
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

export async function orcamento(id) {
  const o = await get('orcamentos', id);
  if (!o) { app.innerHTML = '<div class="warn">Orçamento não encontrado.</div>'; return; }
  const obra = o.obraId ? await get('obras', o.obraId) : null;
  const cliente = obra ? await get('clientes', obra.clienteId) : null;
  const t = orcTotais(o);
  const emp = (await get('config', 'empresa')) || {};
  const statusAcoes = [['Enviado', 'Marcar como enviado'], ['Aprovado', 'Aprovar'], ['Recusado', 'Recusar']].filter(([s]) => s !== o.status).map(([s, l]) => `<a class="btn ghost" href="#" data-orc-status="${s}" data-orc-status-id="${o.id}">${l}</a>`).join('');
  app.innerHTML = `<div class="noprint row"><button class="btn" onclick="print()">Imprimir / Salvar PDF</button>${o.status === 'Aprovado' ? `<a class="btn" href="#/agenda?nova=1&obraId=${encodeURIComponent(o.obraId || '')}&tipo=${encodeURIComponent(o.tipo || '')}">Agendar visita</a>` : ''}<button type="button" class="btn" id="orc-enviar">Enviar ao cliente</button><button type="button" class="btn ghost" id="orc-copiar">Copiar link</button><a class="btn ghost" href="#/orcamentos">Voltar</a><a class="btn ghost" href="#/orcamentos?e=${o.id}">Editar</a>${statusAcoes}</div>
  ${o.status === 'Aprovado' ? '<div class="ok">Orçamento aprovado. Agende a visita para iniciar a vistoria.</div>' : ''}
  <div class="card laudo proposta">
    <img class="laudo-logo" src="${emp.logo || 'logo.png'}" alt="${esc(emp.razao || 'VISTORI ENGENHARIA')}">
    <p class="doc-empresa">${esc(emp.razao || 'VISTORI ENGENHARIA')}${emp.cnpj ? ' · CNPJ ' + esc(emp.cnpj) : ''}</p>
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
    await auditar('Enviou proposta', 'orcamentos', o.id, labelReg(o));
    const assunto = encodeURIComponent(`Proposta ${o.numero || ''} — VISTORI ENGENHARIA`);
    const corpo = encodeURIComponent(`Olá ${cliente?.nome || ''},\n\nSegue a proposta ${o.numero || ''} no valor de ${brl(t.tot)}.\nServiço: ${o.tipo || ''}\nImóvel: ${obra?.nome || ''}\nValidade: ${o.validade ? dataBR(o.validade) : '—'}\n\nAtenciosamente,\nVISTORI ENGENHARIA`);
    refresh();
    try { window.open(`mailto:${cliente?.email || ''}?subject=${assunto}&body=${corpo}`, '_blank'); } catch (e) {}
  };
  const copiar = $('#orc-copiar');
  if (copiar) copiar.onclick = async () => {
    try { await navigator.clipboard.writeText(location.href); copiar.textContent = 'Link copiado!'; } catch (e) { alert('Copie o link: ' + location.href); }
  };
  const aprov = $('#orc-aprovar');
  if (aprov) aprov.onclick = async () => {
    await put('orcamentos', { ...o, status: 'Aprovado', aprovacaoCliente: { status: 'Aprovado', em: new Date().toISOString() }, atualizado: new Date().toISOString() });
    await auditar('Cliente aprovou proposta', 'orcamentos', o.id, labelReg(o));
    refresh();
  };
  const recus = $('#orc-recusar');
  if (recus) recus.onclick = async () => {
    await put('orcamentos', { ...o, status: 'Recusado', aprovacaoCliente: { status: 'Recusado', em: new Date().toISOString() }, atualizado: new Date().toISOString() });
    await auditar('Cliente recusou proposta', 'orcamentos', o.id, labelReg(o));
    refresh();
  };
}
