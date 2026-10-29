// Roteador: resolve o hash da URL, marca o menu e desenha a tela.
import { CAD } from './core/config.js';
import { B, setCurV, setPad } from './core/state.js';
import { $, app, esc, responsiveTables } from './core/dom.js';
import { setRenderer } from './core/navigate.js';
import { closeNav, sincronizarGruposNav } from './ui/chrome.js';
import { inicio } from './views/dashboard.js';
import { agenda } from './views/agenda.js';
import { cadastros, clientes, cliente, obras, fornecedores, tiposServico, catalogo, precos } from './views/cadastros.js';
import { vistorias } from './views/vistorias.js';
import { vistoria } from './views/vistoria.js';
import { laudo } from './views/laudo.js';
import { orcamentos, orcamento } from './views/orcamentos.js';
import { financeiro, recibo } from './views/financeiro.js';
import { checklist } from './views/checklist.js';
import { modelos } from './views/modelos.js';
import { documentos } from './views/documentos.js';
import { lgpd } from './views/lgpd.js';
import { usuarios } from './views/usuarios.js';
import { configuracoes } from './views/configuracoes.js';
import { lixeira } from './views/lixeira.js';
import { auditoria } from './views/auditoria.js';
import { backup } from './views/backup.js';

export async function render() {
  if (!B) return;
  setCurV(null); setPad(null);
  const [path, q] = (location.hash.slice(2) || '').split('?');
  const [r, arg] = path.split('/');
  const navKey = ['clientes', 'obras'].includes(r) ? r : CAD.includes(r) ? 'cadastros' : r === 'vistoria' || r === 'laudo' ? 'vistorias' : r === 'cliente' ? 'clientes' : r === 'orcamento' ? 'orcamentos' : r === 'recibo' ? 'financeiro' : r;
  document.querySelectorAll('#nav a').forEach(a => {
    const on = a.getAttribute('href') === `#/${navKey}`;
    a.classList.toggle('on', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  sincronizarGruposNav();
  const titles = { '': 'Visão geral', agenda: 'Agenda', cadastros: 'Cadastros', clientes: 'Clientes', cliente: 'Ficha do cliente', obras: 'Imóveis e obras', fornecedores: 'Fornecedores', tipos: 'Tipos de serviço', catalogo: 'Catálogo de itens', precos: 'Tabela de preços', vistorias: 'Vistorias', vistoria: 'Detalhe da vistoria', laudo: 'Laudo técnico', orcamentos: 'Orçamentos', orcamento: 'Proposta comercial', financeiro: 'Financeiro', recibo: 'Recibo', checklist: 'Checklist genérico', modelos: 'Modelos de checklist', documentos: 'Documentos', lgpd: 'LGPD e privacidade', usuarios: 'Usuários e acessos', configuracoes: 'Configurações', lixeira: 'Lixeira', auditoria: 'Auditoria', backup: 'Backup' };
  $('#page-title').textContent = titles[r] || 'Visão geral';
  closeNav();
  const R = { '': inicio, agenda, cadastros, clientes, cliente: () => cliente(arg), obras, fornecedores, tipos: tiposServico, catalogo, precos, vistorias, vistoria: () => vistoria(arg), laudo: () => laudo(arg), orcamentos, orcamento: () => orcamento(arg), financeiro, recibo: () => recibo(arg), checklist, modelos, documentos, lgpd, usuarios, configuracoes, lixeira, auditoria, backup };
  try { await (R[r] || inicio)(q); responsiveTables(); }
  catch (err) {
    console.error(err);
    app.innerHTML = err.code === 'permission-denied'
      ? '<div class="warn"><b>Sem permissão.</b> Este e-mail não está autorizado a acessar os dados. Peça a um administrador para autorizá-lo em <b>Usuários e acessos</b> (a lista depende das regras do Firestore publicadas no Firebase Console).</div>'
      : `<div class="warn">Erro: ${esc(err.message)}</div>`;
  }
}

setRenderer(render);
addEventListener('hashchange', render);
