// Moldura da aplicação: sidebar, tema, atalhos, busca e barra do usuário.
import { MODO } from '../core/config.js';
import { $, esc } from '../core/dom.js';
import { USER } from '../core/state.js';

export function userBox() {
  const el = $('#userbox'); if (!el) return;
  const sync = $('#syncbox');
  const banner = $('#offline-banner');
  const online = navigator.onLine;
  const local = MODO === 'local';
  if (sync) {
    sync.classList.toggle('offline', !online && !local);
    sync.classList.toggle('local', local);
    sync.textContent = local ? 'Modo local' : online ? 'Sincronizado' : 'Offline';
    sync.title = local
      ? 'Dados salvos somente neste aparelho; não há sincronização.'
      : online
        ? 'Conectado à nuvem. As alterações são sincronizadas automaticamente.'
        : 'Sem conexão. As alterações ficam neste aparelho e serão sincronizadas quando a rede voltar.';
    sync.setAttribute('aria-label', `${sync.textContent}. ${sync.title}`);
  }
  if (banner) banner.hidden = local || online;
  el.innerHTML = local ? '<span class="tag">Ambiente de teste</span>'
    : USER ? `<small>${esc(USER.email)}</small>${MODO === 'nuvem' ? '<a href="#" id="sair">Sair</a>' : ''}` : '';
}
addEventListener('online', userBox);
addEventListener('offline', userBox);
addEventListener('focus', userBox);
document.addEventListener('visibilitychange', () => { if (!document.hidden) userBox(); });

const nav = $('#nav');
const navToggle = $('#nav-toggle');
const sidebar = $('#sidebar');
const navBackdrop = $('#nav-backdrop');
const sidebarToggle = $('#sidebar-toggle');
const themeToggle = $('#theme-toggle');
const navSearch = $('#nav-search');

const temaInicial = localStorage.getItem('vistori_tema_v2') || 'light';
document.documentElement.dataset.theme = temaInicial;
if (themeToggle) themeToggle.addEventListener('click', () => {
  const novo = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = novo;
  localStorage.setItem('vistori_tema_v2', novo);
});

document.body.classList.toggle('sidebar-collapsed', localStorage.getItem('vistori_menu_recolhido') === '1');
function syncSidebar() {
  if (!sidebarToggle) return;
  const c = document.body.classList.contains('sidebar-collapsed');
  sidebarToggle.setAttribute('aria-label', c ? 'Expandir menu' : 'Recolher menu');
  const lbl = sidebarToggle.querySelector('.nav-label'); if (lbl) lbl.textContent = c ? 'Expandir menu' : 'Recolher menu';
}
syncSidebar();
if (sidebarToggle) sidebarToggle.addEventListener('click', () => {
  const collapsed = document.body.classList.toggle('sidebar-collapsed');
  localStorage.setItem('vistori_menu_recolhido', collapsed ? '1' : '0');
  syncSidebar();
});

/* ---------- grupos do menu: preferência por usuário ---------- */
const GRUPOS_KEY = 'vistori_nav_grupos_v1';
const GRUPOS_PADRAO = { operacoes: true, comercial: true, admin: false };
function lerGrupos() {
  try {
    const salvo = JSON.parse(localStorage.getItem(GRUPOS_KEY) || 'null');
    return salvo && typeof salvo === 'object' ? { ...GRUPOS_PADRAO, ...salvo } : { ...GRUPOS_PADRAO };
  } catch (e) {
    return { ...GRUPOS_PADRAO };
  }
}
let gruposAbertos = lerGrupos();
function salvarGrupos() {
  try { localStorage.setItem(GRUPOS_KEY, JSON.stringify(gruposAbertos)); } catch (e) {}
}

/** Aplica as preferências e mantém o grupo da página atual aberto. */
export function sincronizarGruposNav() {
  let mudou = false;
  document.querySelectorAll('.nav-group').forEach(g => {
    const chave = g.dataset.group || '';
    const ativo = !!g.querySelector('a.on');
    g.classList.toggle('has-active', ativo);
    const aberto = ativo || gruposAbertos[chave] !== false;
    g.classList.toggle('is-collapsed', !aberto);
    const btn = g.querySelector('.nav-group-btn');
    if (btn) {
      btn.setAttribute('aria-expanded', String(aberto));
      btn.title = ativo ? 'Grupo da página atual' : '';
    }
    // Ao entrar em uma página, o grupo dela passa a ser uma preferência aberta.
    if (ativo && gruposAbertos[chave] !== true) { gruposAbertos[chave] = true; mudou = true; }
  });
  if (mudou) salvarGrupos();
}
sincronizarGruposNav();

document.querySelectorAll('.nav-group-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const g = btn.closest('.nav-group');
    const chave = g.dataset.group || '';
    // O grupo da página atual permanece aberto; para recolhê-lo, saia da página.
    if (g.classList.contains('has-active') && !g.classList.contains('is-collapsed')) return;
    const fechado = g.classList.toggle('is-collapsed');
    btn.setAttribute('aria-expanded', String(!fechado));
    gruposAbertos[chave] = !fechado;
    salvarGrupos();
  });
});

const navTip = document.createElement('div');
navTip.id = 'nav-tip'; navTip.className = 'nav-tip'; navTip.setAttribute('role', 'tooltip'); navTip.hidden = true;
document.body.appendChild(navTip);
function mostrarTip(el) {
  if (!document.body.classList.contains('sidebar-collapsed') || innerWidth <= 900) return;
  const label = el.dataset.label || el.querySelector('.nav-label')?.textContent || el.getAttribute('aria-label');
  if (!label) return;
  const r = el.getBoundingClientRect();
  navTip.textContent = label;
  navTip.style.left = (r.right + 10) + 'px';
  navTip.style.top = (r.top + r.height / 2) + 'px';
  navTip.hidden = false;
}
function esconderTip() { navTip.hidden = true; }
document.querySelectorAll('#nav a, .nav-search').forEach(el => {
  el.addEventListener('mouseenter', () => mostrarTip(el));
  el.addEventListener('mouseleave', esconderTip);
  el.addEventListener('focus', () => mostrarTip(el));
  el.addEventListener('blur', esconderTip);
});

nav.addEventListener('keydown', e => {
  const links = [...nav.querySelectorAll('a')].filter(a => !a.closest('.nav-group.is-collapsed'));
  const i = links.indexOf(document.activeElement);
  if (e.key === 'ArrowDown') { e.preventDefault(); (links[i + 1] || links[0])?.focus(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); (links[i - 1] || links[links.length - 1])?.focus(); }
  else if (e.key === 'Home') { e.preventDefault(); links[0]?.focus(); }
  else if (e.key === 'End') { e.preventDefault(); links[links.length - 1]?.focus(); }
});

export function closeNav() {
  sidebar.classList.remove('open');
  document.body.classList.remove('nav-open');
  navToggle.setAttribute('aria-expanded', 'false');
  navToggle.setAttribute('aria-label', 'Abrir menu');
}
navToggle.addEventListener('click', () => {
  const open = sidebar.classList.toggle('open');
  document.body.classList.toggle('nav-open', open);
  navToggle.setAttribute('aria-expanded', String(open));
  navToggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
  if (open) {
    const alvo = nav.querySelector('a.on') || nav.querySelector('a');
    setTimeout(() => alvo?.focus({ preventScroll: true }), 0);
  }
});
nav.addEventListener('click', e => { if (e.target.closest('a')) closeNav(); });
navBackdrop.addEventListener('click', () => { closeNav(); navToggle.focus(); });
addEventListener('resize', () => { if (innerWidth > 900) closeNav(); });
addEventListener('keydown', e => {
  if (e.key !== 'Escape' || document.body.classList.contains('cmdk-open')) return;
  const estavaAberto = sidebar.classList.contains('open');
  closeNav();
  if (estavaAberto) navToggle.focus();
});

/* ---------- busca de módulos (Ctrl+K) ---------- */
(function initCmdk() {
  const box = $('#cmdk'), input = $('#cmdk-input'), list = $('#cmdk-list');
  if (!box || !input || !list) return;
  const mods = [...document.querySelectorAll('#nav a')].map(a => ({
    href: a.getAttribute('href'),
    label: a.dataset.label || a.textContent.trim(),
    group: a.closest('.nav-group')?.querySelector('.nav-group-btn .nav-label')?.textContent || '',
    ico: a.querySelector('.nav-ico')?.innerHTML || ''
  }));
  let atual = mods, idx = 0;
  const render = q => {
    const t = q.toLowerCase().trim();
    atual = mods.filter(m => !t || (m.label + ' ' + m.group).toLowerCase().includes(t));
    idx = 0;
    list.innerHTML = atual.map((m, i) => `<li role="option" class="cmdk-item ${i === 0 ? 'sel' : ''}" data-href="${m.href}" aria-selected="${i === 0}"><span class="cmdk-ico">${m.ico}</span><span class="cmdk-txt"><b>${m.label}</b><small>${m.group}</small></span><span class="cmdk-go">↵</span></li>`).join('') || '<li class="cmdk-empty">Nenhum módulo encontrado.</li>';
  };
  const abrir = () => { box.hidden = false; document.body.classList.add('cmdk-open'); input.value = ''; render(''); input.focus(); };
  const fechar = () => { box.hidden = true; document.body.classList.remove('cmdk-open'); };
  const mover = d => {
    if (!atual.length) return;
    idx = (idx + d + atual.length) % atual.length;
    list.querySelectorAll('.cmdk-item').forEach((el, i) => { el.classList.toggle('sel', i === idx); el.setAttribute('aria-selected', String(i === idx)); });
    list.querySelectorAll('.cmdk-item')[idx]?.scrollIntoView({ block: 'nearest' });
  };
  const ir = href => { if (!href) return; fechar(); location.hash = href; };
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); box.hidden ? abrir() : fechar(); return; }
    if (box.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); fechar(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); mover(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); mover(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); ir(atual[idx]?.href); }
  });
  input.addEventListener('input', () => render(input.value));
  list.addEventListener('click', e => { const li = e.target.closest('[data-href]'); if (li) ir(li.dataset.href); });
  box.addEventListener('click', e => { if (e.target.closest('[data-cmdk-close]')) fechar(); });
  if (navSearch) navSearch.addEventListener('click', abrir);
})();
