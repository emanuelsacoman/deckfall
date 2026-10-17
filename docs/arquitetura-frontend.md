# Arquitetura frontend

Angular 18 standalone, `inject()`, Reactive Forms, signals e RxJS quando necessário. Firebase modular, sem compat. O projeto mantém CSS; o editor não reorganiza a base nem migra frameworks.

```text
view = apresentação/orquestração
model/interfaces = contratos
model/services/cruds = domínio/persistência
model/services/fire = infraestrutura Firebase/Auth/Storage/Functions
model/services/tools = estado, validação e utilitários reutilizáveis
model/guards = autorização de navegação e proteção de saída
functions/src = backend confiável, Admin SDK e operações de jogo
shared/gameplay/src = contrato puro de batalha/decks, reutilizado pelo backend em tipos e parsing de delete/rename/update
```

Componentes não acessam Firestore diretamente. `AuthService` resolve sessão/perfil; `CardService`, `CardTemplateService`, `UserService`, `PlayerCollectionService` e `PackDefinitionService` persistem seus domínios. `CardStorageService` organiza arquivos editáveis e materializa uploads/cópias; `PublishedCardStorageService` trata a imagem final publicada em namespace separado. Guard não substitui Rules.

## Contrato puro de gameplay

O [Gameplay Contract](gameplay-contract.md) fica em `shared/gameplay/src`, fora do build Angular. Usa TypeScript/ECMAScript sem Angular, Firebase, Konva, Node ou DOM no domínio; scripts próprios na raiz compilam/testam o módulo. `functions/src/gameplay.d.ts` encaminha as declarações compartilhadas sem criar outro contrato; as portas de decks mantêm imports apenas de tipos e os domínios de exclusão/renomeação/atualização e o helper de referências históricas reutilizam parsers em runtime. O build copia o módulo compilado para `functions/lib/gameplay` e `functions/lib-test/src/gameplay`, conforme alvo, sem ampliar `rootDir: src`, alterar `lib/index.js` ou carregar arquivos fora do artefato. O frontend não importa esse módulo. O build remoto usa o JavaScript pré-compilado pelo predeploy; procedimento no [contexto operacional](contexto-operacional-para-ias.md#comandos-de-validação). A decisão de isolamento está no [ADR-0005](decisions/0005-contrato-gameplay-puro.md).

Perfis de batalha, cópias físicas, snapshot autoritativo, intenções e visões não dependem de `Card`/canvas ou atributos livres do editor. Parsers validam formato e parâmetros aprovados dos efeitos, invariantes conferem snapshots estáveis e uma whitelist produz a visão do participante. Essa projeção exige snapshot previamente validado e seat derivado de autenticação/autorização pela futura integração; não cria uma fronteira de acesso sozinha.

`effects.ts` contém catálogo fechado, parsing e validação de destinatários, sem executor. Os helpers estruturais ficam em `contract-validation.ts`; `targets.ts` compartilha o formato dos alvos. Imports entre contratos/efeitos usam tipos quando necessário, sem ciclos de runtime. O helper de efeitos recebe snapshot validado, seat confiável e efeito da definição canônica; valida somente destinatário, sem autenticar ou conferir fase/turno/custo. A API está em [efeitos tipados e alvos](gameplay-contract.md#efeitos-tipados-e-alvos).

`decks.ts` separa os parsers `parseGameplayDeckList` e `parseGameplayDeckCatalog` da validação pura de composição por `validateGameplayDeck`. O parser de catálogo existente foi exposto sem alterar suas regras, para reutilização defensiva no backend. O contexto confiável fornece catálogo versionado com perfil/revisão e elegibilidade por identidade, mais quantidades possuídas ou uma referência de treino cuja composição deve ser igual. O resultado independente agrega quantidades e usa definições canônicas em ordem ASCII; não cria instâncias. O módulo não autentica nem consulta inventário real, e o contexto não pode ser escolhido no payload do cliente. Contratos/limites têm fonte principal em [Deck Rules](gameplay-contract.md#deck-rules-e-contexto-confiável).

Deck Builder tem contratos puros, portas backend com erros, domínios de exclusão/renomeação/atualização e validação pura de referências históricas, sem adapters ou create/duplicate. Não há legalidade/transições de batalha, RNG concreto, persistência de decks/partidas, Callable de decks ou UI de partida; Decks/Jogar continuam placeholders. O marco permanece CURRENT e incompleto. Integrações de frontend, persistência e batalha permanecem futuras; a sequência permitida está no [roadmap](roadmap.md).

`PersonalDeckCatalogReader`, em [personal-deck-catalog.ts](../functions/src/decks/personal-deck-catalog.ts), é uma porta backend separada para conteúdo global por versão explícita. Reutiliza `GameplayDeckCatalog` apenas como tipo e não recebe UID, draft ou contexto de propriedade. Expõe somente get, sem escrita/ativação/active config; ausência é null, corrupção ou falha rejeitam a Promise por obrigação do adapter futuro. Não há reader concreto ou leitura Firebase. Detalhes em [Deck Builder](deck-builder.md#porta-backend-de-leitura-de-catálogo-versionado).

O helper [validatePersonalDeckDraftReferences](../functions/src/decks/validate-personal-deck-references.ts) recebe uma intenção e um `GameplayDeckCatalog` confiável já resolvido, sem consumir o reader. Reutiliza os parsers de draft e catálogo e confere apenas reconhecimento histórico da versão, identidades e revisões; `eligible: false` é aceito. Retorna um `PersonalDeckDraft` independente, sem autoridade de partida, ownership ou publicação. Erros estruturais/corrupção usam `GameplayContractError`; divergências de referência usam `PersonalDeckContentError`, sem payload sensível. A [regra pura](deck-builder.md#validação-pura-de-referências-históricas) permanece separada de I/O, salvamento e admissão contra catálogo ativo.

## Autoridade backend

`functions/src/decks` contém `PersonalDeckStore`/`PersonalDeckStoreTransaction`, erros, `PersonalDeckClock` e domínios de delete/rename/update. As operações recebem UID confiável separado e validam requests antes de I/O. Delete faz get/comparação/delete; rename faz get/comparação/no-op ou replace, com um instante confiável estável em retries e retorno independente. O store deve fornecer recursos normalizados; rename preserva composição e recusa regressão temporal/esgotamento. Delete/rename não consultam catálogo, propriedade ou capacidade. Semântica: [renomeação](deck-builder.md#operação-de-domínio-de-renomeação).

`updatePersonalDeck(uid, request, store, catalogReader, clock)` combina o parser de update, `PersonalDeckCatalogReader` e o helper histórico antes de iniciar a transação pessoal. O catálogo imutável solicitado é resolvido e validado uma vez, fora do callback. Ausência lança `PersonalDeckContentUnavailableError` (`personal-deck-content-unavailable`), sem contexto sensível. Cada tentativa faz get, confere existência e versão e compara os drafts normalizados; no-op devolve cópia sem incremento, data nova, clock ou replace, mas continua exigindo catálogo e referências válidos. Alteração explícita de conteúdo/revisão é aceita se reconhecida no catálogo escolhido; nunca há migração automática. Mudança real preserva ID/criação, calcula `stored.version + 1` e usa a mesma política de clock memoizado, regressão e esgotamento de rename. Replays recalculam o candidato sobre a leitura atual; retorno e write permanecem independentes. Não verifica ownership/publicação nem decide playability. Contrato completo em [atualização no domínio](deck-builder.md#operação-de-domínio-de-atualização).

A stack dos erros permanece interna, sem mapper de transporte. Não há imports Firebase nesses domínios/portas, adapters, create/duplicate, autenticação de decks ou nova Callable. Rules e UI de Deck Builder permanecem sem implementação.

O cliente pode solicitar operações de jogo, mas somente o backend confiável pode conceder propriedade ou valor ao jogador. `PlayerInitializationService` solicita `initializePlayer` sem enviar UID; `PlayerPackService` consulta instâncias próprias e solicita `openPack` somente com `packInstanceId`. Functions usam `request.auth.uid` e validam perfil/configuração/invariantes. O Admin SDK existe apenas em `functions/`, separado do build Angular, e ignora Security Rules: autenticação, autorização e invariantes são verificadas novamente no servidor.

`users/{uid}` conserva identidade e acesso. `players/{uid}` contém estado mínimo e auditoria da concessão única; `packDefinitions/starter` e `versions/{version}` definem conteúdo. Bootstrap grava somente uma instância lacrada em `users/{uid}/packs/starter` e marcador num commit único. Abertura consulta sua `definitionVersion` e soma propriedade em `users/{uid}/collection/{cardId}` atomicamente com estado/resultado. Não há starter direto ou escolha de conteúdo no frontend. Gestão manual administrativa conserva Rules; membros não escrevem coleção/player/packs, nem admin cliente escreve player/instância. Leia [bootstrap](player-bootstrap.md) e [pacotes](pacotes.md).

## Rotas e layout

Telas usam `loadComponent`. Raiz e rota desconhecida redirecionam para `/login`, que oferece entrar, registrar, Google e recuperação de senha. Com sessão ativa, a mesma rota apresenta Minha conta, métodos vinculados e adição de Google/senha ao mesmo UID.

| Rota | Tela |
| --- | --- |
| `/game` | Redireciona para `/game/home` |
| `/game/home` | Início e atalhos do jogador |
| `/game/colecao` | Coleção persistida, busca/filtro local e PNG completo publicado |
| `/game/pacotes` | Instâncias próprias lacradas e histórico de abertos |
| `/game/pacotes/abrir/:id` | Abertura autenticada, reveal manual e revisão do resultado |
| `/game/decks` | Meus decks, com placeholder |
| `/game/jogar` | Modos de jogo em desenvolvimento |
| `/game/perfil` | Nome, contato e papel já existentes; atalho para Minha conta |
| `/admin` | Redireciona para `/admin/dashboard` |
| `/admin/dashboard` | Atalhos administrativos |
| `/admin/cartas` | Redireciona para `/admin/cartas/lista` |
| `/admin/cartas/lista` | Catálogo, ações e reparo manual de previews publicadas |
| `/admin/cartas/criar` | Editor de nova carta |
| `/admin/cartas/editar/:id` | Editor com documento carregado |
| `/admin/pacotes` | Definições, configuração dedicada StarterPack, informações e novas versões imutáveis |
| `/admin/usuarios` | Redireciona para `/admin/usuarios/lista` |
| `/admin/usuarios/lista` | Perfis Firestore |
| `/admin/usuarios/criar` | Vínculo por UID de conta existente |
| `/admin/usuarios/editar/:uid` | Consulta/edição do perfil e gestão separada da coleção |

O shell administrativo possui `adminGuard` no pai e `adminChildGuard` nos filhos, observa revogação de acesso e oferece logout. O menu inclui Painel, Todas as cartas, Criar carta, Pacotes, Todos os usuários, Vincular perfil e os atalhos Minha conta e Área do jogador. Criação/edição de cartas usam wrappers pequenos; `cardEditorLeaveGuard` consulta alterações pendentes antes da saída. A raiz contém o router outlet; `app.config.ts` fornece App, Auth, Firestore, Storage e Functions.

`view/admin/admin-components/packs/` apresenta uma página de definições e formulários de configuração. `PackDefinitionService` concentra consultas, validação, datas e transações: definição + versão 1 são criadas juntas; versão nova + avanço do ponteiro também. A edição de metadados não reescreve conteúdo histórico. `StarterPack` é nome fixo da definição `starter`; demais pacotes recebem nomes que não normalizem para o reservado. O painel não concede instâncias/cartas, e definições adicionais ainda não possuem distribuição ao jogador. Leia [administração de pacotes](pacotes.md#administração-de-pacotes).

## Área do jogador

`view/game/` reúne `layout`, `home`, `collection`, `packs`, `decks`, `play` e `profile`. O layout é separado do administrativo, com identidade Deckfall, navegação Início/Coleção/Pacotes/Decks/Jogar/Perfil, indicação da conta e logout. Admins veem também Painel administrativo. As telas usam standalone, `loadComponent` e CSS próprio, sem nova biblioteca de UI.

`GameLayoutComponent` acompanha revogação de sessão/perfil e solicita o bootstrap pelo serviço ao entrar em `/game`. Mostra preparação ou erro com nova tentativa; monta o outlet somente depois de uma resposta válida. A ausência da definição inicial é diferenciada pelo detalhe seguro `starter-not-configured` da Callable; admins recebem link para configurar pacotes, sem afrouxar o gate. A coleção consulta normalmente pelo serviço existente e pode estar vazia enquanto o pack está lacrado. Sua sidebar no desktop se adapta a cabeçalho e navegação horizontal em telas menores; o CSS do tema fica no layout e os estilos comuns em `game-page.css`, sem substituir o tema administrativo.

`PlayerInitializationService` expõe estado, resultado e erro por signals, compartilha chamadas pendentes para o mesmo UID e reutiliza sucesso enquanto essa sessão permanecer ativa. Logout/perfil inválido/troca de UID limpa esse estado e respostas antigas não liberam a interface de outra conta. O SDK usa timeout de 30 segundos. Uma transação já aceita pelo servidor pode terminar depois do logout; a idempotência continua sendo a garantia backend, independente do cache local.

`authenticatedGuard` e `authenticatedChildGuard` aguardam a sessão e aceitam um UID com `role`/`roleId` consistentes em `member` ou `admin`. Perfil ausente, inválido ou não resolvido não libera `/game`; o destino solicitado segue em `returnUrl` para `/login`. Guards protegem navegação, sem ampliar permissões de Firestore/Storage.

Início oferece saudação/atalhos e consulta o starter próprio para destacar somente uma instância lacrada. Pacotes lista instâncias pelo `PlayerPackService`; a tela de abertura aguarda `openPack`, revela uma entrada por vez e mostra resumo. Um pacote aberto reconstrói o resultado persistido sem nova concessão. O serviço valida documentos/resposta e descarta retorno de sessão anterior; deduplica chamadas locais de abertura por UID/instância. Não contém writes Firestore.

Coleção consulta propriedade pelo `PlayerCollectionService`, resolve cartas publicadas e aplica busca/raridade localmente. `PlayerCardPreviewComponent` aceita a identidade da carta/snapshot usada na coleção, reveal e resumo, baixa somente PNG pelo `PublishedCardStorageService`, com loading, retry e liberação de object URLs; não usa renderer Konva ou assets privados. O cache compartilhado do pack conserva Promises bem-sucedidas e remove as rejeitadas ou com falha de exibição para permitir novo request. CSS de pacotes respeita `prefers-reduced-motion`. Decks/jogar permanecem placeholders. Perfil usa `AuthService` e encaminha credenciais para `/login`. Veja [coleção](colecao.md), [pacotes](pacotes.md), [autenticação](autenticacao-e-admin.md) e [riscos](riscos-e-dividas-tecnicas.md).

`PublishedCardPreviewError`, em `model/interfaces/Cards/published-card-preview-error.ts`, transporta `code`, `cardId`, `path`, mensagem segura e `cause` original. Helpers classificam erros sem repetir mensagens SDK; o componente diferencia objeto ausente, autorização, sessão, rede e preview inválida. Em desenvolvimento, registra somente cardId/path/code. O adapter de Storage chama `getBlob(reference)` sem limite opcional para preservar MIME no SDK instalado; o serviço mantém a validação estrita de Blob, `image/png` e até 20 MiB após o download. A causa e a regressão de `Blob.slice` estão em [coleção](colecao.md#diagnóstico-de-15102026).

`model/routing/auth-return-url.ts` centraliza os destinos internos existentes, incluindo `/game/pacotes`, abertura com ID validado e `/admin/pacotes` apenas para admin. Login mantém prioridade do destino autorizado por papel; URLs externas, rotas desconhecidas e outlets auxiliares continuam recusados.

Na edição de usuário, `UserEditComponent` orquestra `UserFormComponent` e `UserCollectionComponent`. O formulário comunica o perfil encontrado; o componente de coleção só é montado para esse perfil. Gestão de quantidade/propriedade permanece em domínio próprio, sem writes de coleção no formulário nem nos componentes.

Após confirmar o salvamento de carta, `PublishedCardPreviewService` reutiliza `CardPreviewService` para sincronizar o PNG, verificar a versão e retornar avisos em falhas posteriores. Uma leitura substituível do documento evita depender de `CardService` no sincronizador; `CARD_PERSISTENCE_CLIENT` concentra as operações existentes de persistência para testes, preservando validação/transações e o contrato `Card`. Exclusão e mudança de status também tentam limpar a imagem publicada. Não há renderer paralelo, nova dependência ou alteração do canvas.

`CardListComponent` orquestra **Sincronizar previews publicadas** e a ação individual **Regenerar preview**: relê o catálogo com `CardService`, seleciona publicadas e acompanha os resultados de `PublishedCardPreviewService.repairPublished`. O serviço concentra a geração/upload sequencial e as conferências de status/versão. Não escreve documentos de cartas ou dados de jogo, não apaga previews de cartas retiradas nessa rotina e não altera os assets privados. O callback de ciclo de vida impede iniciar novos itens depois de sair da página. O fluxo continua administrativo, protegido por guards e pelas Rules de escrita de PNG.

## Editor compartilhado

`CardEditorComponent` orquestra carregamento, salvamento, assets, rascunhos, templates, importação e exportação. Estado/assets são fornecidos no próprio editor; outra instância não compartilha seleção ou histórico. Após criação, os avisos de save acompanham a navegação para edição em state de runtime com o ID da carta; o destino exibe alertas apenas para aquele ID. Eles não são persistidos no documento e uma nova tentativa atualiza a lista de avisos.

```text
cards/
  card-list/
  card-preview/
  card-create/
  card-edit/
  card-editor/
    card-editor.component
    card-canvas/
    card-toolbar/
    element-library/
    card-layers/
    card-properties/
    card-data/
```

Os cinco painéis usam `CardEditorStateService` e emitem intenções de ação, arquivo ou validade. Eles não persistem nem manipulam nós Konva. `CardDataComponent` permanece montado ao trocar de modo, preservando campos ainda inválidos; o estado recebe os últimos dados válidos.

`CardCanvasComponent` conecta o estado ao `CardKonvaRenderer`. O renderer mantém Stage, conteúdo, overlays e grupos por ID; `card-konva-elements.ts` desenha os tipos. Konva representa `CardCanvasData`, sem se tornar a fonte persistida. Estado, nós, arquivos e Firebase permanecem separados.

`card-filter-cache.ts` compartilha limites e recorte de caches de efeitos entre renderer e exportação. A moldura usada pelo cache acompanha clones como atributo Konva somente de runtime; não entra em `CardCanvasData`. Alinhamento e presets alteram o documento pelo serviço de estado, sem writes Firebase por interação.

`card-ornament-presets.ts` define seis temas e constrói composições de camadas tipadas, conservando dados/assets ao recriar um layout. `card-ornament-renderer.ts` desenha molduras e emblemas vetoriais a partir dos parâmetros persistidos; `card-konva-elements.ts` encaminha os tipos `frame`/`emblem` para ele. Biblioteca e Propriedades operam pelo serviço de estado, com histórico e bloqueios, sem novas dependências ou serviço de IA.

## Arquivos relevantes

```text
model/interfaces/Auth/auth-session.ts
model/interfaces/Cards/{card,card-canvas,card-template}.ts
model/interfaces/Cards/published-card-preview-error.ts
model/interfaces/Users/user-profile.ts
model/interfaces/Collection/player-card-collection.ts
model/interfaces/Players/player-profile.ts
model/interfaces/Packs/player-pack.ts
model/routing/auth-return-url.ts
model/guards/{auth,card-editor-leave}.guard.ts
model/services/fire/{auth,card-storage}.service.ts
model/services/fire/published-card-storage.service.ts
model/services/fire/player-initialization.service.ts
model/services/fire/firebase-runtime-config.ts
model/services/fire/{google-auth-flow,password-auth-flow}.ts
model/services/cruds/cards/{card,card-template}.service.ts
model/services/cruds/cards/published-card-preview.service.ts
model/services/cruds/cards/card-persistence.ts
model/services/cruds/users/user.service.ts
model/services/cruds/collection/player-collection.service.ts
model/services/cruds/packs/player-pack.service.ts
model/services/tools/card-editor-state.service.ts
model/services/tools/card-editor-assets.service.ts
model/services/tools/card-local-draft.service.ts
model/services/tools/card-canvas-factory.ts
model/services/tools/card-ornament-presets.ts
model/services/tools/card-ornament-renderer.ts
model/services/tools/card-canvas-validation.ts
model/services/tools/card-konva-renderer.ts
model/services/tools/card-konva-elements.ts
model/services/tools/card-filter-cache.ts
model/services/tools/card-export.service.ts
model/services/tools/card-preview.service.ts
model/services/tools/card-saved-document.ts
functions/src/index.ts
functions/src/config.ts
functions/src/player-bootstrap.ts
functions/src/pack-domain.ts
functions/src/open-pack.ts
functions/src/firestore-bootstrap-store.ts
```

Listas carregam sob demanda e permitem retry, sem listener permanente da coleção inteira. Auth observa a conta e seu perfil. O dashboard não consulta dados apenas para preencher contadores. Leia [editor](editor-de-cartas.md), [cartas](cartas.md) e [autenticação](autenticacao-e-admin.md) antes de alterar esses fluxos.

O catálogo possui modo de tabela e galeria. `CardPreviewComponent` gerencia visibilidade, cancelamento e a URL final da imagem; `CardPreviewService` limita renderizações a dois jobs, baixa assets autenticados e gera PNG pelo renderer existente. Não há editor interativo nem Stage permanente em cada item. `savedCardDocument` adapta o modelo salvo/legado para uso tanto no editor como na galeria, mantendo uma fonte para essa compatibilidade.

A galeria administrativa renderiza assets privados e não testa o fluxo do jogador: o último consome exclusivamente o PNG achatado publicado. O reparo de previews reaproveita o renderer administrativo para escrever esse PNG, mantendo separados os dois acessos e os contratos persistidos.
