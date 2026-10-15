# ADR-0005 — Contrato de gameplay em módulo TypeScript puro

Status: Accepted

Last reviewed: 2026-10-15

Source of truth for: justificativa do isolamento técnico do Gameplay Contract

## Context

O [Game Design v0.1](../game-design.md#aprovações-registradas) foi aprovado pelo proprietário. Seu primeiro incremento precisa expressar perfis, snapshots, intenções e fronteiras de informação sem acoplar a batalha ao editor ou antecipar o motor, a persistência e a interface. `Card` e `CardCanvasData` atendem catálogo/design; seus defaults não são dados de batalha automaticamente elegíveis.

## Decision

Manter o contrato em [shared/gameplay/src](../../shared/gameplay/src), com TypeScript/ECMAScript puro, independente de Angular, Firebase, Konva, Node e DOM. O [tsconfig isolado](../../shared/gameplay/tsconfig.json) usa ES2022 sem tipos ambientais. O compilador da raiz gera CommonJS e declarações em uma saída ignorada; testes Node ficam fora do módulo.

Exportar constantes aprovadas, tipos readonly, parsers estruturais, invariantes de snapshots estáveis e projeção explícita por participante. Perfis de batalha são separados do contrato de catálogo/canvas. No incremento inicial, um descritor mínimo de efeito definia somente o envelope da Ação. A evolução de [Typed Effects](../gameplay-contract.md#efeitos-tipados-e-alvos) acrescenta catálogo/parâmetros fechados e validação de destinatários, preservando o isolamento e sem executor.

Não integrar o módulo ao frontend ou às Functions neste incremento. Não criar transições, legalidade de comandos, composição/posse de decks, algoritmo aleatório, persistência, Callables ou UI. A integração futura deve autenticar/derivar o seat, validar o snapshot e só então projetar sua whitelist; o objeto autoritativo nunca é uma resposta de participante.

## Consequences

O contrato pode ser compilado e testado isoladamente sem configurar Angular ou emuladores. Suas dependências não carregam o renderer, credenciais ou SDKs de infraestrutura. Ainda não há reutilização efetiva nas aplicações: os próximos marcos precisarão integrar o contrato explicitamente, preservando essas fronteiras.

Tipos readonly não substituem verificações em runtime. Invariantes de snapshot não provam que uma sequência foi legal; validação de intenção não autentica nem executa, e projeção não decide acesso. Conservação de instâncias também não valida composição ou propriedade de deck. Esses limites permanecem explícitos para evitar anunciar uma batalha implementada antes do motor.

Evidências: [exports](../../shared/gameplay/src/index.ts), [tipos](../../shared/gameplay/src/contracts.ts), [parsers](../../shared/gameplay/src/validation.ts), [invariantes](../../shared/gameplay/src/invariants.ts), [projeção](../../shared/gameplay/src/projection.ts), [testes de tipos](../../shared/gameplay/type-tests/contracts.typecheck.ts) e [testes runtime](../../tests/gameplay).

[API e validação](../gameplay-contract.md) · [Arquitetura](../arquitetura-frontend.md) · [Índice de decisões](README.md)
