// Visão geral (início).
import { MODO } from '../core/config.js';
import { all } from '../core/db/index.js';
import { app, esc } from '../core/dom.js';
import { bannerMigracao } from '../core/migracao.js';
import { brl, dataBR, fmt } from '../core/utils.js';

export async function inicio() {
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
      <table class="responsive-table"><thead><tr><th>Data</th><th>Imóvel/Obra</th><th>Tipo</th><th>Status</th></tr></thead><tbody>
      ${recentes.map(x => `<tr><td data-label="Data">${esc(dataBR(x.data))}</td><td data-label="Imóvel/Obra"><a href="#/vistoria/${x.id}">${esc(om[x.obraId]?.nome || 'Não informado')}</a></td><td data-label="Tipo">${esc(x.tipo)}</td><td data-label="Status"><span class="status-badge ${x.status === 'assinada' ? 'signed' : 'draft'}">${x.status === 'assinada' ? 'Assinada' : 'Em andamento'}</span></td></tr>`).join('') || '<tr><td colspan="4">Nenhuma vistoria cadastrada. Use o botão Nova vistoria para começar.</td></tr>'}
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
