# Project State

Status: Active

Last reviewed: 2026-10-17

Última atualização: 2026-10-17

Source of truth for: snapshot presente do Deckfall, bloqueadores e próxima ação segura

## Produto atual

Deckfall é uma plataforma de cartas digitais com editor/administração e área autenticada do jogador. Permite publicar cartas, administrar pacotes determinísticos, receber o StarterPack lacrado, abri-lo pelo backend e consultar a coleção. Ainda não oferece uma partida jogável. As evidências de validação local e os registros datados de produção ficam no [contexto operacional](contexto-operacional-para-ias.md); melhorias locais não comprovam publicação ou funcionamento remoto.

## Stack

Angular 18 standalone, TypeScript, Firebase modular/AngularFire, Authentication, Firestore, Storage e Hosting; Konva com modelo visual próprio. Backend separado em `functions/`, Functions Gen 2, Admin SDK e Node.js 22. Versões e comandos têm fonte principal no [contexto operacional](contexto-operacional-para-ias.md); responsabilidades e rotas na [arquitetura](arquitetura-frontend.md).

## Sistemas implementados

- **Auth e admin:** e-mail/senha e Google, vínculo de métodos, recuperação, perfis/papéis e guards; painel de cartas, usuários e pacotes.
- **Cartas e editor:** dados estruturados separados de canvas, Konva, assets privados, templates, histórico, rascunho local e exportação; catálogo em lista/galeria. O editor oferece seletor nativo de cores com paleta do documento, sliders com entrada precisa e percentuais, movimento por setas, renomeação de camadas, ações de enquadramento de imagem e zoom rápido. Esses controles preservam o contrato visual persistido; detalhes em [editor](editor-de-cartas.md).
- **Publicação e previews:** PNG achatado autenticado para coleção/reveal/resumo; sincronização após save e reparo administrativo global/individual com avisos por carta.
- **Área do jogador e coleção:** navegação/perfil, leitura da própria propriedade, busca/filtro e gestão manual de quantidades pelo admin.
- **Player Bootstrap e packs:** starter único lacrado, definições determinísticas e versões imutáveis, abertura atômica/idempotente, reveal e recuperação do resultado após refresh.
- **Gameplay Contract:** módulo TypeScript puro em `shared/gameplay`, com constantes aprovadas, perfis/estados/intenções tipados, validação de formato e invariantes de snapshots, projeções privadas por participante e testes próprios. As portas backend reutilizam tipos e os domínios delete/rename e o helper histórico reutilizam parsers pelo módulo compilado dentro do artefato Functions. O frontend não importa o módulo; não há executor de batalha.
- **Typed Effects:** catálogo fechado de dano, cura e compra, com parâmetros aprovados e validação de alvos por participante/campo. Tipos, parsers de perfil e projeções usam a mesma união; o módulo não executa efeitos nem altera estado.
- **Deck Rules:** validador puro de 24 cartas e até duas cópias por identidade, com revisão/elegibilidade do catálogo versionado e quantidades pessoais ou referência exata de treino em contexto confiável. Retorna composição canônica independente, sem autenticar, consultar coleção ou criar instâncias. API em [Gameplay Contract](gameplay-contract.md#deck-rules-e-contexto-confiável).
- **Compatibilidade pessoal de decks:** `validateGameplayDeckAgainstActiveCatalog` adapta somente `contentVersion` em memória, preserva as referências e delega ao Deck Rules inalterado. Exige contexto `owned`; não lê catálogo/coleção reais, não persiste e não admite partidas autenticadas. É o primeiro incremento puro de Deck Builder, ainda isolado da aplicação/backend.
- **Rascunhos pessoais:** `parsePersonalDeckDraft` normaliza somente nome, versões e composição parcial de 0–24 cartas, com até duas cópias por identidade, agregação e ordem ASCII. Rejeita revisões conflitantes e campos extras, sem consultar catálogo/propriedade ou declarar validade para batalha. Contrato puro, sem persistência; [API e limites](gameplay-contract.md#intenção-parcial-de-deck-pessoal).
- **Recurso e mutações pessoais:** projeção pura `PersonalDeckResource` e cinco pedidos estritos (create/update/rename/delete/duplicate), com metadados serializáveis UTC, versões esperadas e resultado independente. Não leem ou gravam dados, não incrementam versão nem garantem concorrência real; [contratos](gameplay-contract.md#recurso-pessoal-e-pedidos-de-mutação).
- **Porta backend de decks:** `PersonalDeckStore`/`PersonalDeckStoreTransaction` representam unidade futura por UID confiável, leitura/lista limitada e create-if-absent/replace/delete distintos. Erros puros distinguem conflito, ausência, destino existente, capacidade, esgotamento de versão e tempo inválido, preservando stack interna para diagnóstico. Sem adapter ou atomicidade implementada; [contrato](deck-builder.md#porta-backend-do-store-e-erros-de-domínio).
- **Exclusão pessoal no domínio:** `deletePersonalDeck(uid, request, store)` valida antes da transação e faz get/comparação/delete no mesmo callback, distinguindo ausência e conflito. Testado com store em memória, sem catálogo, propriedade, listagem ou capacidade. Ainda sem exclusão real no banco, autenticação integrada ou Callable; [fluxo](deck-builder.md#operação-de-domínio-de-exclusão).
- **Renomeação pessoal no domínio:** `renamePersonalDeck(uid, request, store, clock)` retorna recurso independente e altera somente nome, versão e data de atualização. No-op não grava nem consulta tempo; mudança real usa um instante confiável estável em retries e recusa regressão/esgotamento. Testado com doubles determinísticos, sem persistência real; [fluxo](deck-builder.md#operação-de-domínio-de-renomeação).
- **Porta de catálogo canônico:** `PersonalDeckCatalogReader.get(contentVersion)` declara leitura global por versão explícita, retornando o `GameplayDeckCatalog` readonly existente ou null somente para ausência. Não há implementação/adapter, catálogo real, active config, UID, ownership ou publicação consultados; [contrato](deck-builder.md#porta-backend-de-leitura-de-catálogo-versionado).
- **Referências históricas de rascunho:** `validatePersonalDeckDraftReferences(unknown, GameplayDeckCatalog)` reutiliza os parsers para validar regras, versão histórica exata e cada identidade/revisão, retornando draft parcial normalizado e detached. Aceita `eligible: false`, não verifica posse/publicação e não concede aptidão para jogar. Separa erro estrutural/corrupção de referência não reconhecida; sem reader ou I/O, [contrato](deck-builder.md#validação-pura-de-referências-históricas).

“Implementado” descreve código e cobertura existentes, sem encerrar o QA remoto pendente. Contratos e referências de implementação ficam nos [docs de domínio](README.md#domínios).

## Conteúdo narrativo paralelo

A [Lore Bible v0.1](lore/README.md) contém oito documentos de universo e governança narrativa, com cinco regiões, cinco facções, oito personagens e dez Story Seeds. O Soft Canon inicial foi incorporado editorialmente sob a delegação de criação; os seis pontos de Hard Canon continuam **PROPOSTA / PENDENTE**, sem aprovação explícita de Emanuel. Expansões menores estão autorizadas nos [limites da autonomia narrativa](lore/canon.md#limites-da-autonomia).

Esse eixo não modifica regras, schemas ou cartas persistidas, não adapta Nyra nem as identidades de protótipo e não promove o próximo marco de Core Game. Há ficha narrativa, workflow para futuras cartas e modelo de Art Prompt; nenhuma carta ou imagem foi criada por essa documentação.

A [Starter Wave 01](content/starter-wave-01.md) está integralmente preparada em manifesto: 12 nomes finais, oito Unidades/quatro Ações com perfis exatos do deck padrão, lore, descrição visual e 12 Art Prompts. **0/12 criadas no editor nesta execução**: as ferramentas de UI falharam na inicialização, antes de acessar o admin. Todas aguardam criação como `draft`, sem arte e sem Card ID confirmado; não houve escrita direta como alternativa. StarterPack, Nyra, coleção e concessões não foram alterados. Apenas o Dorso de Ardósia foi acrescentado como fauna reutilizável em `lore/world.md`; as outras figuras novas são locais às cartas.

## Sistemas parciais

- `/game/decks` e `/game/jogar` são placeholders com ações desabilitadas.
- O [Game Design v0.1](game-design.md#aprovações-registradas) foi aprovado explicitamente por Emanuel. O [Gameplay Contract, Typed Effects e Deck Rules](gameplay-contract.md) estão implementados e validados; ainda não há resolução de batalha ou integração de decks com propriedade/autorização no backend.
- O modelo persistido `Card` continua genérico e separado dos perfis de gameplay. Não houve conversão de cartas existentes, adaptação de Nyra ou criação do pool didático no catálogo.
- Definições adicionais de packs existem no admin; não há distribuição genérica de instâncias ao jogador.

## Não implementado

UI de Deck Builder, persistência/autorização integrada de decks, catálogo/referência reais de gameplay, Battle Engine, sandbox, bot de treino, persistência de partidas, matchmaking/PvP/reconexão, moedas/recompensas/loja/packs compráveis ou aleatórios, XP/níveis/conquistas/ranked/MMR/leaderboard/seasons. A ordem pretendida e seus bloqueios estão no [roadmap](roadmap.md).

## Backend atual

Há duas Callables em [functions/src/index.ts](../functions/src/index.ts): `initializePlayer` e `openPack`, ambas na região `southamerica-east1`, autenticadas e com validação própria no servidor. O bootstrap concede instância lacrada; a abertura usa sua versão histórica e concede cartas no mesmo commit do resultado. Não há backend de batalha ou economia.

Coleções principais: `users`, `players`, `cards`, `cardTemplates`, `packDefinitions`/`versions`, e subcoleções `users/{uid}/collection` e `users/{uid}/packs`. Membros não escrevem propriedade/player/packs; clientes admin também não escrevem player/instâncias. A gestão manual administrativa de coleção é o fluxo privilegiado existente. Fonte dos campos e permissões: [modelo Firestore](modelo-dados-firestore.md); razões: [ADRs](decisions/README.md).

## Rotas importantes

`/login` também atende Minha conta. `/game/*` exige perfil autenticado válido e bootstrap antes de montar páginas; inclui `/game/home`, `/game/colecao`, `/game/pacotes` e `/game/pacotes/abrir/:id`. `/admin/*` exige admin e reúne dashboard, cartas, pacotes e usuários. Tabela completa e guards: [arquitetura frontend](arquitetura-frontend.md#rotas-e-layout).

## Estado de produção

Configuração versionada: Hosting site `deckfall`, saída `dist/card-game/browser` e rewrite SPA em [firebase.json](../firebase.json). O projeto remoto documentado é `cardgame-6fdcb`, domínio `https://deckfall.web.app`; o frontend local usa Firebase real por padrão, salvo configuração explícita de emuladores.

As últimas evidências registradas confirmam publicação de Functions/Firestore Rules/Hosting de pacotes, StarterPack ativo versão 1 com uma Nyra publicada, PNG existente, Rules remotas iguais às locais, CORS das duas origens e domínio Auth autorizado. **São evidências datadas de 13–15/10/2026, sem nova auditoria remota nesta tarefa.** A correção local do MIME das previews e o reparo administrativo não têm publicação posterior confirmada; o teste real com member também permanece aberto. Recibos, datas e limites: [contexto operacional](contexto-operacional-para-ias.md). Nenhuma autorização de publicação é herdada desses registros.

## Problemas conhecidos

Fonte principal: [riscos e dívidas](riscos-e-dividas-tecnicas.md). Permanecem QA autenticado member de coleção/reveal/resumo e publicação autorizada da correção local; falta de atomicidade entre documento e preview/cleanup; leituras sem paginação; limites de validação profunda do canvas; ausência de controles adicionais de abuso no backend. Falta antiga de `openPack`/StarterPack e CORS das origens registradas não são bugs atuais comprovados.

## Marco atual e continuidade

Deck Rules está concluído. **Deck Builder é o único marco CURRENT e não está concluído**. Sua [arquitetura v0.1](deck-builder.md) foi aprovada; contratos puros, porta do store, domínios delete/rename, [porta de catálogo versionado](deck-builder.md#porta-backend-de-leitura-de-catálogo-versionado) e [validação histórica de referências](deck-builder.md#validação-pura-de-referências-históricas) foram autorizados, implementados e validados. Não há adapter, create/update/duplicate de domínio, UI, persistência, Functions/Rules de decks ou integração com partidas. O escopo e a próxima ação estão no [roadmap](roadmap.md#deck-builder). A Lore Bible é um eixo paralelo; resultados datados ficam no [contexto operacional](contexto-operacional-para-ias.md#validação-disponível).

## Owner decisions required

Deck Rules v0.1 e os contratos puros implementados de Deck Builder não têm decisão pendente. Os [cinco blocos de Deck Builder](deck-builder.md#decisões-que-emanuel-precisa-aprovar) foram aprovados por Emanuel em 17/10/2026, com revisão obrigatória do bloco 4 incorporada; próximos incrementos precisam de escopo/autorização próprios. Os limites 20/80/16 KiB/64 KiB são revisáveis de v0.1; o hard cap por query transacional continua sem prova de integração, exige 19 + duas criações sem resultar em 21 e, se não puder ser garantido, impõe parar e propor quota/counter backend antes de workaround. Mudanças de regras/números, economia e multiplayer futuros conservam seus próprios requisitos e limites de aprovação.

Na lore, a ratificação de HC-01 a HC-06 depende de aprovação explícita de Emanuel; o [registro de cânone](lore/canon.md#hard-canon--proposta--pendente) conserva a pendência. Isso não bloqueia as expansões menores já delegadas, que respeitam a proposta estrutural como limite editorial conservador.

## Next safe action

Core Game: encerrar após a validação histórica de referências e aguardar nova autorização. O próximo menor incremento recomendado é a operação de domínio update, reutilizando parsers, helper histórico, store, clock e porta de catálogo, com precondição de versão e sem adapter, Callable ou UI; não iniciá-la nem avançar para persistência ou Battle Engine nesta tarefa. Starter Wave 01: em tarefa própria, quando o acesso à UI estiver disponível, conferir homônimos no admin e criar as 12 cartas pelo editor existente como `draft`, sem arte, registrando os IDs reais no manifesto. Publicação e composição do StarterPack dependem das etapas e autorizações próprias; não usar scripts de escrita. A manutenção operacional pendente está em [riscos](riscos-e-dividas-tecnicas.md) e não autoriza deploy.
