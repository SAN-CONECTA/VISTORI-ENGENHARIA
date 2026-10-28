// Backend local (IndexedDB).
import { STORES } from '../config.js';

const openDB = () => new Promise((res, rej) => {
  const r = indexedDB.open('vistori', 12);
  r.onupgradeneeded = () => STORES.forEach(s => { if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s, { keyPath: 'id' }); });
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
async function tx(store, mode, fn) {
  const d = await openDB();
  return new Promise((res, rej) => {
    const t = d.transaction(store, mode);
    const rq = fn(t.objectStore(store));
    t.oncomplete = () => res(rq && rq.result);
    t.onerror = () => rej(t.error);
  });
}
export const L = {
  all: s => tx(s, 'readonly', o => o.getAll()),
  get: (s, id) => tx(s, 'readonly', o => o.get(id)),
  put: (s, v) => tx(s, 'readwrite', o => o.put(v)),
  del: (s, id) => tx(s, 'readwrite', o => o.delete(id))
};
