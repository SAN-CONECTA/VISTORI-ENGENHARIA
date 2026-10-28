// Exportação e restauração de backup.
import { MODO, STORES, VERSION } from '../core/config.js';
import { all, del, put } from '../core/db/index.js';
import { $, app } from '../core/dom.js';
import { bannerMigracao } from '../core/migracao.js';
import { refresh } from '../core/navigate.js';

export async function backup() {
  const nuvem = MODO !== 'local';
  app.innerHTML = `<h2>Backup</h2>
  ${nuvem ? '<div class="ok">Seus dados já estão na nuvem. Mesmo assim, exporte um backup de vez em quando: é a sua cópia fora do Firebase.</div>' : '<div class="warn">Os dados ficam só neste aparelho/navegador. Exporte com frequência.</div>'}
  ${await bannerMigracao()}
  <div class="card"><button class="btn" id="exp">Exportar backup (.json)</button>
  <label>Restaurar backup (${nuvem ? 'APAGA e substitui os dados da nuvem' : 'substitui tudo'})</label><input type="file" id="imp" accept=".json"></div>`;
  $('#exp').onclick = async () => {
    const d = { versao: VERSION, quando: new Date().toISOString() };
    for (const s of STORES) d[s] = await all(s);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(d)], { type: 'application/json' }));
    a.download = `vistori-backup-${d.quando.slice(0, 10)}.json`;
    a.click();
  };
  $('#imp').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    let d; try { d = JSON.parse(await f.text()); } catch { return alert('Arquivo inválido.'); }
    if (nuvem && !navigator.onLine) return alert('Conecte-se à internet para restaurar na nuvem.');
    const ok = nuvem ? prompt('Isso APAGA TODOS os dados da nuvem e restaura o arquivo. Digite SUBSTITUIR para continuar.') === 'SUBSTITUIR'
      : confirm('Isso SUBSTITUI todos os dados atuais. Continuar?');
    if (!ok) return;
    // A trilha de auditoria é imutável: não é apagada nem substituída na restauração.
    for (const s of STORES) { if (s === 'auditoria') continue; for (const x of await all(s)) await del(s, x.id); for (const x of d[s] || []) await put(s, x, nuvem); }
    alert('Restaurado.'); location.hash = '#/'; refresh();
  };
}
