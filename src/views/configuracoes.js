// Configurações da empresa e numeração.
import { UFS } from '../core/config.js';
import { get, put } from '../core/db/index.js';
import { $, app, esc, fieldHtml } from '../core/dom.js';
import { refresh } from '../core/navigate.js';
import { comprimir } from '../core/utils.js';

export async function configuracoes() {
  const [emp, num] = await Promise.all([get('config', 'empresa'), get('config', 'numeracao')]);
  const e = emp || {};
  const anoAtual = new Date().getFullYear();
  const n = num || { prefixo: 'VST', proximo: 1, ano: anoAtual };
  let logoData = e.logo || '';
  app.innerHTML = `<section class="section-heading client-head"><div><h2>Configurações</h2><p>Dados da empresa, identidade dos documentos e numeração de laudos.</p></div></section>
  <form id="cfg-emp" class="card grid">
    <h3 style="grid-column:1/-1">Dados da empresa</h3>
    ${fieldHtml({ k: 'razao', l: 'Razão social' }, e.razao || 'VISTORI ENGENHARIA')}
    ${fieldHtml({ k: 'cnpj', l: 'CNPJ' }, e.cnpj || '')}
    ${fieldHtml({ k: 'endereco', l: 'Endereço' }, e.endereco || '')}
    ${fieldHtml({ k: 'cidade', l: 'Cidade' }, e.cidade || '')}
    ${fieldHtml({ k: 'uf', l: 'UF', opts: UFS.map(u => [u, u]) }, e.uf || '')}
    ${fieldHtml({ k: 'telefone', l: 'Telefone' }, e.telefone || '')}
    ${fieldHtml({ k: 'email', l: 'E-mail' }, e.email || '')}
    ${fieldHtml({ k: 'site', l: 'Site' }, e.site || '')}
    ${fieldHtml({ k: 'retencao', l: 'Retenção de dados (anos)', type: 'number' }, e.retencao || 10)}
    <h3 style="grid-column:1/-1">Identidade dos documentos</h3>
    <div><label>Logotipo</label><input type="file" id="cfg-logo" accept="image/*"><small>${e.logo ? 'Logotipo personalizado ativo.' : 'Usando o logotipo padrão.'}</small></div>
    ${fieldHtml({ k: 'cor1', l: 'Cor primária (destaques)', type: 'color' }, e.cor1 || '#256e71')}
    ${fieldHtml({ k: 'cor2', l: 'Cor secundária (destaques)', type: 'color' }, e.cor2 || '#b78c47')}
    <div class="row" style="grid-column:1/-1"><button class="btn">Salvar dados da empresa</button></div>
  </form>
  <form id="cfg-num" class="card grid">
    <h3 style="grid-column:1/-1">Numeração de laudos</h3>
    ${fieldHtml({ k: 'prefixo', l: 'Prefixo', req: 1 }, n.prefixo || 'VST')}
    ${fieldHtml({ k: 'proximo', l: 'Próximo número', req: 1, type: 'number' }, n.proximo || 1)}
    ${fieldHtml({ k: 'ano', l: 'Ano', req: 1, type: 'number' }, n.ano || anoAtual)}
    <p style="grid-column:1/-1">Próximo laudo: <b>${esc((n.prefixo || 'VST') + '-' + (n.ano || anoAtual) + '-' + String(n.proximo || 1).padStart(4, '0'))}</b> · a numeração reinicia a cada ano.</p>
    <div class="row" style="grid-column:1/-1"><button class="btn">Salvar numeração</button></div>
  </form>`;
  const logo = $('#cfg-logo');
  if (logo) logo.onchange = async ev => { const f = ev.target.files[0]; if (f) { logoData = await comprimir(f); alert('Logotipo carregado. Clique em "Salvar dados da empresa" para aplicar.'); } };
  const fe = $('#cfg-emp');
  if (fe) fe.onsubmit = async ev => {
    ev.preventDefault();
    const d = Object.fromEntries(new FormData(fe));
    await put('config', { id: 'empresa', ...d, logo: logoData, retencao: Number(d.retencao) || 10 });
    alert('Dados da empresa salvos.');
    refresh();
  };
  const fn = $('#cfg-num');
  if (fn) fn.onsubmit = async ev => {
    ev.preventDefault();
    const d = Object.fromEntries(new FormData(fn));
    await put('config', { id: 'numeracao', prefixo: (d.prefixo || 'VST').trim(), proximo: Number(d.proximo) || 1, ano: Number(d.ano) || anoAtual });
    alert('Numeração salva.');
    refresh();
  };
}
