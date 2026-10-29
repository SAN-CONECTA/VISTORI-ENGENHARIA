// Teste de núcleo do hash v2 (sem navegador). Rode: node tests/integrity-core.mjs
import { setBackend } from '../src/core/state.js';
import { calcHash, calcularIntegridade, verificarIntegridade } from '../src/core/laudo.js';
import { fotosSha } from '../src/core/fotos.js';

const base = () => ({
  id: 'v1', obraId: 'o1', tipo: 'Vistoria de entrega', data: '2026-01-01', hora: '10:00',
  vistoriador: 'Eng.', crea: 'MT 1', artNumero: 'ART 1', valor: 100, orientacoes: 'Contato',
  laudoObjetivo: 'Objetivo', status: 'rascunho', versao: 1, criado: '2026-01-01T10:00:00.000Z',
  contratante: 'Contratante', proprietario: 'Proprietário', empreendimento: 'Empreendimento',
  procuradora: 'Procuradora', unidade: 'Casa 1', matricula: '123', areaLote: '160',
  areaConstruida: '43.85', incorporadora: 'Construtora', responsavelConstrutora: 'Responsável',
  tipoImovel: 'NOVO', observacoesGerais: 'Observação geral',
  checklistModeloId: 'm1', checklistModeloNome: 'Modelo teste', checklistModeloCategorias: [{ nome: 'A', descricao: 'desc' }],
  itens: [{ cat: 'A', desc: 'Item 1', status: 'C', obs: 'ok', fotos: [{ id: 'f1', legenda: 'foto' }] }]
});
const fotos = { f1: { id: 'f1', vistoriaId: 'v1', src: 'data:image/png;base64,AAAA' } };
const anomalias = [{ id: 'a1', vistoriaId: 'v1', titulo: 'Anomalia', status: 'Aberta', foto: 'data:image/png;base64,BBBB', itemIndex: 0 }];
const documentos = [{ id: 'd1', vistoriaId: 'v1', nome: 'ART', tipo: 'ART', src: 'data:text/plain;base64,Q0M=', tamanho: 12 }];

setBackend({
  all: async s => s === 'anomalias' ? anomalias : s === 'documentos' ? documentos : [],
  get: async (s, id) => s === 'fotos' ? fotos[id] : undefined,
  put: async () => {}, del: async () => {}
});

let falhas = 0;
const ok = (nome, cond, detalhe = '') => {
  if (!cond) falhas++;
  console.log(`${cond ? 'PASS' : 'FAIL'} ${nome}${detalhe ? ' — ' + detalhe : ''}`);
};
const clone = o => JSON.parse(JSON.stringify(o));
const ts = '2026-01-01T10:00:00.000Z';
const v = base();
const integ = await calcularIntegridade(v, ts);
const sig = { ts, hash: integ.hash, hashVersao: 2, grupos: integ.grupos, fotosSha: integ.fotosSha };
ok('assinatura v2 tem 8 grupos', Object.keys(integ.grupos).length === 8);
ok('assinatura v2 verifica sem alterações', (await verificarIntegridade(v, sig)).ok);
ok('ciência não altera o hash', (await verificarIntegridade({ ...v, cienciaCliente: { nome: 'Cliente', em: ts } }, sig)).ok);
ok('número/versão não alteram o hash', (await verificarIntegridade({ ...v, numeroLaudo: 'VST-1', versao: 2 }, sig)).ok);

const casos = [
  ['anomalias', x => { x.anomalias = clone(anomalias); x.anomalias[0].status = 'Corrigida'; }],
  ['documentos', x => { x.documentos = clone(documentos); x.documentos[0].nome = 'Outro'; }],
  ['fotos dos itens', x => { x.fotos = clone(fotos); x.fotos.f1.src = 'data:image/png;base64,CCCC'; }],
  ['dados do imóvel', x => { x.v = clone(v); x.v.matricula = '999'; }],
  ['itens do checklist', x => { x.v = clone(v); x.v.itens[0].obs = 'alterado'; }],
  ['modelo de checklist', x => { x.v = clone(v); x.v.checklistModeloNome = 'Outro modelo'; }],
  ['dados da vistoria', x => { x.v = clone(v); x.v.orientacoes = 'outro'; }],
  ['observações gerais', x => { x.v = clone(v); x.v.observacoesGerais = 'outra'; }]
];
for (const [label, mudar] of casos) {
  const estado = { v: clone(v), anomalias: clone(anomalias), documentos: clone(documentos), fotos: clone(fotos) };
  setBackend({
    all: async s => s === 'anomalias' ? estado.anomalias : s === 'documentos' ? estado.documentos : [],
    get: async (s, id) => s === 'fotos' ? estado.fotos[id] : undefined,
    put: async () => {}, del: async () => {}
  });
  mudar(estado);
  const r = await verificarIntegridade(estado.v, sig);
  ok(`detecta alteração em ${label}`, !r.ok && r.labels.includes(label), JSON.stringify(r.labels));
  // restaura o backend original para os próximos casos
  setBackend({
    all: async s => s === 'anomalias' ? anomalias : s === 'documentos' ? documentos : [],
    get: async (s, id) => s === 'fotos' ? fotos[id] : undefined,
    put: async () => {}, del: async () => {}
  });
}

// Compatibilidade com o formato antigo.
const legadoHash = await calcHash(v, ts);
const legadoFotos = await fotosSha(v);
const legadoSig = { ts, hash: legadoHash, fotosSha: legadoFotos };
const legadoOk = await verificarIntegridade(v, legadoSig);
ok('formato antigo verifica', legadoOk.ok && legadoOk.formato === 'legado');
setBackend({
  all: async s => s === 'anomalias' ? [{ ...anomalias[0], status: 'Corrigida' }] : s === 'documentos' ? documentos : [],
  get: async (s, id) => s === 'fotos' ? fotos[id] : undefined,
  put: async () => {}, del: async () => {}
});
const legadoAnom = await verificarIntegridade(v, legadoSig);
ok('formato antigo continua verificando com mudança de anomalia (limitação documentada)', legadoAnom.ok);
const legadoItem = await verificarIntegridade({ ...v, itens: [{ ...v.itens[0], obs: 'outro' }] }, legadoSig);
ok('formato antigo detecta mudança em item', !legadoItem.ok);

console.log(falhas ? `\n${falhas} falha(s)` : '\nTodos os testes de núcleo passaram.');
process.exit(falhas ? 1 : 0);
