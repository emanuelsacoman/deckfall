# Gameplay Contract

Status: Active

Last reviewed: 2026-10-17

Source of truth for: API, fronteiras e validação do contrato puro de gameplay implementado

O [Game Design v0.1](game-design.md#aprovações-registradas) está aprovado. O módulo TypeScript isolado em [shared/gameplay/src](../shared/gameplay/src) contém constantes, tipos, validação estrutural, catálogo fechado de efeitos/parâmetros/alvos, validação de composição e compatibilidade de decks, invariantes de snapshots e projeção por participante. Ele ainda não é importado pelo frontend ou pelas Functions e não oferece partida jogável. A decisão de isolamento está no [ADR-0005](decisions/0005-contrato-gameplay-puro.md); estado e sequência dos marcos permanecem em [Project State](project-state.md) e [roadmap](roadmap.md).

## Fonte e responsabilidade

O ponto de entrada é [index.ts](../shared/gameplay/src/index.ts). O módulo usa somente TypeScript/ECMAScript, sem Angular, Firebase, Konva, Node ou DOM no código de domínio. Seu [tsconfig](../shared/gameplay/tsconfig.json) habilita modo estrito, `exactOptionalPropertyTypes` e `noUncheckedIndexedAccess`, com biblioteca ES2022 e sem tipos ambientais. Usa o compilador já instalado na raiz; não há package/lock próprios ou nova dependência.

| Fonte | Responsabilidade |
| --- | --- |
| [rules.ts](../shared/gameplay/src/rules.ts) | Versão `0.1`, parâmetros aprovados e seats `p1`/`p2`; constantes congeladas |
| [contracts.ts](../shared/gameplay/src/contracts.ts) | Perfis, instâncias, snapshot autoritativo, intenções, contexto do ator e visão do participante |
| [contract-validation.ts](../shared/gameplay/src/contract-validation.ts) | Helpers estruturais e erro seguro compartilhados, sem dependências de runtime dos contratos |
| [targets.ts](../shared/gameplay/src/targets.ts) | Formato dos alvos; existência/lado são conferidos separadamente |
| [effects.ts](../shared/gameplay/src/effects.ts) | Catálogo, parâmetros fechados e validação do destinatário de efeito, sem execução |
| [decks.ts](../shared/gameplay/src/decks.ts) | Composição e validação contra catálogo/quantidades ou referência de treino confiáveis |
| [deck-compatibility.ts](../shared/gameplay/src/deck-compatibility.ts) | Adapta somente a versão do envelope pessoal em memória e delega a validação ao Deck Rules existente |
| [validation.ts](../shared/gameplay/src/validation.ts) | Parsing de perfis e pedidos; delega parâmetros de Ação ao parser de efeitos |
| [invariants.ts](../shared/gameplay/src/invariants.ts) | Consistência de um snapshot estável, sem executar transições |
| [projection.ts](../shared/gameplay/src/projection.ts) | Cópia explícita dos campos permitidos ao participante |

`readonly` expressa restrições de tipos; não congela snapshots ou resultados em runtime. Parsers e projeção criam valores aninhados independentes; a verificação de invariantes lê o snapshot sem normalizar ou modificar sua entrada.

## Catálogo, definição e instância

`Card` continua sendo o contrato de catálogo/editor em [cartas](cartas.md). `CardCanvasData` continua sendo persistência visual. Nenhum deles é convertido automaticamente em perfil de batalha.

`GameplayCardDefinition` contém identidade canônica `cardId`, revisão e custo, discriminada entre Unidade e Ação. Unidade declara Poder, Vida máxima e Guarda; Ação declara um `GameplayEffect` da união fechada. Não transporta canvas, arte, raridade, atributos livres, speed ou magic. O nome `GameplayEffectDescriptor` é preservado como alias dessa união. Guarda permanece característica de Unidade; não é efeito executável.

`GameplayCardInstance` distingue a cópia física de sua definição. No campo, `GameplayFieldUnit` acrescenta vaga, Vida atual e disponibilidade de ataque. O snapshot fixa versões de regras/conteúdo e perfis; uma identidade canônica usa uma única revisão e um único perfil em toda a partida. Não há consulta ao catálogo vivo nem adaptação de Nyra/StarterPack.

## API pública e limites

| API | O que garante | O que não decide |
| --- | --- | --- |
| `parseGameplayCardDefinition(unknown)` | Perfil exato de Unidade/Ação; IDs, revisão, custo e parâmetros de efeito aprovados | Elegibilidade de conteúdo, balanceamento ou execução de efeitos |
| `parseGameplayEffect(unknown)` | Um efeito com kind/amount exatos e uma das cinco combinações aprovadas | Seleção de carta canônica, destinatário ou execução |
| `validateGameplayEffectTarget(state, actorSeat, effect, target?)` | Existência, lado e Vida positiva do destinatário de dano/cura; compra ao próprio ator | Validar snapshot, autenticar, checar fase/turno/custo/término ou executar |
| `parseGameplayCommandRequest(unknown)` | Envelope e formato de uma intenção, sem campos de autoridade injetados | Autenticação, participação, turno, alvo legal, custo disponível ou aplicação |
| `parseGameplayDeckList(unknown)` | Versões e entradas exatas de identidade/revisão/quantidade positiva, copiadas | Tamanho, cópias, elegibilidade, propriedade ou permissão de treino |
| `validateGameplayDeck(unknown, trustedContext)` | Composição v0.1, conteúdo canônico e quantidades pessoais ou referência exata de treino | Autenticação, origem do contexto, consulta à coleção, persistência ou início de partida |
| `validateGameplayDeckAgainstActiveCatalog(unknown, trustedOwnedContext)` | Mesmas referências pessoais contra o catálogo recebido como ativo, adaptando apenas `contentVersion` em memória e delegando ao validador existente | Origem/ativação real do catálogo, posse real, autenticação, publicação de `Card`, persistência ou admissão de partida |
| `GameplayDeckValidationError` | Código `invalid-gameplay-deck`, motivo enumerado e mensagem genérica | Detalhes do deck, catálogo ou inventário em erros |
| `assertGameplayMatchState(unknown)` | Snapshot estruturalmente consistente com as invariantes abaixo | Se ele foi produzido por uma sequência legal de comandos |
| `projectGameplayParticipant(state, viewerSeat)` | Visão montada por whitelist, sem compartilhar estruturas aninhadas da entrada | Autenticar o solicitante ou conferir o snapshot automaticamente |
| `GameplayContractError` | Código `invalid-gameplay-contract` e mensagem genérica | Diagnóstico que exponha payload, seed ou cartas ocultas |

As entradas aceitam objetos de dados com campos exatos. Campos desconhecidos, getters/setters, propriedades não enumeráveis/simbólicas e arrays esparsos ou com propriedades extras são recusados pelos validadores correspondentes. A validação não representa uma camada de autenticação ou um limite geral de tamanho para transporte.

Identificadores validados usam `[a-zA-Z0-9_-]{1,128}`. Não são caminhos Firestore nem prova de identidade. Revisões e contadores são inteiros seguros; custos respeitam o intervalo aprovado. Poder pode ser zero e Vida máxima é positiva, sem caps de balanceamento inventados para esses atributos. Os parâmetros de efeito seguem exclusivamente o catálogo abaixo. A seed é uma string privada não vazia; estado/algoritmo de aleatoriedade são dados opacos, sem PRNG ou embaralhamento implementado.

## Efeitos tipados e alvos

`GAMEPLAY_EFFECT_CATALOG` é declarativo e congelado, incluindo as listas de valores e as políticas fixas de alvo. As três interfaces `GameplayDamageEffect`, `GameplayHealEffect` e `GameplayDrawEffect` formam `GameplayEffect`, uma união discriminada que restringe os parâmetros também nos tipos.

| Efeito | Amount permitido | Política fixa |
| --- | --- | --- |
| `damage` | 1 ou 3 | Líder ou unidade adversários vivos; ignora Guarda |
| `heal` | 3 | Líder ou unidade próprios vivos; alvo com Vida cheia é legal |
| `draw` | 1 ou 2 | O próprio jogador, sem alvo manual |

`parseGameplayEffect` aceita somente `{kind, amount}`, sem scripts, gatilhos, durações, múltiplos efeitos ou política de alvo escolhida pelo chamador. Novos efeitos/parâmetros dependem de revisão do design/conteúdo; números positivos fora da tabela são recusados. `parseGameplayCardDefinition` usa esse parser, e as invariantes/projeções preservam o contrato fechado.

`validateGameplayEffectTarget` exige três entradas confiáveis do chamador: snapshot autoritativo previamente validado, seat derivado da autenticação/participação e efeito obtido da definição canônica da carta. Revalidar o formato do efeito não prova sua origem: não passar um efeito escolhido no payload do cliente como autoridade.

Para dano/cura, o helper exige alvo com o formato correto, procura somente o lado permitido e, para unidades, somente o campo do snapshot recebido. Não resolve mão, deck, descarte ou outras partidas; um ID ausente desse campo é recusado. Líder/unidade com Vida não positiva é recusado. Cura em Vida cheia é aceita sem calcular cura; dano ignora Guardas. Para compra, o alvo deve ser omitido ou `undefined`; qualquer valor definido, inclusive `null`, é recusado.

O retorno `GameplayEffectDestination` distingue líder (`seat`), unidade (`seat` e `instanceId`) e jogador (`seat`, para compra). Ele identifica o destinatário validado, não o resultado do efeito. O helper não modifica snapshot/entrada, não paga custo, não aplica dano/cura, não compra/descarta, não causa fadiga e não calcula eventos ou término. Não verifica fase, turno, energia disponível ou autorização de um comando, inclusive em snapshot terminal; esses controles e o executor pertencem ao Battle Engine e à futura infraestrutura confiável.

## Intenções e autoridade

O envelope contém `matchId`, `commandId`, `expectedRevision` e `command`. As formas reconhecidas são jogar carta, atacar, encerrar turno, confirmar mulligan e desistir. Alvos descrevem líder por seat ou unidade por ID. UID, seat do ator, dano, custo, seed, vencedor e estado final não são campos de autoridade aceitos no pedido.

`GameplayActorContext` é separado do pedido do cliente. Uma futura infraestrutura confiável deverá autenticar, resolver a participação e derivar o seat. `expectedRevision` e `commandId` são apenas campos validados nesta etapa: não existe comparação com revisão persistida, recibo, idempotência de execução ou controle de concorrência implementado pelo módulo.

Mulligan valida até quatro IDs distintos, mas não confirma que a seleção pertence à mão de um pedido em execução. Jogar carta pode ter ou não alvo estruturalmente válido; o parser do pedido não resolve a carta para verificar se ela exige alvo. O helper de efeitos é separado e não transforma esse parser em um resolvedor. Legalidade completa de comandos e execução pertencem aos marcos posteriores.

## Deck Rules e contexto confiável

`GameplayDeckList` descreve somente `{rulesVersion, contentVersion, entries}`. Cada entrada contém `{cardId, revision, quantity}`; não há nome, raridade, instância de batalha, definição inline, UID, propriedade, elegibilidade ou modo de treino enviados como autoridade. `parseGameplayDeckList` valida o formato e cria uma cópia independente, sem afirmar que o deck é legal. A versão de regras deve ser `0.1`, a versão de conteúdo é um identificador e revisões/quantidades são inteiros seguros positivos.

`validateGameplayDeck` recebe essa composição e um `GameplayDeckValidationContext` confiável, separado do pedido. Confere exatamente 24 cartas e até duas cópias por identidade canônica. Entradas repetidas com a mesma identidade/revisão são somadas antes do limite; revisões diferentes da mesma identidade são recusadas. Não há mínimo de Unidades/Ações, facção, raridade ou sideboard. Quantidades excessivas são recusadas antes de somar além de 24, evitando overflow.

O `GameplayDeckCatalog` fixa `rulesVersion`, `contentVersion` e uma lista `cards` de `{definition, eligible}`. Deve haver uma única definição/revisão por identidade nesse conjunto; duplicatas são configuração inválida. Cada perfil é revalidado pelo parser de Unidade/Ação e efeitos aprovados. Toda identidade solicitada precisa existir, ser elegível e ter a revisão canônica do conjunto. A versão de conteúdo solicitada deve corresponder ao catálogo recebido. Ser `Card` publicado ou possuir uma carta na coleção não estabelece esse perfil ou sua elegibilidade automaticamente.

| Contexto fornecido pelo chamador confiável | Verificação adicional |
| --- | --- |
| `{kind: 'owned', catalog, ownership}` | `ownership` contém `{cardId, quantity}` únicos, com quantidades inteiras seguras não negativas. Identidade ausente equivale a zero; quantidade deve cobrir as cópias agregadas solicitadas. O teto administrativo 9999 da coleção não é regra de composição. |
| `{kind: 'training-reference', catalog, referenceId, referenceDeck}` | A referência confiável também deve ser válida nesse catálogo. A composição solicitada deve coincidir exatamente com suas identidades, revisões e quantidades, independentemente da ordem/divisão das linhas. Não exige propriedade nem concede cartas. |

A exceção de treino exige uma composição de referência fornecida pela infraestrutura confiável; um boolean ou `kind` recebido livremente do cliente não autoriza usá-la. A integração futura deverá autenticar, obter a coleção do titular, escolher o conjunto versionado e resolver uma referência permitida igual para os participantes. O módulo não prova a origem dessas entradas e não consulta Firebase; validar um contexto forjado não o torna confiável. Nenhum catálogo ou deck de referência real foi cadastrado neste incremento; as fixtures são somente testes.

O retorno `GameplayValidatedDeck` distingue `kind: 'owned'` e `kind: 'training-reference'` (este inclui `referenceId`), fixa as versões e contém entradas `{definition, quantity}` com perfis copiados do catálogo. Agrega as linhas e ordena por `cardId` usando comparação lexical ASCII, sem locale. Essa ordem normaliza a composição; não é embaralhamento ou ordem de compra. A saída não compartilha estruturas com pedido/contexto, não consome inventário, não cria IDs/instâncias nem inicia partida. `readonly` continua sendo contrato de tipos, sem congelamento em runtime e sem recibo de autorização.

Forma/contexto malformados lançam `GameplayContractError`. Violações das regras lançam `GameplayDeckValidationError` com `reason` entre `size`, `copies`, `revision`, `unknown-card`, `ineligible-card`, `ownership`, `content-version` e `reference-mismatch`. O erro não inclui IDs, quantidades, perfis ou inventário. A verificação termina na primeira falha; não é uma lista completa de problemas de edição. Transporte, persistência/autorização de decks e validação integrada antes de criar partida permanecem futuros.

### Compatibilidade pessoal com catálogo ativo

`validateGameplayDeckAgainstActiveCatalog(value, trustedContext)` é o primeiro incremento puro de [Deck Builder](deck-builder.md). Recebe uma projeção `GameplayDeckList`, sem nome, datas ou outros metadados Firestore. O contexto é restrito nos tipos a `Extract<GameplayDeckValidationContext, {kind: 'owned'}>`; em runtime, exige o envelope pessoal exato e rejeita `training-reference`, contextos mistos e campos extras.

O helper primeiro chama `parseGameplayDeckList` sobre a projeção original, sem limpar campos indevidos ou mascarar proveniência/regras inválidas. Inspeciona o contexto e o catálogo com os helpers estruturais existentes para ler `contentVersion` de propriedades de dados, sem executar getters. Constrói apenas em memória um novo envelope com `rulesVersion` e entradas copiados da composição original e `contentVersion` do catálogo recebido. Em seguida chama `validateGameplayDeck`, sem reimplementar tamanho, cópias, identidade/revisão, elegibilidade ou ownership. Retorna diretamente seu `GameplayValidatedDeck`, com `kind: 'owned'` no resultado, sem criar outro contrato de validade.

Uma versão nova aditiva ou mudanças válidas em cartas não usadas pelo deck não invalidam suas referências. Remover uma identidade usada, trocar sua revisão canônica ou torná-la inelegível produz a rejeição normal do Deck Rules. O helper nunca troca revisões, quantidades ou identidades, nem adiciona/remove cartas para fazer o deck passar. Deck incompleto continua inválido para essa conferência. `validateGameplayDeck` chamado diretamente continua exigindo igualdade de versão entre a lista e o catálogo; seu contrato permanece intacto.

A entrada, suas entradas, o catálogo e o ownership não são modificados. O resultado contém perfis canônicos independentes produzidos pelo validador existente; não atualiza a proveniência histórica ou o documento pessoal. Regras incompatíveis são recusadas, sem conversão automática. Igualdade de versão por si só também não assegura validade da composição.

Essa função pura não comprova a origem do contexto: a futura infraestrutura deverá ler a versão realmente ativa, a publicação atual e a coleção do titular autenticado, derivando a elegibilidade efetiva e o contexto confiável. O helper não consulta Firestore, não verifica status de `Card`, não autentica nem cria uma partida. O fluxo de treino existente permanece separado e inalterado; usar uma referência como bypass pessoal é recusado. Persistência de rascunhos, seus limites de metadados e o hard cap de 20 decks não são implementados por esse helper.

## Invariantes do snapshot

`assertGameplayMatchState` confere envelopes e versões, recursos e contadores numéricos do domínio, limites de mão/campo, vagas únicas e unidades vivas com Vida dentro do máximo. Conserva exatamente 24 instâncias por participante entre deck, mão, campo e descarte, com IDs globalmente únicos. Exige perfil/revisão consistentes para cada identidade canônica nos dois lados.

Essa conservação **não valida composição de deck**: não aplica o limite de duas cópias, não verifica posse na coleção nem elegibilidade de conteúdo. São responsabilidades do [validador separado de Deck Rules](#deck-rules-e-contexto-confiável) e da futura integração confiável; validar um snapshot não executa esse validador automaticamente.

O checkpoint inicial de mulligan conserva abertura, recursos e seleções privadas consistentes. Estados de turno exigem ambos os mulligans confirmados, jogador ativo válido, líderes vivos e ausência de resultado. Estado final exige ausência de jogador ativo e resultado coerente com Vida/desistência; desistência na abertura é admitida nas condições verificadas pelo código. Nenhuma dessas verificações executa compra, troca, fadiga, combate ou passagem de fase.

## Projeção e informação oculta

Antes de projetar, uma futura integração deve validar o snapshot com `assertGameplayMatchState` e derivar `viewerSeat` da identidade autenticada e da participação autorizada. O projetor não faz essa validação nem consulta de identidade. Passar `p1`/`p2` recebido livremente do cliente não é autorização.

A whitelist inclui a mão e seleção de mulligan próprias, zonas públicas, recursos, contagens e resultado. Exclui os dois decks ordenados, mão/seleção adversárias, seed/estado PRNG e campos extras do snapshot. Quantidades trocadas aparecem somente depois de ambas as confirmações; identidades adversárias permanecem privadas. Encerrar a partida não libera informação oculta.

Não enviar `GameplayMatchState` diretamente ao cliente, nem adicionar spreads de objetos autoritativos à projeção. A whitelist reduz o que é copiado, mas não substitui autenticação, validação de entrada, autorização de recibos ou regras de exposição em uma futura persistência.

## Como validar

Na raiz, com as dependências instaladas:

```powershell
npm.cmd run build:gameplay
npm.cmd run typecheck:gameplay
npm.cmd run test:gameplay
```

`test:gameplay` já executa build, testes de tipos e Node Test Runner. O build gera CommonJS e declarações em `shared/gameplay/lib/`, ignorado pelo Git; Node é ferramenta de testes, não dependência do código de domínio. Não há emulador ou acesso remoto nessa suíte.

[Testes de comando](../tests/gameplay/gameplay-command.test.mjs) cobrem formatos, campos indevidos, envelopes, cópias independentes e perfis. [Testes de efeitos](../tests/gameplay/gameplay-effects.test.mjs) cobrem catálogo/parâmetros, alvos, entradas inválidas, ausência de mutação, limites do helper e integração perfil → snapshot → projeção. [Testes de estado](../tests/gameplay/gameplay-state.test.mjs) cobrem invariantes, fronteiras numéricas e confirmação de mulligan/término. [Testes de projeção](../tests/gameplay/gameplay-projection.test.mjs) cobrem informação oculta, whitelist e independência da saída. [Testes de tipos do contrato](../shared/gameplay/type-tests/contracts.typecheck.ts) e [dos efeitos](../shared/gameplay/type-tests/effects.typecheck.ts) incluem usos inválidos que devem continuar falhando na compilação.

[Testes de decks](../tests/gameplay/gameplay-deck.test.mjs) e [de tipos de decks](../shared/gameplay/type-tests/decks.typecheck.ts) cobrem composição, contexto canônico, quantidades pessoais, referência exata de treino, entradas adversariais e independência dos dados. Resultados executados pertencem ao [contexto operacional](contexto-operacional-para-ias.md). Esta suíte não comprova motor jogável, balanceamento, autenticação de partidas ou integração frontend/backend.

[Testes de compatibilidade](../tests/gameplay/gameplay-deck-compatibility.test.mjs) e [de tipos da API pessoal](../shared/gameplay/type-tests/deck-compatibility.typecheck.ts) cobrem versões aditivas, mudanças irrelevantes, referências removidas/substituídas/inelegíveis, delegação de tamanho/cópias/posse, contexto adversarial, preservação das entradas e regressão do validador direto. Não são testes de admissão autenticada ou do cap transacional.

## Fora deste incremento

Permanecem futuros: integração de propriedade/elegibilidade com backend, catálogo/referência reais de gameplay, Deck Builder, executor de efeitos e transições/legalidade de Battle Engine, PRNG concreto, sandbox/bot, persistência de decks/partidas, Callables de batalha, UI e recompensas. Catálogo/parâmetros/alvos e composição válida não são execução. O contrato não autoriza implementar esses marcos em conjunto; consulte o escopo permitido no [roadmap](roadmap.md).
