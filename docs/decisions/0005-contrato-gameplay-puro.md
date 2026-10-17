# ADR-0005 — Contrato de gameplay em módulo TypeScript puro

Status: Accepted

Last reviewed: 2026-10-17

Source of truth for: justificativa do isolamento técnico do Gameplay Contract

## Context

O [Game Design v0.1](../game-design.md#aprovações-registradas) foi aprovado pelo proprietário. Seu primeiro incremento precisa expressar perfis, snapshots, intenções e fronteiras de informação sem acoplar a batalha ao editor ou antecipar o motor, a persistência e a interface. `Card` e `CardCanvasData` atendem catálogo/design; seus defaults não são dados de batalha automaticamente elegíveis.

## Decision

Manter o contrato em [shared/gameplay/src](../../shared/gameplay/src), com TypeScript/ECMAScript puro, independente de Angular, Firebase, Konva, Node e DOM. O [tsconfig isolado](../../shared/gameplay/tsconfig.json) usa ES2022 sem tipos ambientais. O compilador da raiz gera CommonJS e declarações em uma saída ignorada; testes Node ficam fora do módulo.

Exportar constantes aprovadas, tipos readonly, parsers estruturais, invariantes de snapshots estáveis e projeção explícita por participante. Perfis de batalha são separados do contrato de catálogo/canvas. No incremento inicial, um descritor mínimo de efeito definia somente o envelope da Ação. A evolução de [Typed Effects](../gameplay-contract.md#efeitos-tipados-e-alvos) acrescenta catálogo/parâmetros fechados e validação de destinatários, preservando o isolamento e sem executor.

O incremento inicial não integrou o módulo ao frontend ou às Functions nem criou transições, legalidade de comandos, composição/posse de decks, algoritmo aleatório, persistência, Callables ou UI. A evolução de [Deck Rules](../gameplay-contract.md#deck-rules-e-contexto-confiável) acrescenta validação pura de composição contra contexto confiável, preservando o isolamento, sem consultar ou conceder propriedade. A integração futura deve autenticar/derivar o seat, validar o snapshot e só então projetar sua whitelist; o objeto autoritativo nunca é uma resposta de participante.

## Consequences

O contrato pode ser compilado e testado isoladamente sem configurar Angular ou emuladores. Suas dependências não carregam o renderer, credenciais ou SDKs de infraestrutura. A porta backend de decks reutiliza declarações de tipos; a evolução de exclusão também reutiliza o parser puro em runtime, sem duplicar regras. `functions/src/gameplay.d.ts` encaminha as declarações e o build copia a saída compartilhada para dentro dos artefatos Functions de produção/teste. Assim, `rootDir` e `lib/index.js` são preservados e o runtime não exige arquivos externos ao pacote. Não há executor de batalha, adapter Firebase ou integração frontend. Fonte dessa evolução: [domínio de exclusão](../deck-builder.md#operação-de-domínio-de-exclusão) e [procedimento de build](../contexto-operacional-para-ias.md#comandos-de-validação).

Tipos readonly não substituem verificações em runtime. Invariantes de snapshot não provam que uma sequência foi legal; validação de intenção não autentica nem executa, e projeção não decide acesso. Conservação de instâncias também não valida composição ou propriedade de deck. Esses limites permanecem explícitos para evitar anunciar uma batalha implementada antes do motor.

Evidências: [exports](../../shared/gameplay/src/index.ts), [tipos](../../shared/gameplay/src/contracts.ts), [parsers](../../shared/gameplay/src/validation.ts), [invariantes](../../shared/gameplay/src/invariants.ts), [projeção](../../shared/gameplay/src/projection.ts), [testes de tipos](../../shared/gameplay/type-tests/contracts.typecheck.ts) e [testes runtime](../../tests/gameplay).

[API e validação](../gameplay-contract.md) · [Arquitetura](../arquitetura-frontend.md) · [Índice de decisões](README.md)
