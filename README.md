# VISTORI-ENGENHARIA

Sistema de vistorias e laudos de engenharia. **v0.19.0**, uso interno (não é SaaS).

## O que já faz
Cadastros (clientes PF/PJ, imóveis/obras, fornecedores e empreiteiros, tipos de serviço, tabela de preços, catálogo)
→ Vistoria (modelo de checklist + checklist genérico, fotos) → Assinatura → Laudo em PDF gerado no navegador (com opção de impressão).

Modelos de checklist reutilizáveis (por exemplo, **Recebimento de imóvel — casa nova**) ficam em **Administração → Modelos de checklist**. Somente administradores criam, editam, duplicam, ativam/desativam, restauram ou excluem modelos. O modelo escolhido é copiado para a vistoria na criação: editar o modelo depois não altera vistorias já existentes. O checklist genérico continua disponível em **Checklist**.

O modelo padrão **não é mais semeado automaticamente**. Em uma base nova, um administrador deve abrir **Modelos de checklist** e usar **“Criar modelo padrão”**. Vistorias e agenda continuam funcionando sem modelo, usando o checklist genérico.

Na nuvem, publique o `firestore.rules` atualizado para liberar a coleção `checklistModelos` e o anexo do PDF em laudo assinado; sem isso, as telas de vistorias, agenda e modelos e o botão de anexar PDF recebem `permission-denied`.

## Integridade do laudo
- Assinaturas novas (**hash v2**) cobrem: dados da vistoria, itens/status/observações, fotos dos itens, anomalias, documentos, dados específicos do imóvel, observações gerais e modelo de checklist.
- Ficam fora: ciência do cliente, número/versão do laudo, imagem da assinatura, metadados gravados depois da assinatura e o PDF gerado/anexado após a assinatura (artefato; ver abaixo).
- A verificação informa os grupos alterados; assinaturas antigas continuam aceitas no formato legado (que não cobria anomalias/documentos).
- Depois de assinar, fotos/anomalias/documentos comuns ficam imutáveis até reabrir formalmente a vistoria, gerando uma nova versão com histórico. A exceção é o PDF do próprio laudo, que pode ser criado e anexado como artefato pós-assinatura (sem entrar no hash).

## PDF do laudo

Depois de assinar, a tela do laudo mostra **Gerar PDF**, **Baixar PDF** e **Anexar PDF ao laudo**. A impressão do navegador continua disponível.

- O PDF é gerado **no navegador**, sem servidor, com jsPDF vendorizado em `vendor/jspdf.umd.min.js` (MIT, sem npm). O arquivo entra no precache do service worker e funciona offline após a primeira carga.
- Conteúdo: empresa/logotipo, número e versão, cliente e imóvel, dados específicos da vistoria, modelo de checklist, resumo por categoria, totais de aprovados/reprovados/N/A/não avaliados, não conformidades, anomalias, fotos, documentos, recomendações, conclusão, ciência, assinatura, hash e QR Code quando disponível.
- Nome seguro: `Vistoria_<numeroLaudo>_<cliente>.pdf` (sem acentos nem caracteres inválidos).
- **Anexar** grava um documento em `documentos` com `vistoriaId`, tipo `Laudo técnico`, `pdfAssinatura: true`, `hashLaudo` e `versaoLaudo`. Se já existir um PDF para o mesmo hash/versão e a mesma ciência, o app não duplica.
- O PDF é um **artefato pós-assinatura**: não altera a vistoria nem o hash. O grupo `documentos` do hash v2 ignora somente esse PDF gerado. Um documento comum (inclusive um PDF anexado antes de assinar) continua coberto.
- A regra do Firestore permite **apenas criar** esse artefato em vistoria assinada; editar/excluir continua bloqueado até reabrir. A flag `pdfAssinatura` é proibida em vistoria não assinada, para não servir de atalho para excluir documentos do hash.
- O anexo é limitado pelo tamanho de um documento do Firestore (data URL de até ~750 KB). Laudos com muitas fotos podem ficar maiores: nesse caso o download funciona, mas o app informa que não é possível anexar. Para laudos muito grandes, o PDF pode ser guardado fora do app.
- O QR Code atual é uma imagem externa: no PDF ele é incluído somente quando consegue ser carregado; offline ele é omitido e o hash continua impresso para conferência.

## Estrutura do código

Sem build: são módulos ES servidos direto (`<script type="module">`). O `app.js` é só a entrada.

```
app.js            entrada do PWA (importa src/main.js)
src/main.js       registra interface/eventos e chama boot()
src/boot.js       carrega o SDK, escolhe o backend e reage ao login
src/router.js     render() e tabela de rotas (#/clientes, #/vistoria/:id…)
src/core/         regras e infraestrutura (sem HTML de tela)
  config.js       VERSION, MODO, STORES e enums
  state.js        estado mutável (backend, usuário, vistoria aberta, assinatura)
  navigate.js     refresh()/setRenderer() — evita views <-> router
  dom.js          $, esc, fieldHtml, crud, sigPad, abrirMarcador
  utils.js        datas, formatação, sha/canon, compressão de imagem
  db/local.js     IndexedDB
  db/cloud.js     Firestore (cache offline)
  db/index.js     fachada all/get/put/del
  docs.js · checklist.js · tipos.js · fotos.js · laudo.js · pdf.js · auditoria.js · lixeira.js · migracao.js
src/ui/           chrome.js (sidebar, tema, busca) e events.js (eventos delegados)
src/views/        uma tela por arquivo
vendor/           jsPDF 2.5.1 UMD (MIT) usado só na geração do PDF
```

Três regras para não recriar o acoplamento antigo:

1. Tela não importa o roteador; chama `refresh()` de `src/core/navigate.js`.
2. Tela não fala com `L` nem com o Firestore; usa `all/get/put/del` de `src/core/db/index.js`.
3. Estado compartilhado só muda pelos setters de `src/core/state.js`.

Ao criar um módulo novo, acrescente o caminho em `MODULOS`, no `sw.js` — é o que mantém o app abrindo offline.

## Configuração do Firebase (feita uma vez)
1. Authentication → Método de login → E-mail/senha → Ativar. Crie os usuários em **Usuários → Adicionar usuário**.
2. Authentication → Configurações → Ações do usuário: **desative "Permitir criação (cadastro)"** para ninguém se cadastrar sozinho.
3. Authentication → Configurações → Domínios autorizados: adicione `san-conecta.github.io`.
4. Firestore Database → criar banco (produção, `southamerica-east1`).
5. Firestore → Regras: cole o conteúdo de `firestore.rules` **depois de trocar os e-mails** pelos dos usuários reais → Publicar.
6. Google Cloud → Faturamento → Orçamentos e alertas: crie um alerta (mesmo que o projeto esteja no plano gratuito).

Fotos ficam no Firestore (documentos próprios) enquanto o projeto estiver no plano Spark. Com o plano Blaze elas podem ir para o Cloud Storage.

## Limites conhecidos do MVP
- Dados na nuvem (Firestore), com cache offline. Mesmo assim, exporte **Backup** de vez em quando.
- Fotos e o PDF anexado ocupam documentos do Firestore (cota gratuita de 1 GiB no total); migrar para o Cloud Storage exige o plano Blaze.
- Sem papéis/permissões por usuário: quem está na lista de `firestore.rules` acessa tudo.
- Assinatura simples: registra nome, desenho, data/hora do aparelho e hash SHA-256 (textos e fotos). **Não registra IP** (exige servidor) e não tem validade jurídica qualificada.
- A ART não é emitida aqui: só se registra o número.

## Roadmap
| Versão | Conteúdo |
|---|---|
| 0.2 | **Feito:** módulo 1, Cadastros e Estrutura Base |
| 0.3 | Firebase Auth + Firestore/Storage (login e sincronização), regras de segurança |
| 0.4 | Marcação de anomalias sobre a foto, anexo do PDF da ART, orçamentos |
| 0.5 | Portal do cliente (ver/baixar laudo), cronograma |
| 1.0 | Primeiro laudo real fechado de ponta a ponta |
| 1.x | Manual do Proprietário (NBR 14037), pós-obra, manutenção preventiva |
| 2.x | Financeiro, compras, GED, base de normas/CDC |
| 3.x | Só se virar SaaS: assinaturas, multiempresa |

## Publicar no GitHub Pages
```bash
cd VISTORI-ENGENHARIA
git init -b main
git add .
git commit -m "v0.1.0 MVP inicial"
git remote add origin https://github.com/SAN-CONECTA/VISTORI-ENGENHARIA.git
git push -u origin main
```
Depois: repositório → Settings → Pages → Source: `main` / root.
URL: https://san-conecta.github.io/VISTORI-ENGENHARIA/

## Testar localmente
```bash
python3 -m http.server 8080
```
Abra http://localhost:8080

Testes automatizados do laudo/integridade/PDF (não publicam no Firebase):
```bash
node tests/integrity-core.mjs
node tests/integrity-app.mjs
FIREBASE_BIN=/caminho/para/firebase node tests/rules-integrity.mjs
```
