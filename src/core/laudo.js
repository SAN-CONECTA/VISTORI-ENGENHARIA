// Hash de assinatura do laudo e numeração sequencial.
import { get, put } from './db/index.js';
import { fotosSha } from './fotos.js';
import { canon, sha } from './utils.js';

// O hash cobre o conteúdo do laudo. `numeroLaudo`, `versao` e `cienciaCliente`
// são gravados depois da assinatura (e a ciência pode ser registrada até depois
// de assinar), por isso ficam fora do cálculo. `metadados: true` reproduz o
// cálculo antigo (que os incluía) para conferir laudos assinados antes da 0.16.1.
export async function calcHash(v, ts, { metadados = false } = {}) {
  const { assinatura, status, ...base } = v;
  if (!metadados) { delete base.numeroLaudo; delete base.versao; delete base.cienciaCliente; }
  return sha(canon({ ...base, fotosSha: await fotosSha(v) }) + ts);
}
export async function proximoNumeroLaudo() {
  const cfg = (await get('config', 'numeracao')) || {};
  const ano = new Date().getFullYear();
  let proximo = Number(cfg.proximo) || 1;
  if (Number(cfg.ano) !== ano) proximo = 1;
  const numero = `${(cfg.prefixo || 'VST').trim()}-${ano}-${String(proximo).padStart(4, '0')}`;
  await put('config', { id: 'numeracao', prefixo: (cfg.prefixo || 'VST').trim(), proximo: proximo + 1, ano });
  return numero;
}
