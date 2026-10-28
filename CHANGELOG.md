# Changelog

Versionamento: `MAIOR.MENOR.CORREÇÃO`. A versão `1.0.0` só sai quando um vistoriador real
fechar um laudo de ponta a ponta no sistema.

## 0.17.0 — Modelos de checklist e vistoria de recebimento
- Novo store `checklistModelos` (IndexedDB v12 e coleção `checklistModelos` no Firestore) para vários modelos de checklist
- Modelo **Recebimento de imóvel — casa nova**, com 10 categorias e 96 itens técnicos extraídos do checklist de referência, incluindo descrição de acabamentos por ambiente
- Nova vistoria permite escolher o modelo (ou o checklist genérico); o modelo é copiado para a vistoria (`checklistModeloId`, `checklistModeloNome`, `checklistModeloCategorias` e `itens`), então mudanças no modelo não alteram vistorias existentes
- Agenda também permite escolher o modelo ao iniciar uma vistoria
- Campos da vistoria de recebimento: contratante/representante, proprietário, empreendimento, procuradora, unidade, matrícula, área do lote, área construída, incorporadora/construtora, responsável da construtora, tipo de imóvel e observações gerais — pré-preenchidos pelo cliente e imóvel quando possível
- Itens com Aprovado / Reprovado / N/A, observação, fotos, destaque visual dos reprovados e vínculo de anomalias ao item
- Laudo mostra modelo utilizado, dados do imóvel, resumo por categoria, totais de aprovados/reprovados/N/A/não avaliados e não conformidades com item, observação e fotos
- Área **Administração → Modelos de checklist**: listar, criar, editar, duplicar, ativar/desativar, restaurar o padrão e excluir (bloqueado quando há vistorias ou agendamentos vinculados)
- Checklist genérico atual preservado; vistorias antigas sem modelo continuam abrindo e gerando laudo normalmente
- Backup e migração para a nuvem passam a incluir os modelos; regra do Firestore acrescentada para a coleção nova

## 0.16.1 — Correção da verificação de integridade
- `calcHash` passa a ignorar os metadados gravados depois da assinatura (`numeroLaudo`, `versao` e `cienciaCliente`), que faziam o botão **Verificar integridade** acusar "ALTERADO" em laudos recém-assinados e após o registro da ciência do cliente
- A verificação ainda aceita o cálculo antigo (`metadados: true`), para conferir laudos assinados por versões anteriores
- Versão exibida, service worker e links com `?v=` atualizados para 0.16.1

## 0.16.0 — Modularização
- `app.js` passa a ser apenas a entrada (`import './src/main.js'`); o código foi dividido em `src/`
- `src/core/`: configuração, estado compartilhado, utilidades, DOM, backends (IndexedDB e Firestore) e regras de domínio (CPF/CNPJ, checklist, fotos, hash do laudo, auditoria, lixeira, migração)
- `src/views/`: uma tela por arquivo (visão geral, agenda, cadastros, vistorias, vistoria, laudo, orçamentos, financeiro, documentos, checklist, LGPD, usuários, configurações, lixeira, auditoria, backup, login)
- `src/ui/`: moldura da aplicação (sidebar, tema, busca) e eventos delegados
- `src/router.js`, `src/boot.js` e `src/main.js`: rotas, inicialização e ponto de entrada
- `src/core/navigate.js` quebra a dependência circular entre telas e roteador (`refresh()`)
- `src/core/state.js` concentra o estado mutável (backend ativo, usuário, vistoria aberta, assinatura)
- Service worker passa a pré-carregar os 38 módulos, mantendo o app abrindo offline
- Sem mudança de comportamento, de dados gravados ou das regras do Firestore

## 0.3.0 — Nuvem (Firebase)
- Login por e-mail e senha (Firebase Authentication)
- Dados no Firestore, com cache offline: salva sem internet e sincroniza ao reconectar
- Regras de segurança (`firestore.rules`): só e-mails autorizados leem/gravam
- Fotos em documentos próprios (limite de 1 MB por documento do Firestore); compressão 1024 px
- Botão "Enviar para a nuvem" migra os dados salvos neste aparelho (versões 0.1.x/0.2.x)
- Assinatura agora cobre também o conteúdo das fotos; botão "Verificar integridade" no laudo
- Modo local (teste) mantido para desenvolvimento: `localStorage.vistori_modo = 'local'`
- SDK do Firebase carregado da CDN oficial e guardado em cache pelo service worker

## 0.2.0 — Módulo 1: Cadastros e Estrutura Base
- Menu **Cadastros** agrupando todos os cadastros
- Clientes PF/PJ com validação de CPF/CNPJ, bloqueio de duplicidade, endereço e observações
- Ficha do cliente lista os imóveis/obras vinculados e cria novo imóvel já vinculado
- Imóveis/Obras com tipo (residencial, comercial, obra particular, corporativa), cidade/UF e área
- Fornecedores e Empreiteiros
- Categorias e Tipos de Serviço editáveis (6 padrões já cadastrados); a vistoria usa esta lista
- Tabela de Preços (tipo de serviço × tipo de imóvel); o valor entra preenchido na nova vistoria
- Catálogo de itens/serviços adicionais (deslocamento, hora técnica, taxa de ART…)
- Busca em todas as listas
- Banco local migrado para a versão 2 (dados da 0.1.x são preservados)

## 0.1.1 — Identidade visual
- Logo VISTORI ENGENHARIA no cabeçalho, na tela inicial e no topo do laudo
- Novo ícone do app (PWA) com o emblema da marca
- Paleta do sistema ajustada para as cores da logo (verde-petróleo e dourado)

## 0.1.0 — MVP inicial
- Clientes (PF/PJ) e Imóveis/Obras
- Checklist padrão parametrizável (editor de texto)
- Vistoria com status por item, observações e fotos com legenda
- Campo para número da ART (a ART é emitida no CREA, não neste sistema)
- Assinatura na tela, com data/hora e hash SHA-256 do conteúdo
- Laudo imprimível / salvar como PDF
- Backup e restauração em JSON
- PWA instalável, shell em cache (abre sem internet)
- Dados somente locais (IndexedDB), sem login
