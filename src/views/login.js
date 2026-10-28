// Tela de login e mensagens de erro do Firebase Auth.
import { VERSION } from '../core/config.js';
import { $, app } from '../core/dom.js';
import { F, auth } from '../core/state.js';

const msgAuth = err => ({
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/wrong-password': 'E-mail ou senha incorretos.',
  'auth/user-not-found': 'E-mail ou senha incorretos.',
  'auth/invalid-email': 'E-mail inválido.',
  'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
  'auth/network-request-failed': 'Sem conexão com a internet.',
  'auth/user-disabled': 'Este usuário foi desativado.'
}[err.code] || 'Não foi possível entrar (' + (err.code || err.message) + ').');

export function mostrarLogin() {
  document.body.classList.add('deslogado');
  const conectado = navigator.onLine;
  app.innerHTML = `<div class="login-layout">
    <section class="login-showcase" aria-label="Apresentação do sistema">
      <div class="login-brand"><img src="logo-emblema.png" alt=""><span><b>VISTORI</b><i>ENGENHARIA</i></span></div>
      <div class="login-copy"><h1>Vistorias, laudos e obras organizados do campo ao escritório.</h1>
      <p>Checklists que funcionam sem internet, fotos organizadas e laudos com verificação de integridade.</p></div>
      <div class="login-feature"><span>VI</span><div><b>Trabalho de campo sem interrupções</b><small>Os registros ficam salvos no aparelho e sincronizam quando a conexão voltar.</small></div></div>
      <small class="login-version">v${VERSION} · ambiente seguro</small>
    </section>
    <section class="login-panel">
      <div class="login-form-wrap">
        <div class="login-mobile-brand"><img src="logo-emblema.png" alt=""><b>VISTORI</b></div>
        <div><h2>Entrar</h2><p>Acesse com o e-mail cadastrado pela sua empresa.</p></div>
        <div class="login-error" id="lerr" role="alert" aria-live="polite" hidden></div>
        <form id="lf" class="login-form">
          <label for="login-email">E-mail</label><input id="login-email" type="email" name="email" required autocomplete="username">
          <label for="login-senha">Senha</label><input id="login-senha" type="password" name="senha" required autocomplete="current-password">
          <div class="login-options"><label class="check-label"><input type="checkbox" checked> Manter conectado neste aparelho</label><a href="#" id="esqueci">Esqueci minha senha</a></div>
          <button class="btn login-submit" id="loginBtn">Entrar</button>
        </form>
        <div class="login-network ${conectado ? '' : 'offline'}"><span></span><div><b>${conectado ? 'Conectado' : 'Sem conexão'}</b><small>Vistorias baixadas neste aparelho podem ser preenchidas offline e sincronizadas depois.</small></div></div>
      </div>
    </section>
  </div>`;
  const erro = m => { const x = $('#lerr'); x.textContent = m; x.hidden = false; };
  $('#lf').onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const btn = $('#loginBtn'); btn.disabled = true; btn.textContent = 'Entrando…';
    try { await F.signInWithEmailAndPassword(auth, fd.get('email').trim(), fd.get('senha')); }
    catch (err) { erro(msgAuth(err)); btn.disabled = false; btn.textContent = 'Entrar'; }
  };
  $('#esqueci').onclick = async e => {
    e.preventDefault();
    const em = $('#lf').elements.email.value.trim();
    if (!em) return erro('Digite seu e-mail no campo acima e clique de novo.');
    try { await F.sendPasswordResetEmail(auth, em); alert('Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.'); }
    catch (err) { erro(msgAuth(err)); }
  };
}
