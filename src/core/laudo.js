// Hash de assinatura do laudo e numeração sequencial.
import { all, get, put } from './db/index.js';
import { fotosSha } from './fotos.js';
import { canon, sha } from './utils.js';

// Metadados gravados depois da assinatura ficam fora do hash (inclusive no
// formato antigo). Itens, fotos, anomalias, documentos, imóvel e modelo têm
// grupos próprios no formato v2 para permitir diagnóstico.
const CAMPOS_IMOVEL = ['contratante', 'proprietario', 'empreendimento', 'procuradora', 'unidade', 'matricula', 'areaLote', 'areaConstruida', 'incorporadora', 'responsavelConstrutora', 'tipoImovel'];
const CAMPOS_MODELO = ['checklistModeloId', 'checklistModeloNome', 'checklistModeloCategorias'];
const CAMPOS_FORA_VISTORIA = new Set([
  'assinatura', 'status', 'numeroLaudo', 'versao', 'cienciaCliente', 'itens', 'observacoesGerais',
  ...CAMPOS_IMOVEL, ...CAMPOS_MODELO
]);

export const GRUPOS_INTEGRIDADE = {
  vistoria: 'dados da vistoria',
  imovel: 'dados do imóvel',
  observacoes: 'observações gerais',
  modelo: 'modelo de checklist',
  itens: 'itens do checklist',
  fotos: 'fotos dos itens',
  anomalias: 'anomalias',
  documentos: 'documentos'
};

const baseVistoria = v => Object.fromEntries(Object.entries(v).filter(([k]) => !CAMPOS_FORA_VISTORIA.has(k)));
const dadosImovel = v => Object.fromEntries(CAMPOS_IMOVEL.map(k => [k, v[k] ?? '']));
const dadosModelo = v => ({
  id: v.checklistModeloId ?? '',
  nome: v.checklistModeloNome ?? '',
  categorias: v.checklistModeloCategorias ?? []
});
const ordenarPorId = arr => [...arr].sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));

/** Hashes dos grupos que compõem a assinatura v2. */
export async function gruposIntegridade(v) {
  const [fotos, anomalias, documentos] = await Promise.all([
    fotosSha(v),
    all('anomalias'),
    all('documentos')
  ]);
  const minhasAnomalias = ordenarPorId(anomalias.filter(a => a.vistoriaId === v.id));
  const meusDocumentos = ordenarPorId(documentos.filter(d => d.vistoriaId === v.id));
  const grupos = {
    vistoria: await sha(canon(baseVistoria(v))),
    imovel: await sha(canon(dadosImovel(v))),
    observacoes: await sha(canon({ observacoesGerais: v.observacoesGerais ?? '' })),
    modelo: await sha(canon(dadosModelo(v))),
    itens: await sha(canon(v.itens || [])),
    fotos: await sha(canon(fotos)),
    anomalias: await sha(canon(minhasAnomalias)),
    documentos: await sha(canon(meusDocumentos))
  };
  return { grupos, fotosSha: fotos, anomalias: minhasAnomalias, documentos: meusDocumentos };
}

/** Assinatura v2: hash dos grupos + timestamp. */
export async function calcularIntegridade(v, ts) {
  const { grupos, fotosSha: fotos } = await gruposIntegridade(v);
  const hash = await sha(canon({ versao: 2, grupos }) + ts);
  return { hash, grupos, fotosSha: fotos };
}

// Formato antigo: mantido para verificar laudos assinados antes do hash v2.
// `numeroLaudo`, `versao` e `cienciaCliente` são gravados depois da assinatura
// (e a ciência pode ser registrada até depois de assinar), por isso ficam fora.
// `metadados: true` reproduz o cálculo antigo (que os incluía), para conferir
// laudos assinados antes da 0.16.1.
export async function calcHash(v, ts, { metadados = false } = {}) {
  const { assinatura, status, ...base } = v;
  if (!metadados) { delete base.numeroLaudo; delete base.versao; delete base.cienciaCliente; }
  return sha(canon({ ...base, fotosSha: await fotosSha(v) }) + ts);
}

/**
 * Verifica uma assinatura. Retorna:
 * - ok, formato ('v2' | 'legado' | 'legado-meta' | 'ausente');
 * - alterados: chaves de grupo divergentes (somente v2);
 * - labels: nomes legíveis dos grupos alterados.
 */
export async function verificarIntegridade(v, sig) {
  if (!sig) return { ok: false, formato: 'ausente', alterados: [], labels: [] };

  if (sig.hashVersao === 2 && sig.grupos) {
    const { grupos } = await gruposIntegridade(v);
    const hashAtual = await sha(canon({ versao: 2, grupos }) + sig.ts);
    const chaves = new Set([...Object.keys(GRUPOS_INTEGRIDADE), ...Object.keys(sig.grupos || {})]);
    const alterados = [...chaves].filter(k => (grupos[k] || '') !== (sig.grupos[k] || ''));
    return {
      ok: hashAtual === sig.hash,
      formato: 'v2',
      hashAtual,
      alterados,
      labels: alterados.map(k => GRUPOS_INTEGRIDADE[k] || k)
    };
  }

  // Compatibilidade: primeiro o formato atual da 0.15/0.16 (sem número/versão/ciência),
  // depois o formato ainda mais antigo (com os metadados presentes na assinatura).
  const hashLegado = await calcHash(v, sig.ts);
  if (hashLegado === sig.hash) return { ok: true, formato: 'legado', alterados: [], labels: [] };
  const hashLegadoMeta = await calcHash(v, sig.ts, { metadados: true });
  if (hashLegadoMeta === sig.hash) return { ok: true, formato: 'legado-meta', alterados: [], labels: [] };
  return { ok: false, formato: 'legado', alterados: [], labels: [] };
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

