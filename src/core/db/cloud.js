// Backend na nuvem (Firestore com cache offline).

export function makeCloud(F, fs) {
  // Offline, setDoc só conclui quando o servidor confirma. Esperamos no máximo 2,5 s e seguimos:
  // o dado já está no cache local e sobe sozinho quando a internet voltar.
  const wait = p => Promise.race([p, new Promise(r => setTimeout(r, 2500))]);
  const log = (s, p) => { p.catch(e => console.error('Falha ao sincronizar', s, e)); return p; };
  return {
    all: async s => (await F.getDocs(F.collection(fs, s))).docs.map(d => d.data()),
    get: async (s, id) => {
      try { const d = await F.getDoc(F.doc(fs, s, id)); return d.exists() ? d.data() : undefined; }
      catch (e) { if (e.code === 'unavailable') return undefined; throw e; }
    },
    put: (s, v, ack) => { const p = log(s, F.setDoc(F.doc(fs, s, v.id), v)); return ack ? p : wait(p); },
    del: (s, id) => wait(log(s, F.deleteDoc(F.doc(fs, s, id))))
  };
}
