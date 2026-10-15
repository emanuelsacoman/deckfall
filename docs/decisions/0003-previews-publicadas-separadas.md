# ADR-0003 — Previews publicadas separadas dos assets editáveis

Status: Accepted

Last reviewed: 2026-10-15

Source of truth for: justificativa da representação publicada separada

## Context

O jogador precisa ver a composição completa sem receber os assets administrativos nem executar um editor Konva por carta. A galeria administrativa usa esses assets e, portanto, não comprova o acesso do jogador.

Este registro formaliza a arquitetura técnica vigente, comprovada pelo código e pelos testes. Não aprova funcionalidades futuras de distribuição ou economia.

## Decision

Publicar um PNG achatado em namespace separado dos originais editáveis. O cliente do jogador baixa essa representação com autenticação; não reconstrói o canvas nem recebe acesso aos assets privados.

Sincronizar após salvar a carta e oferecer reparo administrativo explícito pelo renderer existente. A preview é derivada; os dados da carta e `CardCanvasData` continuam sendo as fontes estruturadas/editáveis.

[Coleção](../colecao.md#imagem-publicada-e-assets-privados) concentra o contrato de acesso, lifecycle e limites. [Cartas](../cartas.md#representação-publicada-para-o-jogador) descreve sua integração ao salvamento.

## Consequences

- A representação publicada pode ser substituída sem editar o contrato visual ou expor arquivos originais.
- Firestore e Storage não têm commit conjunto: falhas posteriores geram avisos, e o reparo manual permite tentar novamente sem desfazer um save confirmado.
- Retirar ou excluir a carta bloqueia novos downloads pelas Rules; não revoga bytes já baixados. O PNG é autenticado, apesar do nome “publicado”.

Evidências:

- [Sincronização e reparo](../../src/app/model/services/cruds/cards/published-card-preview.service.ts) e [testes](../../src/app/model/services/cruds/cards/published-card-preview.service.spec.ts).
- [Storage publicado](../../src/app/model/services/fire/published-card-storage.service.ts) e [componente do jogador](../../src/app/view/game/collection/player-card-preview/player-card-preview.component.ts).
- [Storage Rules](../../storage.rules) e [testes do componente](../../src/app/view/game/collection/player-card-preview/player-card-preview.component.spec.ts).

[Índice de decisões](README.md) · [Arquitetura](../arquitetura-frontend.md)
