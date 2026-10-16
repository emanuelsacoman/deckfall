# Guia de agentes — Deckfall

Status: Active

Last reviewed: 2026-10-16

Source of truth for: regras permanentes de trabalho dos agentes

## Início de tarefa e leitura progressiva

Antes de editar, execute `git status --short`, leia este guia e inspecione a estrutura/configuração relacionada. Preserve alterações locais. Não execute novamente o gerador de estrutura nem atualize frameworks sem necessidade.

Em tarefa relevante, leia [o estado atual](docs/project-state.md), [o roadmap](docs/roadmap.md) e identifique o marco ativo e seus bloqueadores. Use [o índice](docs/README.md) para abrir somente os documentos de domínio necessários; confira código e testes correspondentes. Determine se há decisão do proprietário pendente antes de implementar. Comandos e procedimentos detalhados ficam no [contexto operacional](docs/contexto-operacional-para-ias.md).

## Evidências e responsabilidade documental

Ordem de confiança: código executável atual; Security Rules/configuração; testes; interfaces/tipos; documentação; comentários; histórico Git. Se houver divergência, corrija a documentação a partir das evidências e registre dívida/incerteza real em [riscos](docs/riscos-e-dividas-tecnicas.md). Separe fatos verificados, decisões e pendências externas. Teste local não comprova configuração ou funcionamento em produção.

Cada informação tem uma fonte principal: estado presente em `project-state`, direção e critérios em `roadmap`, regras de jogo em `game-design`, narrativa na [Lore Bible](docs/lore/README.md), contratos nos docs de domínio e razões arquiteturais em [ADRs](docs/decisions/README.md). Linke em vez de duplicar contratos. Histórico pertence ao Git; o estado não é changelog.

Nunca invente decisões de game design nem transforme `PROPOSTA` em `APROVADO` sem aprovação explícita do proprietário. Campos, defaults e limites técnicos existentes não aprovam vida inicial, tamanho de deck, combate, raridade como regra de jogo, economia ou monetização.

## Lore e criação de conteúdo

- Antes de criar conteúdo narrativo, leia a [Lore Bible](docs/lore/README.md), seu [cânone](docs/lore/canon.md) e os registros relacionados.
- Respeite Hard Canon e o status de suas propostas; somente Emanuel pode ratificá-lo ou autorizar sua alteração.
- Expanda Soft Canon com personagens menores, lugares e conflitos locais dentro da autonomia delegada, sem contradizer a continuidade; Story Seeds não são fatos.
- Mudanças centrais exigem aprovação explícita conforme os [limites da autonomia narrativa](docs/lore/canon.md#limites-da-autonomia). Registre ideias dependentes como propostas e continue o trabalho independente permitido.
- Lore não define gameplay: facção, região, religião, profissão ou importância narrativa não conferem bônus, efeitos ou raridade automaticamente.

## Limites da autonomia

Uma tarefa técnica pode ser executada autonomamente dentro do pedido autorizado quando pertence ao marco ativo, tem requisitos documentados, não exige nova decisão de produto, respeita a arquitetura e não amplia significativamente o escopo. Correções/manutenção explicitamente solicitadas continuam permitidas fora do marco, sem alterar prioridades por conta própria.

Não avance sozinho para outro grande marco. Pare a parte dependente e peça decisão ao proprietário quando faltarem requisitos/aprovação de Game Design ou quando o avanço envolver monetização, nova fronteira de segurança, mudança arquitetural significativa ou migração destrutiva ainda não autorizadas. Roadmap é direção, não autorização automática. Mantenha somente um grande milestone marcado como `CURRENT` no roadmap.

Não faça deploy nem altere produção sem autorização explícita para o escopo na sessão. Autorizações históricas registradas em documentos não autorizam novas publicações, configurações, concessões ou migrações. Nunca adicione senhas, tokens, chaves privadas ou service accounts ao repositório.

## Arquitetura e autorização

- Use Angular standalone, Firebase modular e serviços tipados. `view` apresenta/orquestra; persistência fica em `model/services`. Componentes não acessam Firestore diretamente.
- Angular solicita; o backend confiável decide operações de valor de jogo. Valide autenticação/autorização no servidor. Admin SDK fica somente em `functions/` e seus testes, nunca no frontend.
- Guards protegem navegação; Rules protegem dados. Não enfraqueça Rules, não use e-mail como autorização nem prometa validação profunda de todo canvas no servidor. Cadastro público cria membro; o primeiro admin exige provisionamento privilegiado conforme [autenticação](docs/autenticacao-e-admin.md).
- Não conceda writes de coleção/player/packs a membros como atalho. Preserve o fluxo administrativo manual de coleção existente; novas concessões de propriedade, moeda, recompensa ou resultado exigem backend confiável, sem ampliar writes cliente.

## Cartas, canvas e previews

- Gameplay e design permanecem separados; o editor é genérico e bindings são seguros. `CardCanvasData` é o contrato visual persistido; Konva apenas o renderiza.
- Nunca persista `stage.toJSON()`, nós, listeners, histórico, Files ou Blob URLs no Firestore.
- Preserve a separação entre assets editáveis privados e PNG publicado autenticado do jogador. Mudanças em publicação/reparo devem manter os limites de autorização e os avisos de falha entre Firestore e Storage. Consulte [cartas](docs/cartas.md), [editor](docs/editor-de-cartas.md) e [coleção](docs/colecao.md).

## Bootstrap e pacotes

- Bootstrap e starter são transacionais e idempotentes. Não crie reset/regrant nem marque inicialização concluída após falha parcial.
- Instâncias, abertura e concessão de cartas por pack são server-authoritative. Frontend não cria instâncias, marca abertura nem concede conteúdo. `initializePlayer` concede uma instância lacrada; `openPack` soma cartas e marca abertura em um commit atômico.
- `PlayerPack` preserva `definitionVersion`; nunca use automaticamente a versão atual ao abrir uma instância histórica. Versões existentes são imutáveis: crie outra versão e avance o ponteiro somente para concessões futuras.
- `StarterPack` é nome reservado à definição `packDefinitions/starter`, exclusiva do bootstrap inicial e com nome fixo. Outros pacotes não podem usar variantes equivalentes ignorando caixa, espaços, `_` e `-`.
- Administração de definições/versões não concede instâncias nem cartas. Crie definição + primeira versão, ou nova versão + avanço do ponteiro, atomicamente; nunca reescreva versões existentes. Consulte [bootstrap](docs/player-bootstrap.md) e [pacotes](docs/pacotes.md).

## Final de tarefa relevante

1. Revise o diff e execute a validação necessária ao escopo: testes aplicáveis, build de produção e testes de Rules para mudanças que os afetem. Use a matriz do [contexto operacional](docs/contexto-operacional-para-ias.md). Não marque como validado o que não foi executado; informe falhas ou limitações.
2. Atualize os docs de domínio no mesmo trabalho ao mudar arquitetura, rotas, autenticação/autorização, pastas, contratos de carta/canvas/template, coleções/campos, Storage, Rules, fluxo administrativo ou dependências importantes.
3. Atualize `project-state` se o presente mudou e `roadmap` se status/critérios/bloqueadores mudaram. Crie ADR somente para decisão arquitetural durável; remova pendências resolvidas e registre novas dívidas reais.
4. Revise e atualize `README.md` no mesmo trabalho relevante, conforme [a regra de apresentação](docs/apresentacao-readme.md), sem trocas artificiais de data.
5. Confira links, `git diff --check` e `git status --short`. Informe: `Documentação impactada: sim/não`, `Documentos atualizados: ...`, `Motivo: ...`.

## Pedidos de continuidade

**“Valide o que falta”**: confira status Git, código/testes, estado e roadmap; compare critérios do marco ativo e docs do domínio. Não implemente automaticamente. Retorne um relatório curto com `Current milestone`, `Done`, `Missing`, `Blocked by owner` e `Next safe action`.

**“Continue o roadmap” / “continue o próximo item seguro”**: identifique o marco ativo, critérios e bloqueadores. Se faltar decisão do proprietário, explique e solicite somente a decisão bloqueante. Caso contrário, execute apenas o próximo incremento pequeno autorizado, valide e atualize os documentos. Não atravesse múltiplos milestones em uma solicitação genérica.
