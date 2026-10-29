// Constantes e configuração de execução (versão, modo, coleções e enums).

export const VERSION = '0.21.0';
// Deve espelhar os e-mails bootstrap de firestore.rules.
export const ADMIN_EMAILS = ['sandro@santecnologia.com', 'victoriarochaeng@hotmail.com', 'sandro@sanconecta.com'];
/* Modos: 'nuvem' (padrão: Firebase + login) | 'local' (só este aparelho, para testes)
   | 'nuvem-teste' (Firebase sem tela de login; só para testes — as regras do Firestore continuam valendo). */
const AMBIENTE_LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname)
  || (location.hostname === 'san-conecta.github.io' && location.pathname.startsWith('/VISTORI-ENGENHARIA-DEV/'));
export const MODO = AMBIENTE_LOCAL ? 'local' : (localStorage.getItem('vistori_modo') || 'nuvem');
export const SDK_VERSIONS = ['11.10.0', '10.14.1'];
export const STORES = ['clientes', 'obras', 'vistorias', 'versoes', 'anomalias', 'documentos', 'agendamentos', 'orcamentos', 'recebimentos', 'acessos', 'lixeira', 'auditoria', 'config', 'fornecedores', 'tipos', 'catalogo', 'precos', 'fotos', 'checklistModelos'];
export const STORES_DADOS = ['clientes', 'obras', 'vistorias', 'versoes', 'anomalias', 'documentos', 'agendamentos', 'orcamentos', 'recebimentos', 'lixeira', 'auditoria', 'fornecedores', 'catalogo', 'precos', 'checklistModelos'];
export const TIPOS_DEFAULT = ['Particular', 'Indicação', 'Judicial', 'Avaliação bancária', 'Vistoria de entrega', 'Inspeção predial'];
export const TIPOS_OBRA = ['Residencial', 'Comercial', 'Obra particular', 'Obra corporativa'];
export const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
export const UNIDADES = ['un', 'h', 'm²', 'km', 'visita'];
export const GRAV = ['Baixa', 'Média', 'Alta', 'Crítica'];
export const PRAZOS = ['Imediato', '15 dias', '30 dias', '60 dias', '90 dias'];
export const DOC_TIPOS = ['ART', 'Planta', 'Contrato', 'Proposta', 'Foto', 'Laudo técnico', 'Outro'];
export const STORE_LABEL = { clientes: 'Cliente', obras: 'Imóvel/Obra', vistorias: 'Vistoria', versoes: 'Versão', anomalias: 'Anomalia', documentos: 'Documento', agendamentos: 'Agendamento', orcamentos: 'Orçamento', recebimentos: 'Recebimento', acessos: 'Acesso', tipos: 'Tipo de serviço', fornecedores: 'Fornecedor', catalogo: 'Catálogo', precos: 'Preço', fotos: 'Foto', config: 'Configuração', checklistModelos: 'Modelo de checklist' };
export const CAD = ['cadastros', 'clientes', 'obras', 'fornecedores', 'tipos', 'catalogo', 'precos'];
export const ST = { '': '— avaliar —', C: 'Conforme', N: 'Não conforme', NA: 'N/A' };
// Modelos de checklist (ex.: recebimento de imóvel) usam o vocabulário do laudo de entrega.
export const ST_RECEB = { '': '— avaliar —', C: 'Aprovado', N: 'Reprovado', NA: 'N/A' };
