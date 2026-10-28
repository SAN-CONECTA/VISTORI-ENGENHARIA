// Migração dos dados locais de versões antigas para a nuvem.
import { MODO, STORES_DADOS } from './config.js';
import { L } from './db/local.js';
import { B, USER } from './state.js';
import { uid } from './utils.js';

const migFlag = () => 'vistori_migrado_' + (USER?.uid || 'teste');
async function contaLocal() {
  let n = 0;
  for (const s of STORES_DADOS) n += (await L.all(s)).length;
  return n;
}
export async function bannerMigracao() {
  if (MODO === 'local' || localStorage.getItem(migFlag())) return '';
  const n = await contaLocal();
  if (!n) return '';
  return `<div class="warn"><b>${n} registro(s)</b> de versões anteriores estão salvos só neste aparelho.
  <div><button class="btn" id="migrar">Enviar para a nuvem</button></div><small>Precisa de internet. Não apaga nada deste aparelho.</small></div>`;
}
export async function migrarLocal(prog) {
  let n = 0;
  const passo = () => { n++; if (prog && n % 5 === 0) prog(n); };
  // lixeira/auditoria só existem a partir da v0.15 (não há dados antigos para migrar).
  for (const s of ['clientes', 'obras', 'versoes', 'anomalias', 'documentos', 'agendamentos', 'orcamentos', 'recebimentos', 'fornecedores', 'tipos', 'catalogo', 'precos', 'config', 'checklistModelos']) for (const x of await L.all(s)) { await B.put(s, x, true); passo(); }
  for (const f of await L.all('fotos')) { await B.put('fotos', f, true); passo(); }
  for (const v of await L.all('vistorias')) {
    for (const it of v.itens || []) {
      it.fotos = await Promise.all((it.fotos || []).map(async f => {
        if (!f.src) return f;
        const id = uid();
        await B.put('fotos', { id, vistoriaId: v.id, src: f.src }, true);
        return { id, legenda: f.legenda || '' };
      }));
    }
    await B.put('vistorias', v, true); passo();
  }
  localStorage.setItem(migFlag(), '1');
  return n;
}
