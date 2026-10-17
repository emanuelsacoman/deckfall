# Contexto operacional

Status: Active

Last reviewed: 2026-10-17

Source of truth for: ambiente, comandos de desenvolvimento/validação e evidências externas datadas

O [estado atual](project-state.md) responde o que existe; o [roadmap](roadmap.md) indica o marco permitido; [AGENTS.md](../AGENTS.md) define as regras permanentes. Este documento explica como operar a base. Fluxos e contratos pertencem aos [documentos de domínio](README.md); pendências reais ficam em [riscos e dívidas](riscos-e-dividas-tecnicas.md).

## Stack verificada

Versões resolvidas nos locks, não apenas ranges declarados nos manifests:

| Camada | Versões atuais | Fonte |
| --- | --- | --- |
| Frontend | Angular 18.2.14, TypeScript 5.5.4 | package-lock.json |
| Firebase cliente | AngularFire 18.0.1, Firebase SDK 10.14.1 | package-lock.json |
| Editor | Konva 10.7.1 diretamente, sem wrapper Angular | package-lock.json |
| Backend | Functions 7.4.0 Gen 2, Admin SDK 14.5.0, TypeScript 5.9.3; Node.js 22 | functions/package.json e functions/package-lock.json |

## Operação

Os scripts são definidos em [package.json](../package.json) e [functions/package.json](../functions/package.json). No Windows, use `npm.cmd` para evitar depender da política de execução de scripts PowerShell.

```powershell
npm.cmd ci
npm.cmd --prefix functions ci
npm.cmd start
```

O frontend abre em `http://localhost:4200`. O gerador inicial já foi executado: não repetir `npm run setup`, pois ele pode sobrescrever arquivos auxiliares.

Copie [environment.example.ts](config/environment.example.ts) para `src/environments/environment.ts` e `environment.development.ts`, preenchendo somente os valores públicos do Web App. Desenvolvimento usa `production: false`. Os arquivos reais são ignorados; nunca registrar senhas, tokens, chaves privadas ou service accounts.

Sem a opção explícita de emuladores, localhost acessa o Firebase configurado no environment. Portanto, localhost não significa dados isolados. Provedores, domínios e primeiro admin são tratados em [autenticação e admin](autenticacao-e-admin.md); preparação/conteúdo inicial em [bootstrap](player-bootstrap.md) e [pacotes](pacotes.md).

## Backend e emuladores

Backend mantém dependências e lock separados em `functions/`, com Node.js 22. Frontend não importa Admin SDK. Callables e provider Angular usam explicitamente `southamerica-east1`; a região do backend está em [functions/src/config.ts](../functions/src/config.ts) e a integração frontend em [app.config.ts](../src/app/app.config.ts). Ao usar outro projeto, verificar a localização e ajustar os dois lados juntos.

```powershell
npm.cmd run build:functions
npm.cmd run emulators:start
```

O script inicia Auth, Firestore, Storage e Functions no projeto isolado `demo-cardgame`. Copie [environment.emulators.example.ts](config/environment.emulators.example.ts) somente para `environment.development.ts`; preserve a configuração de produção.

A proteção em [firebase-runtime-config.ts](../src/app/model/services/fire/firebase-runtime-config.ts) permite emuladores apenas com `firebaseEmulators: true`, `production: false`, projeto `demo-` e hostname loopback. Não misturar serviços locais e reais. O roteiro completo cadastro → starter lacrado → abertura → coleção está em [pacotes: localhost isolado](pacotes.md#localhost-isolado).

| Serviço | Host/porta em firebase.json |
| --- | --- |
| Auth | 127.0.0.1:9099 |
| Firestore | 127.0.0.1:8080 |
| Storage | 127.0.0.1:9199 |
| Functions | 127.0.0.1:5001 |
| Emulator UI | 127.0.0.1:4000 |

Sem export/import explícito, reiniciar os emuladores descarta dados. Fixtures locais do bootstrap antigo podem ser recriadas; isso não autoriza apagar marcadores ou reconceder starter em produção.

Os testes registrados usaram Node.js 22.23.3, Firebase CLI 15.9.0 e Java 21. Nesta máquina há Node portátil em `.local-tools/bootstrap-node22/node-v22.23.3-win-x64` e Java portátil sob `.local-tools`, ambos ignorados. Verificar disponibilidade e acrescentar os diretórios somente ao PATH da sessão; não alterar runtimes globais por rotina.

## Comandos de validação

```powershell
npm.cmd test -- --watch=false --browsers=ChromeHeadless
npm.cmd run build -- --configuration production
npm.cmd run test:gameplay
npm.cmd run test:rules
npm.cmd run build:functions
npm.cmd run test:functions
npm.cmd run test:functions:emulator
git diff --check
git status --short
```

Angular/Jasmine/Karma exige Chrome. Rules e integração exigem Java/Firebase CLI compatíveis; backend exige Node.js 22. `test:rules` usa Firestore/Storage em `demo-cardgame`; `test:functions:emulator` compila Functions e usa Auth/Firestore/Functions no mesmo projeto isolado. `test:gameplay` compila o módulo puro, executa testes de tipos e Node Test Runner sem emuladores; a execução registrada usou Node.js 22. Não existe script de lint configurado.

`shared/gameplay` tem build isolado com TypeScript já instalado na raiz: `build:gameplay` gera JS/CommonJS e declarações em `shared/gameplay/lib`, ignorado pelo Git; `typecheck:gameplay` verifica casos positivos/negativos de tipos sem emitir arquivos. O Angular não importa o módulo nesta etapa, e Functions conserva seu `rootDir: src`. Para validar o contrato, execute explicitamente `test:gameplay`; o build Angular sozinho não o verifica. API e limites estão em [Gameplay Contract](gameplay-contract.md).

A porta backend de decks consome somente tipos; o domínio delete também reutiliza o parser em runtime. `functions/src/gameplay.d.ts` encaminha as declarações geradas e os scripts `build`, `typecheck`, `test` e `test:integration` em `functions/package.json` executam antes `npm --prefix .. run build:gameplay`. Após o TSC, [copy-gameplay.cjs](../functions/scripts/copy-gameplay.cjs) copia a saída compartilhada inteira para `functions/lib/gameplay` no build e `functions/lib-test/src/gameplay` nos testes. `typecheck` não emite/copia arquivos. Nenhum parser/schema é duplicado em fonte; o runtime publicado fica dentro de `functions/`. Instalar dependências da raiz e de Functions continua necessário; `rootDir`, `outDir`, `main: lib/index.js`, dependências e configs Firebase foram preservados. O frontend continua sem importar gameplay.

O predeploy local existente em `firebase.json` compila Functions antes de um upload autorizado. `functions/package.json` tem `gcp-build` vazio para usar esse `lib/` pré-compilado e impedir recompilação remota dependente de `../shared`/`../package.json`, ausentes no pacote de origem. Essa opção de controle do build é documentada em [Node.js runtime — NPM build script](https://docs.cloud.google.com/run/docs/runtimes/nodejs#npm_build_script). Não publicar fontes sem executar o build local; isso não autoriza deploy nem comprova o pipeline remoto nesta tarefa.

Selecionar verificações pelo impacto real da tarefa, conforme [AGENTS.md](../AGENTS.md). Em trabalho exclusivamente Markdown, revisar conteúdo, diff, links relativos, coerência dos status e escopo dos arquivos; não apresentar resultados anteriores como testes recém-executados. Mudanças de runtime, contratos, autorização ou Rules exigem os checks correspondentes.

Falhas `EPERM` ao resolver o perfil Windows ocorreram em execuções anteriores no sandbox. Não são falhas de domínio nem justificam alterar testes/segurança. Inspecionar o erro e seguir a aprovação de execução exigida pelo ambiente; não presumir autorização permanente.

### Validação disponível

No **incremento de domínio delete em 17/10/2026**, `npm.cmd run test:gameplay` passou com **145/145**, `npm.cmd --prefix functions test` passou com **88/88** (74 anteriores + 14 novos de delete), e `npm.cmd run build:functions` passou, todos exit 0 com Node.js 22.23.3 portátil no sandbox. O teste backend compilou também os casos de tipos, portanto não foi necessário repetir `typecheck` separado. Logs locais ignorados: `.local-tools/delete-deck-gameplay-tests.log`, `.local-tools/delete-deck-backend-tests.log`, `.local-tools/delete-deck-build-functions.log`. Cobertura: request antes de transação, UID confiável, get/not-found/conflito/delete, versões sem fallback/incremento, drafts incompletos sem catálogo/posse, nenhuma leitura de capacidade ou create/replace, falhas do store intactas, entradas frozen e repetição/replay sem exactly-once. Os testes dos erros foram corrigidos para conservar stack nativa interna sem contexto sensível; nenhum serializer ou mapper público foi criado.

O artefato `functions/lib` foi copiado para um diretório local isolado e carregou parser/delete com **13 módulos internos e zero módulos runtime externos**, incluindo rejeição de payload forjado e fluxo válido com store de teste. Recibo local ignorado: `.local-tools/delete-deck-isolated-artifact-check.json`. Isso valida o empacotamento local, sem comprovar deploy, Firestore ou atomicidade real. Angular, Rules e emuladores não foram executados; não houve escrita remota, adapter, nova Callable, contador ou implementação do hard cap. O caso obrigatório 19 + duas criações continua pendente.

No **incremento da porta backend de decks em 17/10/2026**, `npm.cmd run test:gameplay` passou com **145/145**, `npm.cmd run build:functions` passou e `npm.cmd run test:functions` passou com **74/74** (67 anteriores + sete novos), todos exit 0 com Node.js 22.23.3 portátil no sandbox. O último comando também compilou os casos positivos/negativos de tipos do store. Logs locais ignorados: `.local-tools/deck-store-gameplay-tests.log`, `.local-tools/deck-store-build-functions.log` e `.local-tools/deck-store-test-functions.log`. Cobertura nova: erros/códigos distintos e contexto mínimo, tipos compartilhados, UID externo, leitura limitada derivada da constante e operações distintas no callback; a política de stack foi corrigida no incremento de delete acima. Inspeção do código emitido confere ausência de dependência runtime compartilhada na porta; build não é comprovação de deploy. Sem adapter, domínio CRUD, contador, quota ou atomicidade implementados naquela etapa. Angular, Rules e emuladores não foram executados; o teste concorrente 19 + duas criações continua pendente. Não houve operação remota ou deploy.

No **incremento puro de recurso/mutações de Deck Builder em 17/10/2026**, `npm.cmd run test:gameplay` passou com **145/145 testes**, incluindo os 115 anteriores e 30 novos. Build TypeScript e testes de tipos também passaram, exit 0, com Node.js 22.23.3 portátil no sandbox; evidência local ignorada: `.local-tools/personal-deck-resources-gameplay-tests.log`. A cobertura verifica os seis parsers, timestamps ISO UTC/calendário/ordem, versões independentes, nomes, campos extras/autoridade, getters sem execução, frozen/detached e regressão de rascunhos/Deck Rules/compatibilidade. `decks.ts` e o helper de compatibilidade ficaram inalterados; a extração privada de nome preserva o contrato de rascunhos. Não houve Firebase, Functions, Rules, UI, adapters, dependências novas, CRUD, concorrência real ou quota. Angular/Firebase/Functions/emuladores não foram executados, conforme escopo isolado autorizado. O caso obrigatório 19 + duas criações continua pendente para futura persistência. Não houve deploy ou operação remota.

No **incremento puro de rascunhos pessoais de Deck Builder em 17/10/2026**, `npm.cmd run test:gameplay` passou com **115/115 testes**, incluindo os 79 anteriores e 36 novos testes de rascunhos/regressão. O script concluiu build TypeScript e testes de tipos, exit 0, usando Node.js 22.23.3 portátil no sandbox; evidência local ignorada: `.local-tools/personal-deck-drafts-gameplay-tests.log`. A cobertura verifica composição vazia/parcial/completa, limites, agregação, conflitos, nomes Unicode, ordem ASCII, entradas estritas/adversariais e resultado independente. Também confirma que Deck Rules continua exigindo 24 cartas e que o helper de compatibilidade preserva seu comportamento; ambos ficaram inalterados. O módulo continua isolado, sem dependências novas, Firebase, UI, Functions ou Rules. Angular, Rules, Functions e emuladores não foram executados neste incremento; não houve persistência, deploy ou operação remota. O hard cap de 20 decks e sua prova concorrente continuam pendentes para a futura persistência.

No **primeiro incremento puro de Deck Builder em 17/10/2026**, `npm.cmd run test:gameplay` passou com **79/79 testes**, incluindo os 59 anteriores e 20 novos testes de compatibilidade. O mesmo script concluiu build TypeScript e testes de tipos, exit 0, usando Node.js 22.23.3 portátil no sandbox; evidência local ignorada: `.local-tools/deck-compatibility-gameplay-tests.log`. `validateGameplayDeckAgainstActiveCatalog` somente adapta a versão do envelope em memória e delega ao Deck Rules existente; `decks.ts` e treino permaneceram inalterados. O módulo segue isolado, sem nova dependência ou integração Firebase/UI/Functions. Angular, Rules, Functions e emuladores não foram executados neste incremento, conforme seu escopo autorizado. O hard cap de 20 decks não foi implementado ou testado; o teste obrigatório de 19 + duas criações continua pendente para a futura persistência. Não houve deploy ou operação remota.

Na melhoria de **qualidade de vida do editor, concluída em 17/10/2026**, a suíte Angular completa passou com **620/620 testes**, Chrome Headless 155 e exit 0: `.local-tools/editor-qol-angular-tests-complete.log`. O build Angular de produção passou sem avisos, exit 0: `.local-tools/editor-qol-build-final.log`. A cobertura adicionada verifica cor/paleta sem conversão de strings existentes, rascunhos inválidos e cancelamento, percentuais/precisão e inteiros, setas/Shift com histórico agrupado, foco/restrições dos atalhos, renomeação, ações de imagem, alinhamento, zoom e Dados. O schema persistido, o validador de canvas, Firebase, gameplay e dependências foram preservados.

A primeira execução completa teve timeouts em testes ornamentais existentes e falhas subsequentes de pixels; os nove testes ornamentais passaram isoladamente, e duas execuções completas posteriores passaram, incluindo a final acima. Não houve alteração nesses testes ou no renderer para contornar as falhas. Chrome e build encontraram restrições de acesso no sandbox; as execuções correspondentes fora dele tiveram escalada aprovada. Não houve QA manual responsivo ou autenticado em produção, acesso a dados remotos ou deploy. Rules, backend, integração e gameplay não foram repetidos nesta melhoria exclusivamente local do editor; seus resultados anteriores permanecem identificados abaixo.

Na implementação de **Deck Rules em 15/10/2026**, `test:gameplay` passou com **59/59 testes**, além do build TypeScript e dos testes de tipos. Inclui os 45 casos anteriores de Gameplay Contract/Typed Effects e 14 casos de decks: tamanho, cópias únicas/duplas/agregadas, revisão e conteúdo canônicos, elegibilidade, quantidades pessoais, referência exata de treino, ordenação determinística, entradas adversariais, erros seguros e ausência de mutação/concessão. O build Angular de produção passou sem avisos. O módulo permanece isolado: nenhum Deck Builder, persistência ou executor de efeitos/batalha foi implementado.

Na etapa de Deck Rules, build/testes de gameplay passaram com Node.js 22 portátil no sandbox. O build Angular primeiro falhou com acesso negado na resolução dos arquivos locais; a mesma execução fora do sandbox, com escalada aprovada, passou. Nenhum deploy, acesso remoto, alteração de Rules, dados persistidos ou dependências ocorreu. Suítes Angular, Rules, backend e integração não foram repetidas naquela etapa: o módulo novo ainda não é importado por esses caminhos. Os resultados abaixo conservam sua identificação por escopo e data.

| Verificação | Resultado registrado | Evidência e escopo |
| --- | --- | --- |
| Jasmine/Karma | 620/620, Chrome Headless 155 | Editor QoL, 17/10: `.local-tools/editor-qol-angular-tests-complete.log`, exit 0 |
| Gameplay Contract + Typed Effects + Deck Rules + contratos pessoais | Build, testes de tipos e 145/145 Node Test Runner | Regressão de delete, 17/10: `.local-tools/delete-deck-gameplay-tests.log`, exit 0 |
| Build Angular de produção | Aprovado, sem avisos | Editor QoL, 17/10: `.local-tools/editor-qol-build-final.log`, exit 0 |
| Firestore/Storage Rules | 56/56 em demo-cardgame | Anterior: revisão documental de 15/10, `npm.cmd run test:rules`, exit 0 |
| Build Functions | Aprovado | Domínio delete, 17/10: `.local-tools/delete-deck-build-functions.log`, exit 0 |
| Domínio backend + decks | 88/88 e testes de tipos | Domínio delete, 17/10: `.local-tools/delete-deck-backend-tests.log`, exit 0; anterior tinha 74/74 |
| Integração Callable | 15/15 em demo-cardgame | Anterior: `.local-tools/preview-fix-test-functions-emulator.log` |

A cobertura atual pode ser conferida em specs junto aos serviços/componentes, [functions/tests](../functions/tests) e [tests/rules/cardgame.rules.test.mjs](../tests/rules/cardgame.rules.test.mjs). Inclui concessão/abertura transacionais e idempotentes, versão histórica, concorrência/limites/falhas sem writes parciais, negação de writes de member, reveal/revisão, MIME com SDK instalado, retry/lifecycle de URLs e reparo administrativo. Testes locais não comprovam sessão real em produção.

## Evidências externas registradas

Esta seção conserva fatos de configuração/publicação confirmados nas intervenções anteriores e seus limites. **Nenhuma consulta remota ou alteração de produção foi realizada nesta revisão documental.** Recibos ignorados são apoio local e não estão disponíveis automaticamente em outro clone; quando necessário, conferir o estado remoto novamente por leitura autorizada.

| Elemento | Último registro disponível | Fonte/limite |
| --- | --- | --- |
| Projeto, bucket e Hosting | `cardgame-6fdcb`, `cardgame-6fdcb.firebasestorage.app`, site `deckfall`, `https://deckfall.web.app` | firebase.json + environments locais + leituras anteriores; não substituir nomes por suposição |
| Região Firestore | `southamerica-east1` | Leitura de 12/10; `.local-tools/player-bootstrap-firestore-location.json` |
| Infraestrutura de pacotes | initializePlayer/openPack e Firestore Rules/Hosting publicados com autorização em 13/10 | Registro operacional anterior e histórico do Git; não autoriza outra publicação |
| Conteúdo inicial | Nyra publicada; StarterPack ativo, versão 1, uma cópia | Configuração de 14/10 descrita abaixo |
| Firestore/Storage Rules | Remotas iguais às locais na leitura de 15/10 | `.local-tools/preview-diagnosis-readonly.json`; não é auditoria de todos os dados |
| Integração Storage → Firestore | Papel exigido presente na leitura de 15/10 | Mesmo recibo; não substitui sessão member |
| Auth Authorized domains | localhost, cardgame-6fdcb.firebaseapp.com, cardgame-6fdcb.web.app, deckfall.web.app | Leitura de 15/10; provedores e Google/redirect real não auditados |
| CORS | GET localhost:4200 e deckfall.web.app, maxAge 3600, metageneration 3 | Leitura de 15/10; procedimento e detalhes em [CORS](configuracao-cors-storage.md) |
| Correção local de previews | Código corrigido e testes aprovados; sem deploy registrado dessa correção | Validação autenticada e publicação permanecem em [riscos](riscos-e-dividas-tecnicas.md#configuração-externa-e-pendências) |

`firebase.json` aponta Hosting para `dist/card-game/browser` com rewrite SPA `** → /index.html`; `.firebaserc` está ausente. Comandos remotos devem preservar projeto/site explicitamente. A falta de openPack/starter registrada no diagnóstico de 13/10 foi superada pela publicação e configuração posteriores; não tratá-la como pendência atual.

### Diagnóstico da preparação bloqueada — 13/10/2026

Incidente encerrado: a leitura de 13/10 encontrou initializePlayer ativa, mas openPack, configuração inicial e cartas publicadas ausentes. A publicação autorizada das duas Callables/Rules/Hosting e a configuração de Nyra/StarterPack no dia seguinte superaram essas ausências. O recibo histórico `.local-tools/starter-error-readonly.json` não representa o estado posterior. O gate continua sendo obrigatório: outro ambiente sem pré-condições válidas deve falhar sem concessão parcial.

### Configuração do StarterPack com Nyra — 14/10/2026

O proprietário escolheu uma cópia de **Nyra**, ID `46f5c359-0d1e-423e-911e-4ba592567405`. A carta foi publicada e `packDefinitions/starter` + `versions/1` criadas no mesmo commit, com datas de servidor e precondições de versão/ausência. Nome `StarterPack`, `active: true`, `currentVersion: 1`; a versão contém somente Nyra com `quantity: 1`. Documento/configuração/imagem foram relidos na intervenção; a arte original foi preservada.

Preparação, abertura e repetição foram exercitadas localmente com o backend. Nenhum player, pack ou coleção foi criado diretamente em produção para simular o fluxo, e a sessão real de um jogador não foi validada nessa intervenção. Recibos originais ficaram em `work/nyra-current` no ambiente do chat de execução, fora do repositório. A leitura de 15/10 abaixo fornece evidência local disponível de Nyra/preview, mas não relê a configuração do starter.

### Diagnóstico das previews publicadas — 15/10/2026

A causa e o contrato da correção estão em [coleção](colecao.md#diagnóstico-de-15102026): o limite opcional de `getBlob` no SDK instalado removia o MIME via `Blob.slice`. O adapter atual omite esse argumento e mantém validação estrita depois do download. O problema de MIME está corrigido no código; QA member e disponibilização no Hosting são pendências distintas.

O recibo seguro `.local-tools/preview-diagnosis-readonly.json`, relido nesta revisão, registra `checkedAt: 2026-10-15T21:04:33.681Z` e `remoteWrites: false`. A identidade utilizada foi OAuth da CLI, sem request autenticado de navegador.

| Objeto conferido | Resultado registrado |
| --- | --- |
| Nyra | status published; updatedAt 2026-10-14T22:27:37.186Z |
| PNG publicado | `published-cards/46f5c359-0d1e-423e-911e-4ba592567405/preview.png` |
| Conteúdo | image/png, 2.575.604 bytes, 1086 × 1448; private, no-store |
| Geração | 1792016860478126, atualização 2026-10-14T22:27:40.508Z |
| GET/Range com as duas origens | HTTP 206, bytes PNG completos e Access-Control-Allow-Origin correspondente |
| Hash dos bytes | `feede87a3556cee8704cc1a9f96d33a2e23f2f8b488f063821bfa38a7c479e1e` |

O titular confirmou funcionamento no localhost com perfil admin/admin; não identificou individualmente coleção, reveal e resumo nem forneceu Network HTTP/código/MIME. Leituras OAuth não avaliam as Rules como member. O escopo de QA ainda necessário e as demais dívidas são mantidos somente em [riscos](riscos-e-dividas-tecnicas.md).

## Operações remotas futuras

Deploy e alterações remotas exigem autorização explícita para o escopo concreto. Autorizações de intervenções anteriores não persistem como permissão genérica. A preparação de memória documental não executa o roadmap nem publica nada.

O procedimento da correção local identifica somente Hosting como componente a publicar após autorização; os comandos revisáveis estão em [pacotes: publicação posterior](pacotes.md#publicação-posterior). Não há mudança demonstrada de Functions, Rules, CORS, IAM, Auth ou índices necessária para esse defeito. Para CORS, preservar entradas existentes e usar o [roteiro específico](configuracao-cors-storage.md#aplicar-somente-quando-a-alteração-remota-estiver-autorizada).

Antes de alterar conteúdo inicial, ler [configuração/versionamento de pacotes](pacotes.md#configurar-o-starter). Nova versão afeta futuras concessões; preservar definitionVersion de instâncias históricas e nunca editar versões existentes ou apagar marcadores para regrant.
