# ADR-0004 — Preservar versões de pacotes concedidos

Status: Accepted

Last reviewed: 2026-10-15

Source of truth for: justificativa da decisão de fixar a versão concedida e preservar versões históricas.

Accepted registra a arquitetura técnica vigente; não constitui aprovação de produto ou autorização de deploy.

## Context

Uma configuração administrativa pode evoluir enquanto existem pacotes lacrados. Abrir pela versão atual mudaria o conteúdo associado à concessão anterior. O starter também precisa permanecer único após mudanças de conteúdo ou ativação.

## Decision

Cada instância conserva `definitionVersion`. A abertura consulta essa versão; `currentVersion` e `active` controlam novas concessões. Uma versão nova não modifica a instância histórica nem concede outro starter.

O [serviço administrativo](../../src/app/model/services/cruds/packs/pack-definition.service.ts) cria definição e primeira versão juntas; uma evolução cria outra versão e avança o ponteiro no mesmo commit. O ID `starter` e o nome `StarterPack` são reservados ao bootstrap inicial. Outras definições são catálogo administrativo, sem distribuição genérica implementada.

As [Rules](../../firestore.rules) tornam versões create-only para clientes, inclusive admin, e bloqueiam exclusão da definição. Não editar nem excluir versões históricas por Console ou Admin SDK.

## Consequences

Pacotes concedidos mantêm seu conteúdo de versão após avanço/desativação. Uma carta retirada antes da abertura impede o commit; resultados já abertos preservam o snapshot e podem ser recuperados sem ler o catálogo atual.

Console e Admin SDK ignoram Rules. Não existe hash ou cópia do conteúdo na instância lacrada: uma alteração privilegiada pode mudar ou bloquear seu resultado. A preservação histórica continua obrigação operacional. As Rules validam o envelope; a atomicidade do avanço de versão é garantida pelo serviço, sem enforcement completo do vínculo pelo servidor. Limites e dívida ficam em [riscos](../riscos-e-dividas-tecnicas.md).

Evidências: [concessão](../../functions/src/player-bootstrap.ts), [abertura pela versão fixada](../../functions/src/open-pack.ts), [testes backend](../../functions/tests/open-pack.test.ts), [testes administrativos](../../src/app/model/services/cruds/packs/pack-definition.service.spec.ts) e [testes de Rules](../../tests/rules/cardgame.rules.test.mjs). Contratos: [pacotes](../pacotes.md) e [modelo Firestore](../modelo-dados-firestore.md).
