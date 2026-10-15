# Gameplay Contract

Status: Active

Last reviewed: 2026-10-15

Source of truth for: API, fronteiras e validação do contrato puro de gameplay implementado

O [Game Design v0.1](game-design.md#aprovações-registradas) está aprovado. Seu primeiro incremento técnico é o módulo TypeScript isolado em [shared/gameplay/src](../shared/gameplay/src), com constantes, tipos, validação estrutural, invariantes de snapshots e projeção por participante. Ele ainda não é importado pelo frontend ou pelas Functions e não oferece partida jogável. A decisão de isolamento está no [ADR-0005](decisions/0005-contrato-gameplay-puro.md); estado e sequência dos marcos permanecem em [Project State](project-state.md) e [roadmap](roadmap.md).

## Fonte e responsabilidade

O ponto de entrada é [index.ts](../shared/gameplay/src/index.ts). O módulo usa somente TypeScript/ECMAScript, sem Angular, Firebase, Konva, Node ou DOM no código de domínio. Seu [tsconfig](../shared/gameplay/tsconfig.json) habilita modo estrito, `exactOptionalPropertyTypes` e `noUncheckedIndexedAccess`, com biblioteca ES2022 e sem tipos ambientais. Usa o compilador já instalado na raiz; não há package/lock próprios ou nova dependência.

| Fonte | Responsabilidade |
| --- | --- |
| [rules.ts](../shared/gameplay/src/rules.ts) | Versão `0.1`, parâmetros aprovados e seats `p1`/`p2`; constantes congeladas |
| [contracts.ts](../shared/gameplay/src/contracts.ts) | Perfis, instâncias, snapshot autoritativo, intenções, contexto do ator e visão do participante |
| [validation.ts](../shared/gameplay/src/validation.ts) | Parsing de dados desconhecidos com campos exatos e envelopes numéricos |
| [invariants.ts](../shared/gameplay/src/invariants.ts) | Consistência de um snapshot estável, sem executar transições |
| [projection.ts](../shared/gameplay/src/projection.ts) | Cópia explícita dos campos permitidos ao participante |

`readonly` expressa restrições de tipos; não congela snapshots ou resultados em runtime. Parsers e projeção criam valores aninhados independentes; a verificação de invariantes lê o snapshot sem normalizar ou modificar sua entrada.

## Catálogo, definição e instância

`Card` continua sendo o contrato de catálogo/editor em [cartas](cartas.md). `CardCanvasData` continua sendo persistência visual. Nenhum deles é convertido automaticamente em perfil de batalha.

`GameplayCardDefinition` contém identidade canônica `cardId`, revisão e custo, discriminada entre Unidade e Ação. Unidade declara Poder, Vida máxima e Guarda; Ação declara somente um descritor básico de efeito. Não transporta canvas, arte, raridade, atributos livres, speed ou magic. O descritor reconhece `damage`, `heal` e `draw` com quantidade; ele não executa efeito nem conclui o marco Typed Effects.

`GameplayCardInstance` distingue a cópia física de sua definição. No campo, `GameplayFieldUnit` acrescenta vaga, Vida atual e disponibilidade de ataque. O snapshot fixa versões de regras/conteúdo e perfis; uma identidade canônica usa uma única revisão e um único perfil em toda a partida. Não há consulta ao catálogo vivo nem adaptação de Nyra/StarterPack.

## API pública e limites

| API | O que garante | O que não decide |
| --- | --- | --- |
| `parseGameplayCardDefinition(unknown)` | Perfil exato de Unidade/Ação; IDs, revisão, custo e números válidos | Elegibilidade de conteúdo, balanceamento ou execução de efeitos |
| `parseGameplayCommandRequest(unknown)` | Envelope e formato de uma intenção, sem campos de autoridade injetados | Autenticação, participação, turno, alvo legal, custo disponível ou aplicação |
| `assertGameplayMatchState(unknown)` | Snapshot estruturalmente consistente com as invariantes abaixo | Se ele foi produzido por uma sequência legal de comandos |
| `projectGameplayParticipant(state, viewerSeat)` | Visão montada por whitelist, sem compartilhar estruturas aninhadas da entrada | Autenticar o solicitante ou conferir o snapshot automaticamente |
| `GameplayContractError` | Código `invalid-gameplay-contract` e mensagem genérica | Diagnóstico que exponha payload, seed ou cartas ocultas |

As entradas aceitam objetos de dados com campos exatos. Campos desconhecidos, getters/setters, propriedades não enumeráveis/simbólicas e arrays esparsos ou com propriedades extras são recusados pelos validadores correspondentes. A validação não representa uma camada de autenticação ou um limite geral de tamanho para transporte.

Identificadores validados usam `[a-zA-Z0-9_-]{1,128}`. Não são caminhos Firestore nem prova de identidade. Revisões, contadores e quantidades são inteiros seguros; custos respeitam o intervalo aprovado. Poder pode ser zero, Vida máxima e quantidade de efeito são positivas. Além dos limites de regras expressos no código, não há caps arbitrários de balanceamento: o parser não restringe efeitos aos números do conjunto didático. A seed é uma string privada não vazia; estado/algoritmo de aleatoriedade são dados opacos, sem PRNG ou embaralhamento implementado.

## Intenções e autoridade

O envelope contém `matchId`, `commandId`, `expectedRevision` e `command`. As formas reconhecidas são jogar carta, atacar, encerrar turno, confirmar mulligan e desistir. Alvos descrevem líder por seat ou unidade por ID. UID, seat do ator, dano, custo, seed, vencedor e estado final não são campos de autoridade aceitos no pedido.

`GameplayActorContext` é separado do pedido do cliente. Uma futura infraestrutura confiável deverá autenticar, resolver a participação e derivar o seat. `expectedRevision` e `commandId` são apenas campos validados nesta etapa: não existe comparação com revisão persistida, recibo, idempotência de execução ou controle de concorrência implementado pelo módulo.

Mulligan valida até quatro IDs distintos, mas não confirma que a seleção pertence à mão de um pedido em execução. Jogar carta pode ter ou não alvo estruturalmente válido; o parser não verifica se aquela carta exige alvo. Legalidade de comandos e resolução pertencem aos marcos posteriores.

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

[Testes de comando](../tests/gameplay/gameplay-command.test.mjs) cobrem formatos, campos indevidos, envelopes, cópias independentes e descritores. [Testes de estado](../tests/gameplay/gameplay-state.test.mjs) cobrem invariantes, fronteiras numéricas e confirmação de mulligan/término. [Testes de projeção](../tests/gameplay/gameplay-projection.test.mjs) cobrem informação oculta, whitelist e independência da saída. [Testes de tipos](../shared/gameplay/type-tests/contracts.typecheck.ts) incluem usos inválidos que devem continuar falhando na compilação.

Resultados executados pertencem ao [contexto operacional](contexto-operacional-para-ias.md). Esta suíte não comprova motor jogável, balanceamento, autenticação de partidas ou integração frontend/backend.

## Fora deste incremento

Permanecem futuros: semântica/executor de Typed Effects, Deck Rules e posse/elegibilidade, Deck Builder, transições e legalidade de Battle Engine, PRNG concreto, sandbox/bot, persistência de partidas, Callables de batalha, UI e recompensas. O contrato não autoriza implementar esses marcos em conjunto; consulte a próxima ação permitida no [roadmap](roadmap.md).
