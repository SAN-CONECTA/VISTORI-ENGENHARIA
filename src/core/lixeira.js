// Expurgo definitivo do que está na lixeira.
import { auditar } from './auditoria.js';
import { del, get } from './db/index.js';
import { labelReg } from './utils.js';

export async function excluirLixeira(tid) {
  const it = await get('lixeira', tid);
  if (!it) return;
  for (const fid of (it.extras && it.extras.fotos) || []) await del('fotos', fid);
  for (const pid of (it.extras && it.extras.precos) || []) await del('precos', pid);
  await auditar('Excluiu definitivamente', it.store, it.refId, labelReg(it.data));
  await del('lixeira', tid);
}
