# VISTORI-ENGENHARIA

Sistema de vistorias e laudos de engenharia. **MVP v0.1.0**, uso interno (não é SaaS).

## O que já faz
Cadastros (clientes PF/PJ, imóveis/obras, fornecedores e empreiteiros, tipos de serviço, tabela de preços, catálogo)
→ Vistoria (checklist + fotos) → Assinatura → Laudo em PDF.

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
- Fotos ocupam documentos do Firestore (cota gratuita de 1 GiB no total); migrar para o Cloud Storage exige o plano Blaze.
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
