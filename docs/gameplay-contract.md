# Gameplay Contract

Status: Active

Last reviewed: 2026-10-15

Source of truth for: API, fronteiras e validação do contrato puro de gameplay implementado

O [Game Design v0.1](game-design.md#aprovações-registradas) está aprovado. O módulo TypeScript isolado em [shared/gameplay/src](../shared/gameplay/src) contém constantes, tipos, validação estrutural, catálogo fechado de efeitos/parâmetros/alvos, invariantes de snapshots e projeção por participante. Ele ainda não é importado pelo frontend ou pelas Functions e não oferece partida jogável. A decisão de isolamento está no [ADR-0005](decisions/0005-contrato-gameplay-puro.md); estado e sequência dos marcos permanecem em [Project State](project-state.md) e [roadmap](roadmap.md).

## Fonte e responsabilidade

O ponto de entrada é [index.ts](../shared/gameplay/src/index.ts). O módulo usa somente TypeScript/ECMAScript, sem Angular, Firebase, Konva, Node ou DOM no código de domínio. Seu [tsconfig](../shared/gameplay/tsconfig.json) habilita modo estrito, `exactOptionalPropertyTypes` e `noUncheckedIndexedAccess`, com biblioteca ES2022 e sem tipos ambientais. Usa o compilador já instalado na raiz; não há package/lock próprios ou nova dependência.

| Fonte | Responsabilidade |
| --- | --- |
| [rules.ts](../shared/gameplay/src/rules.ts) | Versão `0.1`, parâmetros aprovados e seats `p1`/`p2`; constantes congeladas |
| [contracts.ts](../shared/gameplay/src/contracts.ts) | Perfis, instâncias, snapshot autoritativo, intenções, contexto do ator e visão do participante |
| [contract-validation.ts](../shared/gameplay/src/contract-validation.ts) | Helpers estruturais e erro seguro compartilhados, sem dependências de runtime dos contratos |
| [targets.ts](../shared/gameplay/src/targets.ts) | Formato dos alvos; existência/lado são conferidos separadamente |
| [effects.ts](../shared/gameplay/src/effects.ts) | Catálogo, parâmetros fechados e validação do destinatário de efeito, sem execução |
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

## Invariantes do snapshot

`assertGameplayMatchState` confere envelopes e versões, recursos e contadores numéricos do domínio, limites de mão/campo, vagas únicas e unidades vivas com Vida dentro do máximo. Conserva exatamente 24 instâncias por participante entre deck, mão, campo e descarte, com IDs globalmente únicos. Exige perfil/revisão consistentes para cada identidade canônica nos dois lados.

Essa conservação **não valida composição de deck**: não aplica o limite de duas cópias, não verifica posse na coleção nem elegibilidade de conteúdo. Essas responsabilidades continuam no futuro Deck Rules/integração apropriada; a constante `maxCopies` não é um validador de deck.

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

Resultados executados pertencem ao [contexto operacional](contexto-operacional-para-ias.md). Esta suíte não comprova motor jogável, balanceamento, autenticação de partidas ou integração frontend/backend.

## Fora deste incremento

Permanecem futuros: Deck Rules e posse/elegibilidade, Deck Builder, executor de efeitos e transições/legalidade de Battle Engine, PRNG concreto, sandbox/bot, persistência de partidas, Callables de batalha, UI e recompensas. Catálogo/parâmetros/alvos não são execução. O contrato não autoriza implementar esses marcos em conjunto; consulte a próxima ação permitida no [roadmap](roadmap.md).
