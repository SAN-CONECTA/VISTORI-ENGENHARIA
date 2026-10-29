# Changelog

Versionamento: `MAIOR.MENOR.CORREÇÃO`. A versão `1.0.0` só sai quando um vistoriador real
fechar um laudo de ponta a ponta no sistema.

## 0.21.0 — Listagem, detalhe e checklist
- Indicador do topo corrigido para **Online/Offline** quando só há conexão do navegador; “Sincronizado” não é mais exibido sem confirmação real do envio à nuvem
- Lista de vistorias trocou o formulário permanente por um **painel lateral “Nova vistoria”**, com foco inicial, foco preso, Esc, botão de fechar, retorno de foco e confirmação para descartar dados
- Linha de vistoria com **Abrir** em destaque e menu secundário **Ações** para **Ver laudo** e **Excluir**; confirmação e proteção de laudo assinado preservadas
- Detalhe reorganizado em abas **Dados gerais**, **Checklist**, **Anomalias**, **Documentos** e **Laudo**, com teclado (setas/Home/End), cabeçalho com status e progresso real
- Feedback de salvamento real: **Alterações pendentes**, **Salvando…**, **Salvo no app** e **Falha ao salvar**; “Salvo no app” não afirma sincronização com a nuvem
- Checklist com categorias recolhíveis, progresso por categoria/total, estados Não avaliado/Conforme/Não conforme/N/A com texto e ícone, controles rápidos e filtros Pendentes/Não conformes
- Fotos em miniatura com legenda e ações existentes; link para registrar anomalia a partir do item reprovado abre a aba e preserva o vínculo, sem criar registros automaticamente
- Campos do laudo em áreas amplas e resumo antes da assinatura refletindo apenas as confirmações já existentes (itens sem avaliação, ART e nome/assinatura)
- Ajustes de celular e acessibilidade: abas/filtros/drawer/tabela adaptados, áreas de toque maiores e ausência de rolagem horizontal da página
- Teste novo `tests/ui-block3.mjs` (8/8) e capturas em `tests/screenshots/block3-*.png`; regressões preservadas em núcleo 16/16, aplicação 22/22 e regras 42/42
- Nenhuma alteração de backend, credenciais, regras de negócio ou formato dos registros; versão e service worker em 0.21.0

## 0.20.0 — Dashboard e menu lateral
- Dashboard reorganizado para priorizar retomada, quatro indicadores principais, vistorias recentes, agenda do dia e pendências antes dos gráficos
- **Continuar vistoria** em destaque para a vistoria editável mais recente
- **Não conformidades** saiu dos KPIs e virou um bloco de pendências, com itens reprovados do checklist, itens sem avaliação e anomalias separadas e explicadas
- Gráficos sem dados exibem orientação curta e ação útil (criar vistoria ou abrir o financeiro), sem dados fictícios
- Aviso técnico de Firebase removido do dashboard; topo mostra estado discreto de conectividade (Modo local/Online/Offline) com `title` e `aria-label`
- Menu inicia com Administração recolhida no primeiro acesso e memoriza os grupos em `localStorage` (`vistori_nav_grupos_v1`)
- Grupo da página atual permanece aberto; item ativo com fundo, borda, barra lateral e marcador; grupo ativo não pode ser recolhido pela própria página
- Navegação por teclado preservada/ampliada: setas, Home/End, Ctrl+K, Esc devolvendo foco ao botão do menu; menu celular foca o item ativo
- Alternador de tema passa a ficar disponível no menu do celular
- Novo teste de UI `tests/ui-block2.mjs` (10/10) com dados locais e capturas reais em `tests/screenshots/` para desktop/celular, claro/escuro e estado vazio
- Nenhuma alteração de backend, credenciais ou armazenamento dos registros; versão e service worker em 0.20.0

## 0.19.0 — Geração e anexo automático do PDF do laudo
- Novo `src/core/pdf.js` gera o laudo em PDF no navegador com jsPDF 2.5.1 vendorizado em `vendor/jspdf.umd.min.js` (MIT, sem npm), compatível com GitHub Pages e offline
- A tela de laudo assinado ganha **Gerar PDF**, **Baixar PDF** e **Anexar PDF ao laudo**; a opção **Imprimir / Salvar PDF** do navegador é preservada
- O PDF inclui empresa/logotipo, número e versão, cliente e imóvel, dados específicos da vistoria, modelo de checklist, resumo por categoria, totais de aprovados/reprovados/N/A/não avaliados, não conformidades, anomalias, fotos, documentos, recomendações, conclusão, ciência do cliente, assinatura, hash e QR Code quando disponível
- Nome de arquivo seguro no padrão `Vistoria_<numeroLaudo>_<cliente>.pdf`, sem acentos ou caracteres inválidos
- Anexar grava em `documentos` com `vistoriaId`, tipo `Laudo técnico`, `mime: application/pdf`, `pdfAssinatura: true`, `hashLaudo`, `versaoLaudo` e `cienciaEm`; o PDF é vinculado à versão assinada
- O app evita duplicar o mesmo PDF (mesmo hash/versão e mesma ciência) e bloqueia nova anexação concorrente
- O PDF gerado é um artefato **pós-assinatura**: fica fora do grupo `documentos` do hash v2; documentos comuns continuam cobertos. Hashes v1 e v2 existentes continuam verificáveis
- A regra do Firestore permite somente a **criação** do artefato em vistoria assinada; editar/excluir continua bloqueado. O selo `pdfAssinatura` é proibido em vistoria não assinada para não excluir documentos comuns do hash
- O anexo respeita o limite de documento do Firestore (~750 KB de data URL). PDFs maiores continuam disponíveis para download, mas não são anexados; a mensagem explica o limite
- O QR Code continua sendo uma imagem externa: no PDF é incluído quando carrega; offline é omitido e o hash permanece impresso
- jsPDF, `src/core/pdf.js` e a nova versão entram no precache do service worker; geração de PDF foi testada offline
- Testes atualizados: núcleo 16/16, aplicação 22/22 (inclui PDF válido, download, anexação, hash estável, laudo antigo e offline) e regras 42/42
- Versão e service worker atualizados para 0.19.0; **publique `firestore.rules` manualmente** para o anexo funcionar na nuvem

## 0.18.0 — Integridade ampliada do laudo
- Hash v2 agrupa e cobre: dados da vistoria, dados específicos do imóvel, observações gerais, modelo de checklist, itens/status/observações, fotos dos itens, anomalias e documentos vinculados
- A assinatura guarda `hashVersao: 2`, o hash final e um hash por grupo; a verificação informa quais grupos foram alterados
- Ciência do cliente, número/versão do laudo, imagem da assinatura e metadados pós-assinatura continuam fora do hash
- A assinatura carrega anomalias e documentos do banco antes de calcular o hash; se não for possível carregar, a assinatura não é concluída
- Reabertura verifica a integridade antes de arquivar e guarda em `versoes` a assinatura anterior, um snapshot da vistoria e hashes das anomalias/documentos/fotos (sem duplicar binários grandes)
- Interface bloqueia alteração de anomalias, documentos e fotos em vistoria assinada até a reabertura
- Hashes antigos continuam verificáveis pelos cálculos legados; eles não cobrem anomalias/documentos
- Comentários das regras reforçam a imutabilidade do conteúdo vinculado a laudo assinado; publicação manual continua necessária
- Versão e service worker atualizados para 0.18.0

## 0.17.1 — Administração de modelos restrita a administradores
- Removida das regras do Firestore a exceção que permitia a qualquer usuário autorizado criar o modelo padrão `mdl-recebimento-casa-nova`
- `getModelos()` não grava mais automaticamente: o modelo padrão é criado apenas pela ação **Criar/Restaurar modelo padrão** na tela de modelos
- Vistorias e agenda continuam funcionando sem modelo, usando o checklist genérico
- Tela de modelos em modo leitura para não administradores, exibindo somente modelos ativos; ações de criar/editar/duplicar/ativar/desativar/restaurar/excluir ficam restritas a administradores (o cliente também valida o perfil; as regras do Firestore continuam sendo a autoridade)
- Versão e service worker atualizados para 0.17.1, para que o novo JavaScript chegue aos clientes com cache
- As regras precisam ser publicadas manualmente no Firebase Console

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
