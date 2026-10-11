# Contexto operacional

O projeto pertence a Emanuel Sacoman. CardGame é a base Angular da plataforma de cartas digitais; Firebase Hosting aponta para o site `deckfall`. O requisito mais recente evolui criação/edição para editor visual Konva e restabelece login/cadastro por e-mail/senha e Google. Novas contas são membros; admin exige `role` e `roleId` iguais a `admin`. Sem jogo, marketplace, decks ou RBAC complexo. Leia [editor](editor-de-cartas.md) para canvas próprio, templates e limites.

## Reconhecimento em 11/10/2026

- O gerador inicial já foi executado. Existiam `model/interfaces`, `model/services`, `view` e assets vazios, tela padrão Angular e nenhuma rota.
- Versões instaladas: Angular 18.2.14, AngularFire 18.0.1, Firebase 10.14.1 e TypeScript 5.5.4. Framework preservado. `@firebase/rules-unit-testing` 3.0.4 verifica Rules; Konva 10.7.1 foi acrescentado para renderização do editor, sem wrapper Angular.
- `app.config.ts` já fornecia Firebase App/Auth. Os dois environments locais contêm configuração pública do SDK para `cardgame-6fdcb`; estão ignorados pelo Git.
- `firebase.json` continha apenas Hosting (`dist/card-game/browser`, rewrite SPA, site `deckfall`); não havia `.firebaserc` nem Rules.
- Havia mudanças locais em `.gitignore`, README, Angular/package/lock/config e arquivos do gerador. Não desfazer esse trabalho.
- Referência conceitual: `emanuelsacoman/ecommercecoffee`, branch `main`, snapshot `ec3ebf61218848767cea5572154f2c0e1eac3bcc`: standalone, inject, sessão signal, guard funcional, shell admin lazy e services por responsabilidade. Não transportar compat, presença/XP ou permissões complexas daquele domínio.

## Operação

`npm.cmd start` inicia desenvolvimento; `npm.cmd run build -- --configuration production` compila produção; `npm.cmd test -- --watch=false --browsers=ChromeHeadless` roda Jasmine/Karma. Não execute `npm run setup` numa base já preparada: o gerador sobrescreve arquivos auxiliares.

Leia [autenticação](autenticacao-e-admin.md) para provedores/primeiro admin e [riscos](riscos-e-dividas-tecnicas.md) antes de depender do backend. Cadastro não concede cargos administrativos; não relaxe Rules. A configuração pública Firebase não é credencial administrativa. Novos clones precisam reproduzir os environments locais; nenhum segredo deve entrar no repositório.

`/login` também é Minha conta quando autenticado, com métodos lidos do Auth, vínculo Google/senha ao mesmo UID e reautenticação antes de adicionar senha. O admin tem um atalho para essa tela. Recuperação usa `sendPasswordResetEmail` e o handler hospedado padrão; não altera Firestore nem sessão. Não persistir senhas durante fallback/redirect e não usar `contactEmail` como credencial. Veja [os fluxos](autenticacao-e-admin.md).

Não fazer deploy nesta tarefa. Futuras funcionalidades devem acrescentar domínios quando necessários, sem services vazios antecipados.

## Validação desta fundação — 11/10/2026

- Jasmine/Karma: 142 testes aprovados, cobrindo Auth/cadastro/guards, popup/redirect/vinculação Google e senha, recuperação sem mudança de sessão, Minha conta e limpeza em troca externa de UID, state/history, painéis, canvas/exportação real, cache por origem, rascunho IndexedDB e persistência/reabertura do editor com repositório substituível em testes.
- Security Rules: 17 cenários aprovados em `demo-cardgame`, incluindo cadastro member, cartas/templates/assets, perfis, revogação e os limites completos de oito atributos, 64 elementos e 24 assets. Permission-denied em operações que devem ser negadas é esperado.
- Build de produção passou. TypeScript com `--noUnusedLocals --noUnusedParameters` e `git diff --check` passaram. Não há script de lint configurado.
- Foi necessário executar Node/CLI fora do sandbox que retornava `EPERM` ao resolver caminhos do perfil Windows. Essa execução não realizou deploy.
- A ferramenta de automação não disponibilizou navegador conectado para QA visual manual. Canvas/export foram exercitados no Chrome headless, incluindo dimensões e pixels. OAuth Google, vínculo de senha, entrega de recuperação e persistência contra Firebase remoto não foram testados com contas reais; provedores/domínios/templates/CORS/IAM e publicação continuam pendências externas do proprietário.

Para repetir Rules nesta máquina com o runtime portátil já obtido, prefixe o PATH apenas na sessão PowerShell com o diretório `bin` dentro de `.local-tools/java21` e execute `npm.cmd run test:rules`. Não modificar Java do sistema. Em outro ambiente, use Java 21 e Firebase CLI disponíveis. [Referência oficial dos testes de Rules](https://firebase.google.com/docs/rules/unit-tests).
