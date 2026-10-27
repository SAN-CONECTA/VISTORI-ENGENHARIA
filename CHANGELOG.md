# Changelog

Versionamento: `MAIOR.MENOR.CORREÇÃO`. A versão `1.0.0` só sai quando um vistoriador real
fechar um laudo de ponta a ponta no sistema.

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
