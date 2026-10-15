# Roadmap — Deckfall

Status: Active

Last reviewed: 2026-10-15

Source of truth for: direção do produto, ordem dos marcos, dependências e critérios de conclusão

## Como usar

As fases e a ordem abaixo registram o direcionamento explícito do proprietário. Não tornam cada item inevitável nem autorizam implementação automática. A situação presente está em [Project State](project-state.md); regras de jogo e aprovações em [Game Design](game-design.md); autonomia em [AGENTS.md](../AGENTS.md#limites-da-autonomia).

Status: **DONE** = critérios atendidos com evidência (aprovação explícita para design; implementação e validação local para código); **IN PROGRESS** = execução iniciada; **BLOCKED** = depende de decisão/requisito ainda ausente; **PLANNED** = próximo trabalho ou direção futura, ainda sem execução. A marca do único milestone ativo aparece na seção Typed Effects. Ela é independente do status: indicar o próximo trabalho não inicia sua implementação nem autoriza decisões pendentes.

Os critérios das fases futuras são alvos de planejamento, a detalhar e confirmar com o proprietário antes de executar cada marco. Não aprovam valores, regras de jogo, desenho de economia ou uma arquitetura futura. Só avance de status com evidência; código placeholder não satisfaz conclusão. Referências apontam para documentos existentes; crie novos contratos somente quando o marco permitir, sem arquivos vazios antecipados.

## Fase I — Fundação da plataforma

**Status: DONE — implementação da fundação.** Dependências: Angular/Firebase configurados, perfil administrativo e conteúdo real para o starter. Objetivo: editar/publicar cartas e permitir autenticação, coleção e abertura segura do inicial.

Critério de conclusão: fluxos implementados com separação de autoridade e cobertura local em frontend/backend/Rules. Isso não certifica produção: QA member e publicação da correção local de previews permanecem em [riscos](riscos-e-dividas-tecnicas.md), com [evidências datadas](contexto-operacional-para-ias.md). Não reabrir a falta histórica de configuração já resolvida nem declarar essas verificações externas concluídas.

Fora da fase: regras de batalha, decks funcionais, PvP, economia e progressão.

| Item | Status | Objetivo | Dependências | Critério de conclusão | Referência principal |
| --- | --- | --- | --- | --- | --- |
| Angular/Firebase e backend | DONE | Base cliente/servidor e infraestrutura tipada | Configuração do projeto | Providers, rotas lazy e Functions separados com builds e testes locais | [Arquitetura](arquitetura-frontend.md) |
| Auth | DONE | Entrar/cadastrar e gerir métodos próprios | Authentication e perfis | E-mail/senha, Google, vínculo, recuperação e guards cobertos | [Auth](autenticacao-e-admin.md) |
| Admin e usuários | DONE | Operações privilegiadas sem autopromoção | Auth e Rules | Painel de cartas/perfis/pacotes, papéis consistentes e primeiro admin documentado | [Usuários](usuarios.md) |
| Editor e cartas | DONE | Criar/editar dados e design independentes | Assets e persistência | Canvas próprio, CRUD, templates, histórico e exportação existentes | [Editor](editor-de-cartas.md), [cartas](cartas.md) |
| Publicação e preview admin | DONE | Publicar documento e visualizar composição | Editor e Storage privado | Status persistido, galeria pelo renderer e avisos pós-save | [Cartas](cartas.md) |
| Área do jogador | DONE | Navegar com sessão e preparação válidas | Auth e bootstrap | Shell, home/perfil e gate, com decks/jogar identificados como placeholders | [Arquitetura](arquitetura-frontend.md) |
| Coleção | DONE | Consultar propriedade e gerir quantidades por admin | Cartas publicadas e Rules | Leitura própria, busca/filtro, quantidades/datas e writes member negados | [Coleção](colecao.md) |
| Player Bootstrap | DONE | Preparar jogador uma única vez | Callable e starter válido | Instância lacrada + marcador em transação idempotente; falha sem concessão parcial | [Bootstrap](player-bootstrap.md) |
| Packs e StarterPack | DONE | Administrar conteúdo determinístico versionado | Cartas publicadas e admin | Definição/versão atômicas, histórico imutável e nome reservado | [Pacotes](pacotes.md) |
| Open Pack e reveal | DONE | Conceder antes de revelar, sem duplicação | Instância e versão histórica | Coleção + estado/snapshot no mesmo commit, retry/concorrência e revisão cobertos | [Pacotes](pacotes.md) |
| Preview para player | DONE | Exibir carta completa sem assets privados | PNG publicado e perfil válido | Componente compartilhado em coleção/reveal/resumo, download autenticado e retry | [Coleção](colecao.md) |
| Reparo de previews | DONE | Regenerar PNG ausente/desatualizado pelo admin | Renderer e autorização de upload | Lote sequencial/ação individual, checagem de versão e resultado por carta | [Coleção](colecao.md) |

## Fase II — Core Game

**Status: IN PROGRESS — design aprovado e Gameplay Contract validado.** Objetivo: chegar a um núcleo jogável verificável antes de multiplayer ou economia. Dependências: fundação e regras de v0.1 aprovadas; demais incrementos seguem a ordem abaixo.

Critério de conclusão: design aprovado, contratos/efeitos/regras tipados, decks válidos e motor exercitável em sandbox e treino conforme critérios aprovados. Fora da fase: matchmaking/PvP, recompensas, moedas, loja, monetização e progressão competitiva.

### Game Design v0.1

**Status: DONE.** Objetivo: definir e aprovar o escopo mínimo do jogo. Dependência atendida: Emanuel aprovou explicitamente v0.1 em 2026-10-15, incluindo recomendações, regras, números iniciais, conjunto de referência e cenários. Alternativas comparativas não foram adotadas; duração e balanceamento ainda exigem playtest.

Critério de conclusão: tópicos de v0.1 preenchidos, ambiguidades relevantes resolvidas, cenários mínimos descritos e aprovação do proprietário registrada com data/escopo/referência. Documento de referência: [Game Design](game-design.md). Nenhum default do editor substitui essa decisão.

Evidência: [aprovação registrada](game-design.md#aprovações-registradas). A aprovação não comprova partida funcional nem autoriza deploy ou execução automática de vários marcos.

### Gameplay Contract

**Status: DONE.** Objetivo: expressar o design aprovado em contratos tipados. Dependência atendida: Game Design v0.1 aprovado. Critério de conclusão atendido: módulo puro `shared/gameplay`, testes de tipos e testes de execução para envelopes, invariantes de snapshots e projeções por participante, sem integração de batalha.

Referência: [Gameplay Contract](gameplay-contract.md). A validação estrutural do descritor de efeitos não implementa sua semântica; não há validação de composição/posse de decks, resolvedor de comandos, PRNG concreto ou persistência de partidas. Resultados executados estão no [contexto operacional](contexto-operacional-para-ias.md#validação-disponível).

### Typed Effects

**Milestone: CURRENT**

**Status: PLANNED.** Objetivo: formalizar catálogo fechado e validação semântica dos efeitos aprovados. Dependências: Gameplay Contract e semântica de v0.1, já disponíveis. Critério de conclusão: efeitos/parâmetros/alvos cobertos por testes conforme o design, sem executar texto livre. Referências: [Game Design](game-design.md) e [contrato](gameplay-contract.md).

Próximo incremento permitido em nova solicitação: catálogo tipado/validação semântica de dano, cura e compra com testes isolados. Não implementar Deck Rules, transições de batalha ou integração de UI/backend nesse incremento. Este marco não foi executado junto do Gameplay Contract.

| Próximos itens, na ordem desejada | Status | Objetivo | Dependências | Critério de conclusão | Referência principal |
| --- | --- | --- | --- | --- | --- |
| Deck Rules | PLANNED | Validar composição de decks | Typed Effects e regras de deck aprovadas | Validador cobre elegibilidade/limites aprovados, sem inferir limites da coleção | [Game Design](game-design.md), [coleção](colecao.md) |
| Deck Builder | PLANNED | Montar/salvar decks válidos | Deck Rules e contrato de persistência/autorização revisado | Criar, editar e reabrir decks com validação; acesso e casos inválidos cobertos | [Game Design](game-design.md), [modelo Firestore](modelo-dados-firestore.md) |
| Battle Engine | PLANNED | Resolver ações e estado do combate | Marcos anteriores e resolução aprovada | Transições/ações legais, término e efeitos testados com execução reproduzível | [Game Design](game-design.md), [ADR-0001](decisions/0001-autoridade-backend.md) |
| Battle Sandbox | PLANNED | Inspecionar cenários do motor | Battle Engine | Carregar cenário, executar ações e observar resultado/erros sem conceder valor | [Game Design](game-design.md) |
| Training Bot | PLANNED | Permitir treino no escopo acordado | Sandbox e ações legais do motor | Bot completa cenários de treino definidos sem bypass das regras | [Game Design](game-design.md) |

## Fase III — Multiplayer

**Status: PLANNED.** Objetivo: partidas entre jogadores com autoridade confiável. Dependências: Core Game concluído e requisitos de persistência, segurança e operação aprovados. Critério de conclusão: fluxo casual completo com ações validadas no servidor e recuperação de sessão. Fora da fase: economia, recompensas de valor, ranked/MMR e temporadas.

| Item, na ordem desejada | Status | Objetivo | Dependências | Critério de conclusão | Referência principal |
| --- | --- | --- | --- | --- | --- |
| Match Persistence | PLANNED | Persistir estado/identidade de partidas | Fase II e contrato aprovado | Modelo, autorização e recuperação testados sem confiar em writes de resultado do cliente | [Modelo atual](modelo-dados-firestore.md), [ADR-0001](decisions/0001-autoridade-backend.md) |
| Server-authoritative battle actions | PLANNED | Validar ações de partida no servidor | Match Persistence e motor | Servidor valida jogador, turno e ação; repetição/concorrência não corrompem estado | [ADR-0001](decisions/0001-autoridade-backend.md) |
| Matchmaking | PLANNED | Formar partidas conforme política aprovada | Ações backend e decisão de pareamento | Entrada/saída da fila e criação de partida consistentes e testadas | [Game Design](game-design.md) |
| PvP Casual | PLANNED | Completar partida entre duas sessões | Matchmaking | Fluxo casual de início a término com resultado decidido pelo servidor | [Game Design](game-design.md), [ADR-0001](decisions/0001-autoridade-backend.md) |
| Reconnection | PLANNED | Retomar partida após perda de conexão | PvP Casual e política de abandono aprovada | Reconexão recupera estado autoritativo sem repetir ações/resultado | [Game Design](game-design.md) |

## Fase IV — Economia

**Status: PLANNED.** Objetivo: introduzir valor/distribuição mediante decisões próprias do proprietário. Dependências: Core Game e Multiplayer concluídos, regras econômicas e eventual monetização aprovadas. Não antecipar economia ao Core Game sem decisão explícita.

Critério de conclusão: fluxos econômicos autorizados definidos, implementados e testados no backend, sem créditos/compras decididos pelo Angular. Fora da fase: XP/ranked/MMR/seasons da progressão, trocas e marketplace; compra com dinheiro real não é presumida pelo nome dos itens.

| Item, na ordem desejada | Status | Objetivo | Dependências | Critério de conclusão | Referência principal |
| --- | --- | --- | --- | --- | --- |
| Deckfall Coins | PLANNED | Representar moeda conforme política aprovada | Fase III e decisão econômica | Contrato de saldo/operações confiáveis testado, sem crédito pelo cliente | [ADR-0001](decisions/0001-autoridade-backend.md), [Game Design](game-design.md) |
| Match Rewards | PLANNED | Conceder recompensas de partidas válidas | Coins e resultados autoritativos | Regras aprovadas aplicadas uma única vez pelo backend, com falhas/retry cobertos | [ADR-0001](decisions/0001-autoridade-backend.md) |
| Shop | PLANNED | Oferecer catálogo/transação econômica | Rewards e política de preços/compra aprovada | Compra validada e concluída atomicamente no servidor, sem débito/concessão parciais | [Game Design](game-design.md), [ADR-0001](decisions/0001-autoridade-backend.md) |
| Purchasable Packs | PLANNED | Comprar instâncias conforme oferta aprovada | Shop e contrato de concessão | Débito e instância versionada idempotentes; abertura preserva autoridade atual | [Pacotes](pacotes.md), [ADR-0004](decisions/0004-versoes-de-pacotes-preservadas.md) |
| Random Packs / rarity odds | PLANNED | Sortear conteúdo com probabilidades aprovadas | Purchasable Packs e decisão de chances | Sorteio backend testável e odds versionadas; raridade cadastral não define chance | [Game Design](game-design.md), [pacotes](pacotes.md) |
| Event/Season Packs | PLANNED | Ofertar packs temáticos/temporários | Random Packs e regras de disponibilidade aprovadas | Elegibilidade/período e conteúdo versionado validados no servidor | [Game Design](game-design.md), [pacotes](pacotes.md) |

## Fase V — Progressão

**Status: PLANNED.** Objetivo: progressão e competição segundo regras aprovadas. Dependências: fases anteriores e decisões de progressão/ranking. Critério de conclusão: os incrementos que o proprietário mantiver no escopo têm cálculo confiável e testes; nenhum número fictício aparece como progresso real. Fora da fase: trocas/marketplace e novos modos de jogo não especificados.

| Item, na ordem desejada | Status | Objetivo | Dependências | Critério de conclusão | Referência principal |
| --- | --- | --- | --- | --- | --- |
| XP | PLANNED | Registrar experiência válida | Fase IV e política aprovada | Concessão backend idempotente com origem verificável e testes | [Game Design](game-design.md), [ADR-0001](decisions/0001-autoridade-backend.md) |
| Level | PLANNED | Derivar nível de progressão | XP e curva aprovada | Limiares/transições testados, sem nível arbitrário do cliente | [Game Design](game-design.md) |
| Achievements | PLANNED | Reconhecer objetivos definidos | Level e critérios aprovados | Elegibilidade e concessão única verificadas pelo servidor | [Game Design](game-design.md), [ADR-0001](decisions/0001-autoridade-backend.md) |
| Ranked | PLANNED | Oferecer competição classificada | Achievements, PvP e política competitiva aprovada | Partidas classificadas seguem regras/resultado confiáveis e critérios acordados | [Game Design](game-design.md) |
| MMR | PLANNED | Calcular avaliação competitiva | Ranked e algoritmo aprovado | Atualizações reproduzíveis e únicas por resultado, com casos de teste | [Game Design](game-design.md), [ADR-0001](decisions/0001-autoridade-backend.md) |
| Leaderboard | PLANNED | Exibir classificação autorizada | MMR e política de exposição aprovada | Ordenação/visibilidade e atualização verificadas com dados reais | [Game Design](game-design.md) |
| Seasons | PLANNED | Organizar ciclos competitivos | Leaderboard e política de ciclo aprovada | Virada/histórico e efeitos aprovados testados sem reset destrutivo improvisado | [Game Design](game-design.md) |

## Manutenção do roadmap

Em tarefa relevante, atualize status somente se critérios mudaram de fato. Ao concluir um marco, registre a evidência no documento apropriado e consulte os bloqueios do próximo; sua promoção não autoriza decisões pendentes. Mantenha o estado e a próxima ação segura coerentes em [Project State](project-state.md), sem copiar o roadmap para lá. Procedimentos de validação/continuidade: [AGENTS.md](../AGENTS.md#pedidos-de-continuidade).
