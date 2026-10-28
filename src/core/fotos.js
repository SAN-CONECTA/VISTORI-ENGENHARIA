// Fotos da vistoria: leitura por id e hash do conteúdo.
import { get } from './db/index.js';
import { sha } from './utils.js';

export async function fotosMap(v) {
  const ids = v.itens.flatMap(i => i.fotos.filter(f => f.id).map(f => f.id));
  const arr = await Promise.all(ids.map(id => get('fotos', id)));
  const m = {}; arr.forEach((x, k) => { if (x) m[ids[k]] = x.src; });
  return m;
}
export async function fotosSha(v) {
  const o = {};
  for (const [i, it] of v.itens.entries()) for (const [j, f] of it.fotos.entries())
    o[`${i}:${j}`] = await sha(f.src || (await get('fotos', f.id))?.src || '');
  return o;
}
