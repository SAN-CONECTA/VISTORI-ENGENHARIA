// Financeiro e recibos.
import { all, get, put } from '../core/db/index.js';
import { $, app, esc, fieldHtml } from '../core/dom.js';
import { refresh } from '../core/navigate.js';
import { brl, dataBR, fmt, uid } from '../core/utils.js';
import { orcTotais } from './orcamentos.js';

const recStatus = r => r.status === 'Recebido' ? 'Recebido' : (r.vencimento && r.vencimento < new Date().toISOString().slice(0, 10) ? 'Atrasado' : 'Pendente');

export async function financeiro(q) {
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
    location.hash = '#/financeiro'; refresh();
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
    refresh();
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
export async function recibo(id) {
  const o = await get('recebimentos', id);
  if (!o) { app.innerHTML = '<div class="warn">Recibo não encontrado.</div>'; return; }
  const obra = o.obraId ? await get('obras', o.obraId) : null;
  const cliente = obra ? await get('clientes', obra.clienteId) : null;
  const emp = (await get('config', 'empresa')) || {};
  const recs = await all('recebimentos');
  const recebidos = recs.filter(r => r.status === 'Recebido' && r.pagoEm).sort((a, b) => (a.pagoEm || '').localeCompare(b.pagoEm || ''));
  const seq = recebidos.findIndex(r => r.id === o.id) + 1;
  const ano = new Date(o.pagoEm || Date.now()).getFullYear();
  const numero = `REC-${ano}-${String(seq || 1).padStart(4, '0')}`;
  app.innerHTML = `<div class="noprint row"><button class="btn" onclick="print()">Imprimir / Salvar PDF</button><a class="btn ghost" href="#/financeiro">Voltar ao financeiro</a></div>
  <div class="card laudo recibo">
    <img class="laudo-logo" src="${emp.logo || 'logo.png'}" alt="${esc(emp.razao || 'VISTORI ENGENHARIA')}">
    <p class="doc-empresa">${esc(emp.razao || 'VISTORI ENGENHARIA')}${emp.cnpj ? ' · CNPJ ' + esc(emp.cnpj) : ''}</p>
    <h1>Recibo</h1>
    <p class="recibo-num"><span><b>Nº:</b> ${esc(numero)}</span><span><b>Valor:</b> ${brl(o.valor)}</span><span><b>Data:</b> ${o.pagoEm ? fmt(o.pagoEm) : '—'}</span></p>
    <p class="recibo-corpo">Recebi de <b>${esc(cliente?.nome || '—')}</b> a importância de <b>${brl(o.valor)}</b> referente a <b>${esc(o.descricao || 'serviços de engenharia')}</b>${obra ? ` — ${esc(obra.nome)}` : ''}.</p>
    <p>Para clareza, firmo o presente recibo.</p>
    <div class="recibo-ass"><span></span><small>VISTORI ENGENHARIA</small></div>
  </div>`;
}
