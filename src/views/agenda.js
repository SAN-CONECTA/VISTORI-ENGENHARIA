// Agenda de visitas e criação de vistoria a partir de um agendamento.
import { dadosIniciaisRecebimento, getCheck, getModelo, getModelos, snapshotModelo } from '../core/checklist.js';
import { all, get, put } from '../core/db/index.js';
import { $, app, esc, fieldHtml } from '../core/dom.js';
import { refresh } from '../core/navigate.js';
import { getTipos } from '../core/tipos.js';
import { dataBR, uid } from '../core/utils.js';

export async function novaVistoriaDaAgenda(agendamento) {
  const obra = await get('obras', agendamento.obraId);
  if (!obra) throw new Error('O imóvel/obra deste agendamento não foi encontrado.');
  const [ts, cli] = await Promise.all([getTipos(), get('clientes', obra.clienteId)]);
  const modelo = agendamento.modeloId ? await getModelo(agendamento.modeloId) : null;
  const usar = modelo || null;
  let itens = [], categorias = [], dados = {};
  if (usar) {
    const snap = snapshotModelo(usar);
    itens = snap.itens; categorias = snap.categorias;
    dados = dadosIniciaisRecebimento(obra, cli);
  } else {
    const chk = await getCheck();
    for (const [cat, arr] of Object.entries(chk)) for (const desc of arr) itens.push({ cat, desc, status: '', obs: '', fotos: [] });
  }
  const tp = ts.find(t => t.nome === agendamento.tipo);
  const pr = tp ? await get('precos', `${tp.id}|${obra.tipo}`) : null;
  const v = {
    ...dados, id: uid(), obraId: obra.id, tipo: agendamento.tipo, data: agendamento.data, hora: agendamento.hora || '',
    vistoriador: agendamento.responsavel || '', crea: '', artNumero: '', valor: pr ? pr.valor : '',
    orientacoes: agendamento.observacoes || '', itens, status: 'rascunho', agendamentoId: agendamento.id, criado: new Date().toISOString(),
    ...(usar ? { checklistModeloId: usar.id, checklistModeloNome: usar.nome, checklistModeloCategorias: categorias } : {})
  };
  await put('vistorias', v);
  await put('agendamentos', { ...agendamento, vistoriaId: v.id, status: 'Em andamento', atualizado: new Date().toISOString() });
  return v;
}

export async function agenda(q) {
  const [ags, os, cls, ts, modelos] = await Promise.all([all('agendamentos'), all('obras'), all('clientes'), getTipos(), getModelos()]);
  const om = Object.fromEntries(os.map(o => [o.id, o]));
  const cm = Object.fromEntries(cls.map(c => [c.id, c.nome]));
  const qp = new URLSearchParams(q || '');
  const cur = ags.find(x => x.id === qp.get('e')) || (qp.has('nova') ? { obraId: qp.get('obraId') || '', tipo: qp.get('tipo') || '', data: qp.get('data') || '' } : {});
  const listaModelos = modelos.filter(m => m.ativo || m.id === cur.modeloId);
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
    <div><label>Modelo de checklist</label><select name="modeloId"><option value="">Checklist genérico (padrão)</option>${listaModelos.map(m => `<option value="${esc(m.id)}" ${cur.modeloId === m.id ? 'selected' : ''}>${esc(m.nome)}${m.ativo ? '' : ' (inativo)'}</option>`).join('')}</select></div>
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
    <table class="responsive-table"><thead><tr><th>Data</th><th>Imóvel/Cliente</th><th>Serviço</th><th>Responsável</th><th>Status</th><th></th></tr></thead><tbody id="agenda-tbody">
    ${ordenados.map(x => { const obra = om[x.obraId]; return `<tr data-status="${esc(x.status)}" data-resp="${esc(x.responsavel || '')}"><td data-label="Data"><b>${dataBR(x.data)}</b><br><small>${esc(x.hora)}</small></td><td data-label="Imóvel/Cliente">${esc(obra?.nome || 'Não encontrado')}<br><small>${esc(cm[obra?.clienteId] || '')}</small></td><td data-label="Serviço">${esc(x.tipo)}</td><td data-label="Responsável">${esc(x.responsavel || '—')}</td><td data-label="Status"><span class="status-badge agenda-${esc((x.status || '').toLowerCase().replace(/\s+/g, '-'))}">${esc(x.status)}</span></td><td data-label="Ações" class="act"><a href="#/agenda?e=${encodeURIComponent(x.id)}">Editar</a>${x.vistoriaId ? `<a href="#/vistoria/${encodeURIComponent(x.vistoriaId)}">Abrir vistoria</a>` : x.status !== 'Cancelada' ? `<a href="#" data-agenda-iniciar="${esc(x.id)}">Iniciar vistoria</a>` : ''}<a href="#" data-del="agendamentos:${esc(x.id)}">Excluir</a></td></tr>`; }).join('') || '<tr><td colspan="6">Nenhuma visita agendada.</td></tr>'}
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
    refresh();
  };
}
