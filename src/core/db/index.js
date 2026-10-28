// Fachada do armazenamento.
//
// As views nunca falam com `L` nem com o Firestore: sempre com all/get/put/del.
// O backend ativo é trocado em `boot()` via `setBackend`.

import { B } from '../state.js';

export const all = s => B.all(s);
export const get = (s, id) => B.get(s, id);
export const put = (s, v, ack) => B.put(s, v, ack);
export const del = (s, id) => B.del(s, id);
