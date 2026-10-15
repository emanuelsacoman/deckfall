# Decisões arquiteturais

Status: Active

Last reviewed: 2026-10-15

Source of truth for: índice e protocolo dos Decision Records

ADRs explicam decisões técnicas importantes e duráveis. Os registros documentam a arquitetura comprovada em código, Rules e testes; os quatro primeiros foram formalizados retrospectivamente, e o ADR-0005 acompanha o Gameplay Contract. `Accepted` não representa nova aprovação de produto nem autoriza mudanças de produção. Contratos detalhados permanecem nos [docs de domínio](../README.md#domínios).

| ADR | Status | Decisão |
| --- | --- | --- |
| [ADR-0001](0001-autoridade-backend.md) | Accepted | Angular solicita; backend decide operações de valor |
| [ADR-0002](0002-design-visual-separado.md) | Accepted | Design visual separado dos dados de gameplay |
| [ADR-0003](0003-previews-publicadas-separadas.md) | Accepted | PNG publicado separado dos assets editáveis privados |
| [ADR-0004](0004-versoes-de-pacotes-preservadas.md) | Accepted | Instância preserva a versão histórica do pacote |
| [ADR-0005](0005-contrato-gameplay-puro.md) | Accepted | Gameplay Contract puro e isolado das aplicações/infraestrutura |

## Quando registrar

Use ADR quando uma decisão altera uma fronteira de confiança, contrato durável ou alternativa arquitetural importante. Não crie um registro por componente, correção pequena ou etapa do roadmap. Código comprova o comportamento; não invente a motivação histórica de uma decisão sem evidência.

Formato: `# ADR-XXXX — Título`, `Status: Proposed / Accepted / Superseded`, `Last reviewed`, `Source of truth for`, e seções `Context`, `Decision`, `Consequences`. Vincule as fontes de código/testes e o domínio relevante. Uma proposta arquitetural que exija decisão do proprietário continua `Proposed` até aprovação explícita; decisões de regras do jogo pertencem ao [Game Design](../game-design.md).

Ao substituir decisão, preserve seu registro como `Superseded` e linke o sucessor; atualize este índice e os docs afetados. Entrada dos agentes: [AGENTS.md](../../AGENTS.md); presente: [Project State](../project-state.md); direção: [roadmap](../roadmap.md).
