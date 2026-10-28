// Checklists: o modelo genérico editável em Configurações e os modelos por
// tipo de vistoria (store `checklistModelos`). O modelo escolhido é copiado
// para dentro da vistoria, para que mudanças futuras não alterem laudos antigos.
import { ADMIN_EMAILS, MODO, ST, ST_RECEB } from './config.js';
import { all, get, put } from './db/index.js';
import { USER } from './state.js';

const DEFAULT_CHECK = {
  'Análise estrutural': ['Fissuras e trincas', 'Infiltrações em lajes e paredes', 'Pilares, vigas e lajes aparentes'],
  'Acabamento': ['Pisos e revestimentos', 'Pintura', 'Forro e gesso'],
  'Hidráulica': ['Pontos de água', 'Esgoto e caimento', 'Vazamentos', 'Louças e metais'],
  'Elétrica': ['Quadro de distribuição', 'Tomadas e interruptores', 'Iluminação', 'Aterramento'],
  'Esquadrias': ['Portas', 'Janelas', 'Vedação e ferragens']
};
export const toText = o => Object.entries(o).map(([c, a]) => `## ${c}\n${a.join('\n')}`).join('\n\n');
export const parseCheck = t => {
  const o = {}; let c = null;
  t.split('\n').forEach(l => {
    l = l.trim(); if (!l) return;
    if (l.startsWith('## ')) { c = l.slice(3); o[c] = []; } else if (c) o[c].push(l);
  });
  return o;
};
export const getCheck = async () => (await get('config', 'checklist'))?.data || DEFAULT_CHECK;

/* ---------- modelo “Recebimento de imóvel — casa nova” ---------- */

export const MODELO_RECEBIMENTO_ID = 'mdl-recebimento-casa-nova';
export const MODELO_RECEBIMENTO_NOME = 'Recebimento de imóvel — casa nova';

const cat = (nome, descricao, itens) => ({ nome, descricao, itens });
const CATEGORIAS_RECEBIMENTO = [
  cat('Sala / Jantar e Circulação',
    'Acabamentos previstos: piso cerâmico; paredes e teto em pintura — acabamentos finais conforme o Memorial Descritivo padrão do empreendimento.',
    [
      'Tomadas, interruptores e iluminação (testar todos os pontos; verificar oxidação e alinhamento)',
      'Paredes (marcas de fôrma, fissuras, trincas, planicidade, ondulações, qualidade da pintura)',
      'Teto / forro (fissuras, manchas de umidade, fixação das placas e acabamento)',
      'Piso cerâmico (peças trincadas, lascadas ou com som cavo, nivelamento, juntas e rejunte)',
      'Rodapé, se previsto (fixação, riscos, esfarelamento das juntas)',
      'Porta de entrada (alinhamento, vedação, ferragens, fechadura e chaves)',
      'Janela (travamento, vedação, vidros, trepidação e funcionamento das folhas)',
      'Pontos de TV / telefonia / internet, se previstos (existência de tubulação e espelhos)',
      'Limpeza geral do ambiente',
      'Dimensões conforme projeto / planta do imóvel'
    ]),
  cat('Cozinha',
    'Acabamentos previstos: piso cerâmico; revestimento cerâmico nas paredes molhadas; pintura nas demais superfícies — conforme Memorial Descritivo.',
    [
      'Tomadas, interruptores e iluminação',
      'Parede da pia / bancada — revestimento cerâmico, se previsto (planicidade, juntas, rejunte) e pintura nas demais paredes',
      'Teto / forro (manchas de umidade, fixação, acabamento)',
      'Piso cerâmico (peças trincadas, lascadas ou com som cavo, nivelamento, caimento para o ralo)',
      'Pia / bancada, se prevista no memorial (fixação, trincas, vedação)',
      'Torneira e registros (vazamentos, boa vazão, vedação)',
      'Ralo e sifão (entupimento, caimento, grelha)',
      'Instalações hidráulicas aparentes (vazamentos, identificação)',
      'Janela (travamento, vedação, vidros, trepidação e funcionamento das folhas)',
      'Porta de acesso, se houver',
      'Ponto de gás, se previsto (identificação, vedação do registro)',
      'Limpeza geral do ambiente',
      'Dimensões conforme projeto / planta do imóvel'
    ]),
  cat('Quarto 1',
    'Acabamentos previstos: piso cerâmico; paredes e teto em pintura — acabamentos finais conforme o Memorial Descritivo padrão do empreendimento.',
    [
      'Tomadas, interruptores e iluminação (testar todos os pontos; verificar oxidação e alinhamento)',
      'Paredes (marcas de fôrma, fissuras, trincas, planicidade, ondulações, qualidade da pintura)',
      'Teto / forro (fissuras, manchas de umidade, fixação das placas e acabamento)',
      'Piso cerâmico (peças trincadas, lascadas ou com som cavo, nivelamento, juntas e rejunte)',
      'Rodapé, se previsto (fixação, riscos, esfarelamento das juntas)',
      'Porta interna (alinhamento, calafetação, ferragens, funcionamento da fechadura)',
      'Janela (travamento, vedação, vidros, trepidação e funcionamento das folhas)',
      'Limpeza geral do ambiente',
      'Dimensões conforme projeto / planta do imóvel'
    ]),
  cat('Quarto 2',
    'Acabamentos previstos: piso cerâmico; paredes e teto em pintura — acabamentos finais conforme o Memorial Descritivo padrão do empreendimento.',
    [
      'Tomadas, interruptores e iluminação (testar todos os pontos; verificar oxidação e alinhamento)',
      'Paredes (marcas de fôrma, fissuras, trincas, planicidade, ondulações, qualidade da pintura)',
      'Teto / forro (fissuras, manchas de umidade, fixação das placas e acabamento)',
      'Piso cerâmico (peças trincadas, lascadas ou com som cavo, nivelamento, juntas e rejunte)',
      'Rodapé, se previsto (fixação, riscos, esfarelamento das juntas)',
      'Porta interna (alinhamento, calafetação, ferragens, funcionamento da fechadura)',
      'Janela (travamento, vedação, vidros, trepidação e funcionamento das folhas)',
      'Limpeza geral do ambiente',
      'Dimensões conforme projeto / planta do imóvel'
    ]),
  cat('Banheiro',
    'Acabamentos previstos: piso cerâmico; revestimento cerâmico na área do box (altura conforme memorial); pintura nas demais paredes; louças e metais conforme Memorial Descritivo.',
    [
      'Tomadas, interruptores e iluminação',
      'Parede do box — revestimento cerâmico (planicidade, juntas, rejunte, altura prevista no memorial)',
      'Demais paredes (pintura, fissuras, manchas de umidade)',
      'Teto / forro (nivelamento, manchas de umidade, fixação)',
      'Piso cerâmico (caimento para o ralo, empoçamento, juntas)',
      'Bacia sanitária (fixação, integridade, funcionamento da descarga, vazamentos)',
      'Lavatório e torneira (fixação, vazamentos, vazão), se previstos',
      'Chuveiro / ducha e registro (vazão, vazamentos na vedação, funcionamento)',
      'Ralo e sifão (entupimento, impermeabilização, grelha de proteção)',
      'Instalações hidráulicas — registros e ramais aparentes (vazamentos)',
      'Porta (alinhamento, ferragens, tratamento da base contra umidade)',
      'Janela / ventilação (vedação, travamento, ventilação natural)',
      'Limpeza geral do ambiente',
      'Dimensões conforme projeto / planta do imóvel'
    ]),
  cat('Lavanderia',
    'Área de serviço coberta / lavanderia. Acabamentos previstos: piso cerâmico; tanque e pontos de utilização conforme Memorial Descritivo.',
    [
      'Tomadas, interruptores e iluminação',
      'Tanque (fixação, trincas, vedação, funcionamento do sifão e da torneira)',
      'Ponto hidráulico e esgoto para máquina de lavar, se previsto',
      'Ralo (caimento, entupimento)',
      'Piso cerâmico (caimento, empoçamento, juntas)',
      'Paredes (revestimento cerâmico, se previsto, e pintura)',
      'Porta / janela de acesso (alinhamento, vedação, ferragens)',
      'Cobertura da área (telhas, calha / beiral, ausência de pontos de infiltração)',
      'Limpeza geral do ambiente',
      'Dimensões conforme projeto / planta do imóvel'
    ]),
  cat('Área Externa, Fachada e Terreno',
    'Acabamentos previstos: fachada e muros conforme projeto e Memorial Descritivo.',
    [
      'Fachada (pintura, fissuras, manchas, conformidade com a fachada apresentada no Anexo I do contrato)',
      'Terreno / quintal (nivelamento, caimento para fora da edificação, empoçamento, entulho remanescente)',
      'Muros, divisas e portão, se previstos (prumo, fissuras, fixação, acabamento)',
      'Calçada / passeio, se previstos (trincas, caimento, acabamento)',
      'Drenagem de águas pluviais (calhas, condutores, caimento do terreno)',
      'Caixas de inspeção, gordura e esgoto (tampas, ausência de vazamentos e obstruções)',
      'Padrão de entrada de energia e medidor (instalação, identificação, ligação em nome do proprietário)',
      'Hidrômetro / cavalete de água (instalação, identificação, vazamentos)',
      'Identificação da unidade (numeração) e demarcação dos limites do lote',
      'Limpeza geral do ambiente'
    ]),
  cat('Cobertura e Telhado',
    'Acabamentos previstos: cobertura em telhas e estrutura conforme Memorial Descritivo; forro nos ambientes internos, se previsto.',
    [
      'Telhas (peças quebradas, trincadas ou deslocadas; alinhamento e fixação; sobreposição)',
      'Estrutura do telhado, quando acessível (alinhamento, contraventamento, fixação, sinais de umidade ou ataque de pragas)',
      'Cumeeiras, rufos e arremates (vedação, fixação)',
      'Beirais e pingadeiras (comprimento, caimento, desempenho no escoamento da água)',
      'Calhas e condutores, se previstos (declividade, vedação, entupimento)',
      'Forro interno (manchas de umidade, pontos de infiltração, fixação das placas)',
      'Isolamento térmico / manta, se previsto no memorial'
    ]),
  cat('Instalações Gerais da Casa',
    'Acabamentos previstos: itens que não pertencem a um cômodo específico.',
    [
      'Quadro de disjuntores — identificação dos circuitos, fiação exposta, oxidação, fixação, tampa',
      'Dispositivos de proteção (DR / disjuntores) — teste de acionamento, se previstos',
      'Reservatório de água (tampa, boia, vedação, limpeza, fixação da caixa)',
      'Pressão e vazão da água em todos os pontos; teste de registros gerais',
      'Esgoto — funcionamento de todos os pontos (descarga, ralos, pias) sem retorno de odores ou refluxo',
      'Ponto de ar-condicionado, se previsto (infraestrutura de dreno e circuito elétrico)',
      'Chaves entregues (quantidade e funcionamento em todas as portas e no portão)'
    ]),
  cat('Documentação e Encerramento',
    'Acabamentos previstos: conferência final antes da entrega do relatório.',
    [
      'Conformidade com o Memorial Descritivo padrão do empreendimento (prevalece sobre as peças ilustrativas, conforme o contrato com a incorporadora)',
      'Conformidade com o projeto / planta e com os Anexos I e II do contrato de vistoria (peças ilustrativas)',
      'Manual do proprietário recebido junto com as chaves (conferir existência e conteúdo)',
      'Registro fotográfico de todas as não conformidades identificadas',
      'Registro das pendências em termo de vistoria da incorporadora / construtora, assinado por seu responsável',
      'Ciência do representante da proprietária quanto às pendências identificadas',
      'Emissão da ART pela responsável técnica'
    ]),
];

export const MODELO_RECEBIMENTO = {
  id: MODELO_RECEBIMENTO_ID,
  nome: MODELO_RECEBIMENTO_NOME,
  descricao: 'Vistoria de recebimento (entrega de chaves) — casa nova, com conferência por ambiente, instalações, documentação e encerramento.',
  padrao: true,
  ativo: true,
  // Estrutura plana (compatível com o Firestore): categorias e itens separados.
  categorias: CATEGORIAS_RECEBIMENTO.map(({ nome, descricao }) => ({ nome, descricao })),
  itens: CATEGORIAS_RECEBIMENTO.flatMap(c => c.itens.map(desc => ({ cat: c.nome, desc })))
};

const copiar = o => JSON.parse(JSON.stringify(o));

/** Rótulos de resultado: o modelo de recebimento usa Aprovado/Reprovado. */
export const rotulosChecklist = v => v?.checklistModeloId ? ST_RECEB : ST;

/** Categorias gravadas na vistoria (com descrição) ou derivadas dos itens antigos. */
export function categoriasDaVistoria(v) {
  if (Array.isArray(v?.checklistModeloCategorias) && v.checklistModeloCategorias.length) return v.checklistModeloCategorias;
  const nomes = [...new Set((v?.itens || []).map(i => i.cat))];
  return nomes.map(nome => ({ nome, descricao: '' }));
}

/** Copia categorias e itens para a vistoria no momento da criação. */
export function snapshotModelo(modelo) {
  const categorias = (modelo?.categorias || []).map(c => ({ nome: c.nome, descricao: c.descricao || '' }));
  const base = Array.isArray(modelo?.itens)
    ? modelo.itens
    : (modelo?.categorias || []).flatMap(c => (c.itens || []).map(desc => ({ cat: c.nome, desc })));
  const itens = base.map(it => ({ cat: it.cat, desc: it.desc, status: '', obs: '', fotos: [] }));
  return { categorias, itens };
}

/** Campos típicos da vistoria de recebimento, pré-preenchidos pelo cadastro. */
export function dadosIniciaisRecebimento(obra, cliente) {
  return {
    contratante: cliente?.fantasia || cliente?.nome || '',
    proprietario: cliente?.nome || '',
    empreendimento: obra?.nome || '',
    procuradora: '',
    unidade: obra?.nome || '',
    matricula: '',
    areaLote: '',
    areaConstruida: obra?.area ?? '',
    incorporadora: '',
    responsavelConstrutora: '',
    tipoImovel: obra?.tipo || '',
    observacoesGerais: ''
  };
}

/** Serializa um modelo para edição em texto (## categoria / :: descrição / item). */
export const toTextModelo = modelo => {
  const cats = modelo?.categorias || [];
  const itens = Array.isArray(modelo?.itens)
    ? modelo.itens
    : cats.flatMap(c => (c.itens || []).map(desc => ({ cat: c.nome, desc })));
  return cats.map(c => `## ${c.nome}${c.descricao ? `\n:: ${c.descricao}` : ''}\n${itens.filter(i => i.cat === c.nome).map(i => i.desc).join('\n')}`).join('\n\n');
};

/** Lê o texto do editor de modelos. Linhas sem categoria são ignoradas. */
export function parseModeloTexto(texto) {
  const categorias = [];
  let cur = null;
  for (let l of String(texto || '').split('\n')) {
    l = l.trim(); if (!l) continue;
    if (l.startsWith('## ')) {
      const nome = l.slice(3).trim();
      cur = categorias.find(c => c.nome === nome);
      if (!cur) { cur = { nome, descricao: '', itens: [] }; categorias.push(cur); }
    } else if (l.startsWith(':: ')) { if (cur) cur.descricao = l.slice(3).trim(); }
    else if (cur) cur.itens.push(l);
  }
  return categorias.filter(c => c.nome && c.itens.length);
}

/** Lê os modelos. Não grava nada: o modelo padrão é criado por um administrador. */
export async function getModelos() {
  const modelos = await all('checklistModelos');
  return modelos.sort((a, b) => Number(!!b.padrao) - Number(!!a.padrao) || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
}

/**
 * UI: em local o operador único é tratado como administrador; na nuvem,
 * exige e-mail bootstrap ou perfil "Administrador" em /acessos.
 * As regras do Firestore continuam sendo a autoridade final.
 */
export async function podeAdministrarModelos() {
  if (MODO === 'local') return true;
  const email = (USER?.email || '').toLowerCase();
  if (!email) return false;
  if (ADMIN_EMAILS.includes(email)) return true;
  try {
    const acesso = await get('acessos', email);
    return acesso?.perfil === 'Administrador';
  } catch (e) {
    return false;
  }
}

export const getModelo = id => get('checklistModelos', id);

/** Recria/atualiza o conteúdo do modelo padrão, preservando id, criado e vínculos. */
export async function restaurarModeloPadrao() {
  const atual = await getModelo(MODELO_RECEBIMENTO_ID);
  const agora = new Date().toISOString();
  const modelo = { ...copiar(MODELO_RECEBIMENTO), criado: atual?.criado || agora, atualizado: agora };
  await put('checklistModelos', modelo);
  return modelo;
}

