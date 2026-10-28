// Usuários e acessos.
import { MODO } from '../core/config.js';
import { all, put } from '../core/db/index.js';
import { $, app, esc, fieldHtml } from '../core/dom.js';
import { refresh } from '../core/navigate.js';
import { USER } from '../core/state.js';

export async function usuarios() {
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
    refresh();
  };
}
