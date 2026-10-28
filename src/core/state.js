// Estado mutável compartilhado pelo app.
//
// Os bindings são exportados "vivos" (live bindings do ES modules): quem importa
// sempre lê o valor atual. Como módulos importados não podem reatribuir um
// binding, toda troca de estado passa pelos setters abaixo — assim fica claro,
// na revisão, quem pode mudar o quê.

/** Backend ativo: `L` (IndexedDB) ou o adaptador da nuvem (Firestore). */
export let B = null;
/** Módulo do SDK do Firebase, carregado sob demanda (null no modo local). */
export let F = null;
/** Instância do Firebase Auth. */
export let auth = null;
/** Usuário autenticado; null quando deslogado. */
export let USER = null;
/** Vistoria aberta na tela de detalhe (lida pelos eventos globais). */
export let curV = null;
/** Área de assinatura da vistoria aberta. */
export let pad = null;

export const setBackend = v => { B = v; };
export const setFirebase = (sdk, instanciaAuth) => { F = sdk; auth = instanciaAuth; };
export const setUser = v => { USER = v; };
export const setCurV = v => { curV = v; };
export const setPad = v => { pad = v; };
