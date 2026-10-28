// Registro da trilha de auditoria.
import { put } from './db/index.js';
import { USER } from './state.js';
import { uid } from './utils.js';

export async function auditar(acao, entidade, refId, detalhe) {
  try { await put('auditoria', { id: uid(), em: new Date().toISOString(), por: USER?.email || 'local', acao, entidade, refId: refId || '', detalhe: detalhe || '' }); } catch (e) {}
}
