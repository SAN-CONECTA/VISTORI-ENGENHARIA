// Painel LGPD: consentimento, exportação e anonimização.
import { VERSION } from '../core/config.js';
import { all, put } from '../core/db/index.js';
import { $, app, esc } from '../core/dom.js';
import { refresh } from '../core/navigate.js';

export async function lgpd() {
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
    refresh();
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
    else if (a.dataset.lgpd === 'consentir') { const c = cls.find(x => x.id === id); if (c) { await put('clientes', { ...c, consentimento: new Date().toISOString() }); refresh(); } }
  });
}
