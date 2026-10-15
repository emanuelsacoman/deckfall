# ADR-0001 — Autoridade backend sobre propriedade e abertura

Status: Accepted

Last reviewed: 2026-10-15

Source of truth for: justificativa da decisão de manter concessão inicial e abertura sob autoridade backend.

Accepted registra a arquitetura técnica vigente; não constitui aprovação de produto ou autorização de deploy.

## Context

Concessão repetida, conteúdo escolhido pelo cliente ou falha parcial podem alterar propriedade indevidamente. Guards e estado Angular protegem a navegação, mas não decidem quais dados um cliente pode gravar. O Admin SDK ignora Rules e exige validações próprias no servidor.

## Decision

`initializePlayer` e `openPack` usam exclusivamente o UID autenticado e transações no backend. A primeira concede uma instância lacrada com marcador único; a segunda soma propriedade e persiste abertura/resultado no mesmo commit. Repetições recuperam o estado confirmado, sem reconcessão. A interface solicita a operação e apresenta seu resultado.

As [Rules](../../firestore.rules) negam writes de clientes em players e instâncias, inclusive para admin. A gestão manual administrativa de coleção permanece uma capacidade privilegiada existente; não é uma permissão para implementar recompensas no Angular. Futuras operações de valor devem validar identidade, autorização e invariantes em backend confiável.

## Consequences

Falhas de configuração ou validação bloqueiam a operação inteira. Não existe reset/regrant automático. O reveal pode ser repetido sem nova concessão, pois a propriedade já foi confirmada antes da animação.

Idempotência não resolve custo de invocações abusivas. As Callables atuais não exigem App Check nem aplicam rate limiting no código; controles e monitoramento remotos não foram auditados integralmente. Limites e avaliação dessas proteções estão em [riscos](../riscos-e-dividas-tecnicas.md).

Evidências: [bootstrap](../../functions/src/player-bootstrap.ts), [abertura](../../functions/src/open-pack.ts), [validação do domínio](../../functions/src/pack-domain.ts), [testes unitários](../../functions/tests/open-pack.test.ts) e [integração local das Callables](../../functions/tests/initialize-player.emulator.ts). Contratos e limites operacionais: [pacotes](../pacotes.md) e [modelo Firestore](../modelo-dados-firestore.md).
