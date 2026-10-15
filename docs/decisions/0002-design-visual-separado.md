# ADR-0002 — Design visual separado dos dados da carta

Status: Accepted

Last reviewed: 2026-10-15

Source of truth for: justificativa da separação entre dados e design visual

## Context

O editor precisa permitir composições livres sem transformar posição, cor ou símbolos em regras de jogo. Konva possui estado próprio de renderização, que inclui estruturas inadequadas para persistência.

Este registro formaliza a arquitetura técnica vigente, comprovada pelo código e pelos testes. Não representa aprovação de regras futuras de gameplay.

## Decision

Manter os dados estruturados em `CardDataInput` e o design editável em `CardCanvasData`, reunidos no documento do editor. Konva renderiza esse modelo; seus nós e sua serialização não são a fonte persistida.

Bindings explícitos conectam a apresentação aos dados. Editar a aparência não determina habilidades, combate ou regras de deck; atributos e raridades atuais também não definem esses sistemas futuros.

O [editor de cartas](../editor-de-cartas.md) é a referência principal do contrato visual e de seu funcionamento. [Cartas](../cartas.md) descreve os dados e a persistência do catálogo.

## Consequences

- O mesmo modelo pode alimentar editor, templates, galeria e exportação.
- Histórico, seleção, Files, nós e URLs temporárias permanecem em runtime ou no rascunho local apropriado, fora do Firestore.
- Evoluções de gameplay exigem contratos e decisões próprios; não se deduzem de elementos decorativos ou defaults do editor.

Evidências:

- [Contratos de dados](../../src/app/model/interfaces/Cards/card.ts) e [canvas/documento do editor](../../src/app/model/interfaces/Cards/card-canvas.ts).
- [Estado do editor](../../src/app/model/services/tools/card-editor-state.service.ts) e [renderer Konva](../../src/app/model/services/tools/card-konva-renderer.ts).
- [Testes de modelo, histórico e bindings](../../src/app/model/services/tools/card-editor-state.service.spec.ts).

[Índice de decisões](README.md) · [Arquitetura](../arquitetura-frontend.md)
