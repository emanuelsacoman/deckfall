# Contexto operacional

O projeto pertence a Emanuel Sacoman. CardGame é a base Angular da plataforma de cartas digitais; Firebase Hosting já aponta para o site `deckfall`. A pedido do proprietário, a fase atual foi simplificada: abrir diretamente admin → painel → telas de cartas e usuários. `/login` é somente placeholder para implementação futura. Não há serviço de sessão, guards nem provider Auth. As Rules dos dados seguem exigindo administrador; a integração administrativa com Firebase depende de autenticação futura. Sem jogo, cadastro público, marketplace, decks ou RBAC complexo.

## Reconhecimento em 11/10/2026

- O gerador inicial já foi executado. Existiam `model/interfaces`, `model/services`, `view` e assets vazios, tela padrão Angular e nenhuma rota.
- Versões instaladas (`npm.cmd ls`): Angular 18.2.14, AngularFire 18.0.1, Firebase 10.14.1; TypeScript 5.5.4. Não houve mudança de framework. Acrescentado apenas `@firebase/rules-unit-testing` 3.0.4 como dependência de desenvolvimento para comprovar Rules.
- `app.config.ts` já fornecia Firebase App/Auth. Os dois environments locais contêm configuração pública do SDK para `cardgame-6fdcb`; estão ignorados pelo Git.
- `firebase.json` continha apenas Hosting (`dist/card-game/browser`, rewrite SPA, site `deckfall`); não havia `.firebaserc` nem Rules.
- Havia mudanças locais em `.gitignore`, README, Angular/package/lock/config e arquivos do gerador. Não desfazer esse trabalho.
- Referência conceitual: `emanuelsacoman/ecommercecoffee`, branch `main`, snapshot `ec3ebf61218848767cea5572154f2c0e1eac3bcc`: standalone, inject, sessão signal, guard funcional, shell admin lazy e services por responsabilidade. Não transportar compat, presença/XP ou permissões complexas daquele domínio.

## Operação

`npm.cmd start` inicia desenvolvimento; `npm.cmd run build -- --configuration production` compila produção; `npm.cmd test -- --watch=false --browsers=ChromeHeadless` roda Jasmine/Karma. Não execute `npm run setup` numa base já preparada: o gerador sobrescreve arquivos auxiliares.

Leia [autenticação](autenticacao-e-admin.md) para o estado atual e a integração futura e [riscos](riscos-e-dividas-tecnicas.md) antes de depender do backend. Não reintroduza login ou relaxe Rules sem solicitação do proprietário. A configuração pública Firebase não é credencial administrativa. Novos clones precisam reproduzir os environments locais; nenhum segredo deve entrar no repositório.

Não fazer deploy nesta tarefa. Futuras funcionalidades devem acrescentar domínios quando necessários, sem services vazios antecipados.

## Validação desta fundação — 11/10/2026

- Jasmine/Karma: 41 testes aprovados após a simplificação, cobrindo navegação direta sem providers Auth, placeholder, formulários/listas, validações e UID imutável. Testes da autenticação removida foram retirados junto da implementação.
- `npm.cmd run test:rules`: 13 cenários aprovados em Firestore/Storage locais `demo-cardgame`; cobre admin CRUD, gestão/promover terceiros, bootstrap mínimo, auto-rebaixamento/exclusão/autopromoção negados, revogação, published público, schema, oito atributos com arte, tipos/tamanho de imagem, overwrite negado e cleanup de órfão. Erros permission-denied nas operações que devem ser negadas são esperados.
- Build de produção da versão simplificada passou. TypeScript da aplicação e dos specs passou com `--noUnusedLocals --noUnusedParameters`; `git diff --check` passou.
- Foi necessário executar Node/CLI fora do sandbox que retornava `EPERM` ao resolver caminhos do perfil Windows. Essa execução não realizou deploy.
- A ferramenta de automação não disponibilizou navegador conectado; não houve QA visual manual nem login contra Firebase remoto. As configurações do Console continuam pendências de verificação do proprietário.

Para repetir Rules nesta máquina com o runtime portátil já obtido, prefixe o PATH apenas na sessão PowerShell com o diretório `bin` dentro de `.local-tools/java21` e execute `npm.cmd run test:rules`. Não modificar Java do sistema. Em outro ambiente, use Java 21 e Firebase CLI disponíveis. [Referência oficial dos testes de Rules](https://firebase.google.com/docs/rules/unit-tests).
