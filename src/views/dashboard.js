// Visão geral (início): prioridades operacionais antes dos gráficos.
import { all } from '../core/db/index.js';
import { app, esc } from '../core/dom.js';
import { bannerMigracao } from '../core/migracao.js';
import { brl, dataBR, fmt } from '../core/utils.js';

const dataLocalISO = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export async function inicio() {
  const [c, o, v, ag, recs, anomalias] = await Promise.all([
    all('clientes'), all('obras'), all('vistorias'), all('agendamentos'), all('recebimentos'), all('anomalias')
  ]);
  const om = Object.fromEntries(o.map(x => [x.id, x]));
  const cm = Object.fromEntries(c.map(x => [x.id, x.nome]));
  const agora = new Date();
  const saudacao = agora.getHours() < 12 ? 'Bom dia' : agora.getHours() < 18 ? 'Boa tarde' : 'Boa noite';
  const dataExtenso = agora.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const hoje = dataLocalISO(agora);
  const emAndamento = v.filter(x => x.status !== 'assinada');
  const assinadas = v.filter(x => x.status === 'assinada');
  const visitasHoje = ag.filter(x => x.data === hoje && x.status !== 'Cancelada');
  const agendaHoje = [...visitasHoje].sort((a, b) => String(a.hora || '99:99').localeCompare(String(b.hora || '99:99')));
  const editavel = [...emAndamento].sort((a, b) => String(b.atualizado || b.criado || b.data || '').localeCompare(String(a.atualizado || a.criado || a.data || '')))[0];
  const naoConformes = v.reduce((n, x) => n + (x.itens || []).filter(i => i.status === 'N').length, 0);
  const semAvaliacao = v.reduce((n, x) => n + (x.itens || []).filter(i => !i.status).length, 0);
  const itensReprovados = v.flatMap(x => (x.itens || []).filter(i => i.status === 'N').map(item => ({ v: x, item })));
  const topReprovados = itensReprovados.slice(0, 4);
  const anomaliasAbertas = anomalias.filter(a => a.status !== 'Corrigida');
  const recentes = [...v].sort((a, b) => String(b.criado || b.data || '').localeCompare(String(a.criado || a.data || ''))).slice(0, 5);
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
  const temVistorias = vSem.some(n => n > 0);
  const temReceita = prevMes.some(n => n > 0) || recMes.some(n => n > 0);
  const statusClass = s => 'agenda-' + String(s || '').toLowerCase().replace(/\s+/g, '-');
  const obraNome = id => om[id]?.nome || 'Imóvel não informado';
  const evt = e => {
    if (e.tipo === 'agenda') { const obra = om[e.a.obraId]; return { icon: 'AG', txt: 'Visita agendada', sub: `${obra?.nome || 'Imóvel não encontrado'} · ${dataBR(e.a.data)} ${e.a.hora || ''}`.trim(), href: `#/agenda?e=${e.a.id}` }; }
    const obra = om[e.v.obraId];
    if (e.tipo === 'laudo') return { icon: 'AS', txt: 'Laudo assinado', sub: `${obra?.nome || 'Imóvel não encontrado'} · ${e.v.tipo}`, href: `#/laudo/${e.v.id}` };
    return { icon: 'VI', txt: 'Vistoria criada', sub: `${obra?.nome || 'Imóvel não encontrado'} · ${e.v.tipo}`, href: `#/vistoria/${e.v.id}` };
  };
  const kpi = (href, titulo, valor, detalhe, tone = '') => `<a class="kpi-card ${tone}" href="${href}"><span>${titulo}</span><strong>${valor}</strong><small>${detalhe}</small><i>Ver detalhes →</i></a>`;
  const migracao = await bannerMigracao();
  const pendenciaVazia = !v.length
    ? `<div class="empty-state compact"><p>Ainda não há vistorias. Crie a primeira para acompanhar pendências.</p><a class="btn ghost" href="#/vistorias">Criar vistoria</a></div>`
    : `<div class="empty-state compact"><p>${semAvaliacao ? `${semAvaliacao} item(ns) ainda sem avaliação.` : 'Nenhum item reprovado ou sem avaliação.'}${anomalias.length ? ` Há ${anomalias.length} anomalia(s) registrada(s), que são acompanhadas à parte.` : ''}</p><a class="btn ghost" href="#/vistorias">Ver vistorias</a></div>`;
  app.innerHTML = `<section class="dashboard-heading">
    <div><h2>${saudacao}</h2><p>${dataExtenso.charAt(0).toUpperCase() + dataExtenso.slice(1)}</p></div>
    <div class="dashboard-actions"><a class="btn" href="#/vistorias">+ Nova vistoria</a><a class="btn ghost" href="#/agenda?nova=1">Agendar visita</a><a class="btn ghost" href="#/clientes">Novo cliente</a><a class="btn ghost" href="#/obras">Novo imóvel</a></div>
  </section>
  ${editavel ? `<a class="dashboard-continue" href="#/vistoria/${editavel.id}" aria-label="Continuar vistoria ${esc(obraNome(editavel.obraId))}"><span class="continue-copy"><small class="continue-kicker">Retome de onde parou</small><strong>Continuar vistoria</strong><span>${esc(obraNome(editavel.obraId))} · ${esc(editavel.tipo)}${editavel.numeroLaudo ? ' · ' + esc(editavel.numeroLaudo) : ''}</span></span><span class="continue-action" aria-hidden="true">Abrir →</span></a>` : ''}
  ${migracao}
  <section class="kpi-grid" aria-label="Resumo operacional">
    ${kpi('#/agenda', 'Visitas de hoje', visitasHoje.length, visitasHoje.length ? visitasHoje.map(x => x.hora).filter(Boolean).join(' e ') : 'Nenhuma visita agendada')}
    ${kpi('#/vistorias', 'Vistorias em andamento', emAndamento.length, editavel ? 'Última: ' + esc(obraNome(editavel.obraId)) : 'Nenhuma vistoria pendente')}
    ${kpi('#/vistorias', 'Laudos assinados', assinadas.length, assinadas.length ? 'Documentos finalizados' : 'Nenhum laudo assinado', 'success')}
    ${kpi('#/clientes', 'Clientes', c.length, `${o.length} imóvel(is) ou obra(s) vinculados`)}
  </section>
  <section class="dashboard-grid dashboard-priority">
    <div class="card dashboard-recent"><div class="section-heading"><div><h3>Vistorias recentes</h3><p>Acompanhe os últimos registros do sistema.</p></div><a href="#/vistorias">Ver todas →</a></div>
      ${recentes.length ? `<table class="responsive-table"><thead><tr><th>Data</th><th>Imóvel/Obra</th><th>Tipo</th><th>Status</th></tr></thead><tbody>
      ${recentes.map(x => `<tr><td data-label="Data">${esc(dataBR(x.data))}</td><td data-label="Imóvel/Obra"><a href="#/vistoria/${x.id}">${esc(obraNome(x.obraId))}</a></td><td data-label="Tipo">${esc(x.tipo)}</td><td data-label="Status"><span class="status-badge ${x.status === 'assinada' ? 'signed' : 'draft'}">${x.status === 'assinada' ? 'Assinada' : 'Em andamento'}</span></td></tr>`).join('')}
      </tbody></table>` : `<div class="empty-state"><p>Nenhuma vistoria cadastrada ainda.</p><a class="btn ghost" href="#/vistorias">Criar primeira vistoria</a></div>`}
    </div>
    <aside class="card dashboard-today">
      <div class="section-heading"><div><h3>Agenda do dia</h3><p>Visitas de hoje.</p></div><a href="#/agenda">Ver agenda →</a></div>
      ${agendaHoje.length ? `<div class="agenda-mini">${agendaHoje.map(x => { const obra = om[x.obraId]; return `<a class="agenda-mini-item" href="#/agenda?e=${encodeURIComponent(x.id)}"><span class="agenda-mini-when"><b>${dataBR(x.data)}</b><small>${esc(x.hora || '—')}</small></span><span class="agenda-mini-info"><b>${esc(obra?.nome || 'Imóvel não encontrado')}</b><small>${esc(cm[obra?.clienteId] || '')} · ${esc(x.tipo)}</small></span><span class="status-badge ${statusClass(x.status)}">${esc(x.status)}</span></a>`; }).join('')}</div>` : `<div class="empty-state compact"><p>Nenhuma visita agendada para hoje.</p><a class="btn ghost" href="#/agenda?nova=1">Agendar visita</a></div>`}
    </aside>
  </section>
  <section class="card dashboard-pending" aria-labelledby="pend-titulo">
    <div class="section-heading"><div><h3 id="pend-titulo">Pendências</h3><p>O que precisa de atenção nos checklists e nos registros de anomalias.</p></div><a href="#/vistorias">Ver vistorias →</a></div>
    <div class="pending-layout">
      <div>
        <div class="pending-stats">
          <a class="pending-stat" href="#/vistorias"><strong>${naoConformes}</strong><span>Não conformidades</span><small>itens reprovados do checklist</small></a>
          <a class="pending-stat" href="#/vistorias"><strong>${semAvaliacao}</strong><span>Sem avaliação</span><small>itens ainda a preencher</small></a>
          <div class="pending-stat neutral"><strong>${anomalias.length}</strong><span>Anomalias</span><small>${anomaliasAbertas.length} em aberto · registros à parte</small></div>
        </div>
        ${topReprovados.length ? `<ul class="pending-list">${topReprovados.map(({ v: pv, item }) => `<li class="pending-item"><a href="#/vistoria/${pv.id}"><b>${esc(item.desc)}</b><small>${esc(obraNome(pv.obraId))} · ${esc(pv.tipo)}${pv.numeroLaudo ? ' · ' + esc(pv.numeroLaudo) : ''}</small></a><span class="status-badge danger">Não conforme</span></li>`).join('')}${itensReprovados.length > topReprovados.length ? `<li class="pending-more"><a href="#/vistorias">+ ${itensReprovados.length - topReprovados.length} outra(s) não conformidade(s) →</a></li>` : ''}</ul>` : pendenciaVazia}
      </div>
      <aside class="pending-side">
        <h4>Checklist ≠ anomalias</h4>
        <p><b>Não conformidade</b> é um item do checklist marcado como Reprovado ou Não conforme. <b>Anomalia</b> é um registro próprio, com gravidade, foto e status, que pode ou não estar ligado a um item.</p>
        <p>Os totais não se somam: uma vistoria pode ter uma não conformidade e várias anomalias, ou uma anomalia sem item reprovado.</p>
        <a href="#/vistorias">Revisar vistorias →</a>
      </aside>
    </div>
  </section>
  <section class="dashboard-grid dashboard-charts">
    <div class="card dashboard-chart-card">
      <div class="section-heading"><div><h3>Vistorias por semana</h3><p>Últimas 5 semanas.</p></div><a href="#/vistorias">Ver vistorias →</a></div>
      ${temVistorias ? `<div class="chart" role="img" aria-label="Vistorias por semana">${semanas.map((s, i) => `<div class="chart-col"><div class="bars"><span class="bar" style="height:${Math.round(vSem[i] / maxV * 100)}%" title="${vSem[i]} vistoria(s)"></span></div><b>${vSem[i]}</b><small>${s.label}</small></div>`).join('')}</div>` : `<div class="empty-state chart-empty"><p>Ainda não há vistorias nas últimas 5 semanas.</p><a class="btn ghost" href="#/vistorias">Criar vistoria</a></div>`}
    </div>
    <aside class="card dashboard-chart-card">
      <div class="section-heading"><div><h3>Receita prevista × recebida</h3><p>Últimos 6 meses.</p></div><a href="#/financeiro">Ver financeiro →</a></div>
      ${temReceita ? `<div class="chart" role="img" aria-label="Receita prevista e recebida por mês">${meses.map((x, i) => `<div class="chart-col"><div class="bars"><span class="bar" style="height:${Math.round(prevMes[i] / maxR * 100)}%" title="Prevista ${brl(prevMes[i])}"></span><span class="bar alt" style="height:${Math.round(recMes[i] / maxR * 100)}%" title="Recebida ${brl(recMes[i])}"></span></div><small>${x.label}</small></div>`).join('')}</div><div class="chart-legend"><span><i class="lg-prev"></i>Prevista</span><span><i class="lg-rec"></i>Recebida</span></div>` : `<div class="empty-state chart-empty"><p>Nenhum lançamento previsto ou recebido nos últimos 6 meses.</p><a class="btn ghost" href="#/financeiro">Abrir financeiro</a></div>`}
    </aside>
  </section>
  <section class="dashboard-grid dashboard-secondary">
    <aside class="card dashboard-activity">
      <div class="section-heading"><div><h3>Atividades recentes</h3><p>Últimos movimentos no sistema.</p></div></div>
      ${ultimas.length ? `<ol class="timeline">${ultimas.map(e => { const d = evt(e); return `<li><span class="tl-code">${d.icon}</span><div><a href="${d.href}">${esc(d.txt)}</a><small>${esc(d.sub)}</small><em>${fmt(e.ts)}</em></div></li>`; }).join('')}</ol>` : `<div class="empty-state compact"><p>Nenhuma atividade registrada ainda.</p><a class="btn ghost" href="#/vistorias">Começar uma vistoria</a></div>`}
    </aside>
    <aside class="card dashboard-summary"><div class="section-heading"><div><h3>Estrutura da base</h3><p>Cadastros usados nas vistorias.</p></div></div>
      <a href="#/clientes"><span>Clientes cadastrados</span><b>${c.length}</b></a>
      <a href="#/obras"><span>Imóveis e obras</span><b>${o.length}</b></a>
      <a href="#/cadastros"><span>Gerenciar cadastros auxiliares</span><b>→</b></a>
      <a href="#/backup"><span>Exportar cópia de segurança</span><b>→</b></a>
    </aside>
  </section>`;
}
