# Deck Builder v0.1 — arquitetura aprovada

Status: **ARQUITETURA APROVADA por Emanuel em 17/10/2026 — CONTRATOS, CINCO DOMÍNIOS E ADAPTERS FIRESTORE ISOLADOS DE DECKS E CATÁLOGO HISTÓRICO IMPLEMENTADOS; MARCO CURRENT E INCOMPLETO**

Last reviewed: 2026-11-25

Source of truth for: arquitetura aprovada de persistência, autorização e ciclo de vida de decks pessoais, contratos e status dos incrementos implementados

## Escopo e autorização recebida

Emanuel autorizou em 17/10/2026 iniciar Deck Builder e promovê-lo a CURRENT. Na revisão seguinte da mesma data, **aprovou os blocos 1, 2, 3 e 5 e o bloco 4 com a revisão de compatibilidade descrita neste documento**: a troca da versão ativa não invalida automaticamente referências antigas ainda reconhecidas e elegíveis. As recomendações adotadas abaixo são arquitetura aprovada para v0.1; as alternativas comparativas não foram adotadas. As regras do jogo continuam no [Game Design](game-design.md#preparação-decks-e-acesso--aprovado).

Após revisar os escopos, Emanuel autorizou o [primeiro incremento técnico](#primeiro-incremento-técnico-proposto), helper puro de compatibilidade, o [contrato puro de rascunhos](#contrato-puro-de-rascunhos-pessoais), o [contrato puro de recurso e mutações](#contrato-puro-de-recurso-e-mutações), a [porta backend do store com erros de domínio](#porta-backend-do-store-e-erros-de-domínio), a [exclusão](#operação-de-domínio-de-exclusão), a [renomeação no domínio](#operação-de-domínio-de-renomeação), a [porta de leitura de catálogo versionado](#porta-backend-de-leitura-de-catálogo-versionado), a [validação pura de referências históricas](#validação-pura-de-referências-históricas) e a [atualização no domínio](#operação-de-domínio-de-atualização), com testes e documentação. Esses incrementos preservaram schemas existentes e não incluíram persistência, catálogo cadastrado, transporte ou dados remotos.

Em 29/10/2026, Emanuel autorizou exclusivamente o [adapter Firestore de decks e integração no emulador](#adapter-firestore-isolado), sem alterar a porta pública. A implementação permanece isolada no backend, sem catálogo remoto, Callables/endpoints, autenticação de transporte, Rules, UI, provisionamento, migração, Battle Engine ou deploy. Deck Builder continua CURRENT e INCOMPLETO.

Em 25/11/2026, Emanuel autorizou exclusivamente o [adapter histórico de catálogo e integração no emulador](#adapter-firestore-de-catálogo-histórico) e aprovou explicitamente a representação persistida das referências de treino descrita abaixo. Esse incremento acrescenta leitura, sem provisionar ou ativar conteúdo, alterar os cinco domínios ou expor transporte.

Na mesma data, autorizou separadamente somente a [ampliação da integração de Update e Duplicate](#integração-real-de-update-e-duplicate) com os dois adapters reais. Esse trabalho altera testes e documentação, sem mudar domínios, portas ou schemas.

## Base atual verificada em modo somente leitura

Emanuel também autorizou exclusivamente a [criação no domínio](#operação-de-domínio-de-criação) e, em 29/10/2026, a [duplicação no domínio](#operação-de-domínio-de-duplicação), cada uma com testes e documentação. Os testes com doubles desses incrementos não comprovam persistência nem isolamento reais; a evidência posterior do adapter fica em [capacidade concorrente](#limite-de-20-sob-concorrência).

| Fato observado no repositório | Consequência para a arquitetura | Evidência principal |
| --- | --- | --- |
| Perfil válido exige `role == roleId`, em `member/admin`; UID autenticado identifica o titular. | Não autorizar por e-mail, payload do cliente ou guard Angular. | [Rules](../firestore.rules), [domínio backend](../functions/src/pack-domain.ts), [autenticação](autenticacao-e-admin.md) |
| Coleção guarda quantidade e duas datas em `users/{uid}/collection/{cardId}`; o ID vem do caminho. Member lê a própria coleção; a gestão manual administrativa existente é preservada. | Quantidade possuída é por identidade, sem saldo separado por revisão. Decks não concedem ou consomem cartas. | [interface](../src/app/model/interfaces/Collection/player-card-collection.ts), [serviço](../src/app/model/services/cruds/collection/player-collection.service.ts), [coleção](colecao.md) |
| `Card` tem status `draft/published/archived`, dados/editor/canvas e datas; não possui revisão nem perfil canônico de batalha. | Publicação, `updatedAt`, raridade ou atributos genéricos não tornam uma carta elegível para gameplay. | [Card](../src/app/model/interfaces/Cards/card.ts), [cartas](cartas.md) |
| Deck Rules recebe composição e contexto confiável separados; verifica 24 cartas, duas cópias por identidade, revisão/elegibilidade e posse ou referência exata. | Reutilizar o validador, sem aceitar contexto confiável enviado pelo cliente. | [implementação](../shared/gameplay/src/decks.ts), [contrato](gameplay-contract.md#deck-rules-e-contexto-confiável), [testes](../tests/gameplay/gameplay-deck.test.mjs) |
| `initializePlayer` e `openPack` autenticam e validam no backend, com transação e erros limitados. Admin SDK ignora Rules. | Repetir autorização e validação no serviço de decks; Rules sozinhas não protegem uma Callable. | [Callables](../functions/src/index.ts), [abertura](../functions/src/open-pack.ts), [ADR-0001](decisions/0001-autoridade-backend.md) |
| O adapter do bootstrap oferece `get(path)` e `set(path)`; não oferece consulta de coleção, create ou delete. | Decks usam adapter e porta próprios, sem transformar bootstrap em serviço de decks. | [adapter bootstrap](../functions/src/firestore-bootstrap-store.ts), [adapter decks](../functions/src/decks/firestore-personal-deck-store.ts) |
| `/game/decks` é placeholder; não existe match de decks nas Rules, e o fallback nega acesso. Gameplay ainda é módulo isolado. | A arquitetura aprovada ainda precisa de implementação; não há permissão ou endpoint existente a reutilizar como atalho. | [placeholder](../src/app/view/game/decks/decks.component.ts), [Rules](../firestore.rules), [ADR-0005](decisions/0005-contrato-gameplay-puro.md) |

Essa inspeção não conferiu produção. Resultados locais de runtime continuam identificados por incremento e data no [contexto operacional](contexto-operacional-para-ias.md#validação-disponível); não comprovam funcionamento remoto.

## Decisões aprovadas e alternativas não adotadas

Decisões **APROVADAS por Emanuel em 17/10/2026**, com a correção de compatibilidade incorporada. A coluna de alternativas registra comparação, não autorização adicional.

| Decisão | Decisão adotada | Única alternativa considerada | Motivo |
| --- | --- | --- | --- |
| Local dos decks pessoais | `users/{uid}/decks/{deckId}` | Coleção global com `ownerUid` em cada documento | O caminho expressa o titular e evita duplicar propriedade ou introduzir consulta global. |
| Escrita | Backend confiável para todo CRUD; cliente lê apenas seus decks | Escrita direta de rascunhos, com validação final no backend | Centraliza limites, concorrência e formato; evita dois modelos diferentes de escrita e validação. |
| O que pode ser salvo | Intenção privada, inclusive composição incompleta ou sem posse suficiente | Salvar somente decks completos e jogáveis naquele instante | Permite montar aos poucos e conservar a lista após mudanças de coleção/conteúdo; não equivale a permitir jogar. |
| Conteúdo canônico | Versões imutáveis em coleção nova, com um ponteiro de versão ativa controlado pelo backend | Bundles imutáveis no repositório, ativados por release do backend | Mantém a política ativa consultável na transação de admissão e permite revisão sem acoplar conteúdo a um deploy. O pool pequeno cabe em um documento por versão. |
| Identidade colecionável | Mesmo `cardId` de `cards/{cardId}` e da coleção | Tabela de mapeamento entre identidades de gameplay e cartas colecionáveis | Uma identidade única dispensa aliases, somas entre variantes e alterações da coleção. |
| Novas partidas pessoais | Validar as referências explícitas salvas contra o catálogo ativo, sem exigir igualdade da versão histórica | Exigir migração de todo deck a cada ativação, rejeitado por Emanuel | Adições compatíveis não exigem reparo; nenhuma revisão é substituída silenciosamente. |
| Capacidade por conta | 20 decks, incluindo incompletos | 10 decks | Espaço suficiente para experimentar, mantendo leitura e controle do limite pequenos; sem cobrança ou desbloqueio econômico. |
| Conflitos | Inteiro `version` e comparação da versão esperada | Comparação de `updatedAt`, como em operações atuais do catálogo | Separa revisão do documento de relógio e de revisão mecânica das cartas. |

## Modelo de decks pessoais

**APROVADO — 17/10/2026.** Um documento por deck em `users/{uid}/decks/{deckId}`, sem subcoleção de cartas. O conjunto é pequeno e pode ser lido e substituído atomicamente.

| Campo persistido | Contrato aprovado para v0.1 |
| --- | --- |
| `schemaVersion` | Inteiro fixo 1; versão do envelope de persistência, independente das regras. |
| `name` | Texto simples após trim, não vazio, até 80 caracteres pelo mesmo critério de comprimento usado nos campos atuais do projeto. Nomes repetidos são permitidos. |
| `version` | Inteiro seguro positivo; inicia em 1 e avança em cada edição efetiva, inclusive renomeação. Nunca fornecido como novo valor pelo cliente. |
| `rulesVersion` | Versão aprovada suportada: `0.1`. |
| `contentVersion` | Proveniência do conjunto canônico contra o qual a composição foi salva/conferida historicamente. Não é autorização de partida nem requisito de igualdade com a versão ativa; as referências explícitas continuam fixadas nas entradas. |
| `entries` | Array de referências `{cardId, revision, quantity}`; sem perfis inline ou instâncias de batalha. |
| `createdAt` | Timestamp de servidor, definido na criação e imutável. |
| `updatedAt` | Timestamp de servidor, atualizado com a edição efetiva. |

`uid` e `deckId` vêm do caminho, sem duplicação no documento. Um UUID opaco identifica o deck; nome e slug não são identidade. IDs de carta/conteúdo seguem os limites do Gameplay Contract; versões/revisões/quantidades são inteiros seguros, sem conversão permissiva de strings ou floats.

Não persistir `isValid`, `isPlayable`, ownership, elegibilidade, raridade, nomes/imagens de cartas, canvas, custo/efeitos, resultado de partida, `selectedDeckId` ou modo de treino. Esses dados têm outras fontes ou ainda não são requisitos. Não criar descrição, capa, favoritos, histórico de versões ou compartilhamento no v0.1.

### Composição salva e limites

**APROVADO — 17/10/2026.** A gravação aceita de zero a 24 cartas no total e até duas cópias por identidade. Cada linha tem quantidade 1 ou 2; remover uma carta remove a linha. O backend agrega linhas repetidas da mesma identidade/revisão, recusa revisões conflitantes, confere os limites e salva uma linha por identidade em ordem lexical ASCII. Não existe mínimo de Unidades/Ações, raridade ou facção.

Na futura camada de salvamento confiável, toda referência precisa ser reconhecida e corresponder à revisão canônica de seu `contentVersion`, mesmo em rascunho. O parser puro de intenção implementado **não realiza essa conferência**: valida somente formato e normalização, sem alegar reconhecimento. Guardar uma intenção incompleta não permitirá inventar perfis canônicos. Revisões de conteúdo já utilizadas continuam previstas para leitura e reparo; sua retirada de novas partidas não apaga as listas salvas. O futuro backend permitirá conservar referências reconhecidas que perderam publicação, elegibilidade ou posse; informará indisponibilidade sem promover o deck a jogável.

Limite v0.1 aprovado de **16 KiB** para o pedido de mutação e para a representação normalizada do documento. A medida de aplicação é JSON em UTF-8, com timestamps da projeção normalizados para ISO UTC; não é uma medição do armazenamento interno do Firestore. Campos exatos, até 24 entradas, IDs limitados e nome curto mantêm o envelope pequeno. Recusar campos extras, conteúdo binário e tentativas de inflar o pedido antes de consultas caras. O teto da aplicação é deliberadamente menor que o [limite da plataforma](https://firebase.google.com/docs/firestore/quotas#collections_documents_and_fields), sem alterar esse limite nem schemas existentes.

Os limites **20 decks por conta, nome até 80 caracteres, envelope de deck até 16 KiB e envelope de conteúdo até 64 KiB** foram explicitamente aprovados por Emanuel para **v0.1**. São limites revisáveis desta versão, não invariantes permanentes do produto nem números a acrescentar às regras imutáveis de batalha. Uma revisão futura deve ser deliberada, documentada e testada.

Listar apenas a subcoleção própria, com consulta limitada, e ordenar localmente até 20 decks por atualização e ID como desempate. Não há necessidade inicial de consulta global, índice composto ou contador em `users`/`players`. Nenhum índice está sendo criado nesta proposta.

## Ownership e autorização

**APROVADO — 17/10/2026.** O titular é exclusivamente `request.auth.uid`, com perfil existente e `role == roleId` em `member/admin`. Não exigir novo campo de autorização em `users` nem usar o recebimento do starter como comprovante de posse de cartas.

| Ator | Leitura de decks pessoais | Criação, edição, exclusão e duplicação |
| --- | --- | --- |
| Anônimo, perfil ausente ou papel inconsistente | Negada | Negadas |
| Member com perfil válido | Somente seus documentos e sua subcoleção | Somente por backend autenticado, no próprio caminho |
| Admin usando o aplicativo | Somente seus próprios decks; sem acesso administrativo geral a decks privados no v0.1 | Mesmo fluxo backend do titular; sem exceção para SDK cliente |
| Backend privilegiado | Apenas os dados necessários à operação autorizada | Revalida identidade, perfil, caminho, formato e invariantes; não confia no Admin SDK como autorização de produto |

As Rules futuras permitiriam get/list próprios e negariam todos os writes cliente, inclusive administrativos. O privilégio atual de gerir manualmente coleção não seria ampliado a decks pessoais. Acesso operacional por IAM/Admin SDK continua sendo uma fronteira privilegiada distinta; não há promessa de que Rules bloqueiem operadores do projeto.

O cliente pode solicitar `deckId`, nome, composição e versão esperada. Payloads não podem fornecer UID proprietário, `ownership`, `eligible`, `definition`, `validatedDeck` ou uma exceção `training` como autoridade. Verificar identificadores antes de compor caminhos; não aceitar paths arbitrários. Respostas de erro não revelam coleção/decks de terceiros ou detalhes internos.

## Conteúdo canônico e revisões

**APROVADO — 17/10/2026.** Preservar integralmente `Card`, `CardCanvasData`, `users`, `players`, coleção e pacotes. Adicionar, apenas em incremento técnico futuro autorizado, duas estruturas independentes:

| Caminho aprovado | Responsabilidade mínima |
| --- | --- |
| `gameplayContentVersions/{contentVersion}` | Envelope de conteúdo com `schemaVersion`, `catalog` no formato `GameplayDeckCatalog`, referências de treino identificadas e suas composições, e `createdAt` de servidor. A versão do caminho coincide com `catalog.contentVersion`; todas as referências usam suas regras/conteúdo. Documento imutável após criação. |
| `gameplayConfig/active` | `schemaVersion`, `contentVersion` e `updatedAt` de servidor; aponta para uma versão existente e integralmente validada. Política única de conteúdo permitido para novas admissões. |

A leitura histórica está implementada pelo [adapter isolado](#adapter-firestore-de-catálogo-histórico). Escrita, provisionamento e ativação continuam não implementados; não há conteúdo de produção criado por esse incremento.

O ponteiro não contém perfis duplicados. Publicar uma nova versão e ativá-la exige operação privilegiada explícita, com validação de todas as definições, referências e identidades antes do commit; não é uma capacidade do jogador nem uma nova tela administrativa presumida. Não se reescreve uma versão histórica. Provisionamento/publicação desse conteúdo será um trabalho próprio autorizado, sem seed remoto implícito.

Limite técnico v0.1 aprovado para o envelope completo de uma versão de conteúdo: **64 KiB** de JSON normalizado em UTF-8, incluindo catálogo, referências e data normalizada. Conferir tamanho, campos exatos, IDs únicos, versões coincidentes e validade completa das referências antes de gravar/ativar. O pool didático inicial tem 16 identidades aprovadas; isso não aprova futuros aumentos nem dispensa esse limite. Uma versão que não caiba deve ser recusada, sem fragmentação automática ou contorno do teto; outro modelo exigiria revisão arquitetural.

Clientes não gravam nenhuma dessas estruturas. Recomenda-se fornecer ao jogador autenticado uma projeção de catálogo/referências permitidos por serviço backend; os documentos autoritativos completos permanecem sem leitura direta pelo cliente. A projeção pessoal só apresenta cartas atualmente publicadas e não expõe metadados ou assets privados. O modo de treino fornece seu conteúdo didático próprio. Não expor cartas draft/archived através de uma junção privilegiada para contornar as Rules de `cards` ou Storage.

Para deck pessoal, `GameplayCardDefinition.cardId` deve ser exatamente o ID de `cards/{cardId}` e `users/{uid}/collection/{cardId}`. Uma referência de treino pode usar identidades didáticas que ainda não tenham `Card` colecionável; elas não ficam disponíveis para partidas pessoais por causa disso. Slug, nome, arte, facção ou posição na lista não resolvem essa associação.

`revision` é a revisão do perfil mecânico, não `updatedAt` de `Card`, versão do canvas ou `version` do deck. O mesmo par `cardId/revision` mantém o mesmo perfil em todos os conjuntos. Alterar custo, atributos mecânicos ou efeitos exige nova revisão e novo `contentVersion`; mudar somente arte/texto de apresentação não altera automaticamente a mecânica. Uma nova revisão não exige adquirir outra cópia: a coleção continua medindo quantidade por identidade.

O catálogo e suas referências precisam de validação editorial e técnica antes de existir como conteúdo utilizável. Os nomes/perfis aprovados no Game Design e o manifesto da Starter Wave não criam documentos, vínculos ou elegibilidade; Nyra não é adaptada automaticamente. Se configuração, versão ou vínculo obrigatório não existir ou estiver inválido, retornar indisponibilidade; não derivar um perfil dos defaults do editor nem usar fixtures como fallback.

## Deck salvo e deck validado para uma partida

| Conceito | Significado aprovado |
| --- | --- |
| Deck salvo pelo jogador | Intenção privada com referências e metadados. Pode estar incompleto, desatualizado ou sem quantidade possuída suficiente. Permanecer salvo não certifica acesso ao jogo. |
| Resultado de uma conferência | Diagnóstico calculado contra conteúdo e coleção observados naquela operação. Pode mudar; não é campo permanente de autoridade nem token emitido ao cliente para reutilização. |
| Deck admitido para uma partida futura | Backend autenticou, escolheu conteúdo permitido, releu dados confiáveis e obteve uma composição canônica válida para fixar no estado daquela partida. Não é o documento pessoal usado diretamente pelo motor. |

**APROVADO — 17/10/2026.** Na persistência de rascunhos, reutilizar `parseGameplayDeckList` para o envelope e aplicar as restrições de composição parcial acima. Não relaxar `validateGameplayDeck` para aceitar decks incompletos e não reutilizar o modo de referência como bypass de propriedade. A política de rascunho pertence à aplicação; as regras completas aprovadas permanecem no módulo puro.

Na futura conferência completa/admissão pessoal, o backend:

1. Deriva o titular da autenticação e valida o perfil; lê o deck do próprio caminho e confere a versão esperada.
2. Lê `gameplayConfig/active` e a versão canônica correspondente. A versão histórica salva não bloqueia nem certifica admissão: o backend verifica as referências explícitas contra esse catálogo ativo, sem substituir revisões.
3. Obtém as identidades agregadas e lê `users/{uid}/collection/{cardId}` e `cards/{cardId}` necessários. Ausência na coleção equivale a zero; entrada malformada ou falha de leitura impede concluir a validação, sem converter erro em propriedade válida.
4. Valida o envelope da coleção, inclusive quantidade inteira e datas coerentes. Essa é uma exigência **aprovada para o novo fluxo backend ainda não implementado**, seguindo a validação estrita de entradas na abertura de packs em `pack-domain.ts`; não é uma garantia do parser frontend da coleção, que admite datas ausentes/inválidas como null. Deriva elegibilidade efetiva para deck pessoal: permitida no catálogo **e** carta existente com status `published`.
5. Constrói a composição transitória descrita abaixo e monta `{kind: 'owned', catalog, ownership}` exclusivamente com os dados confiáveis. Chama `validateGameplayDeck` sem alterações. O validador aplica exatamente 24 cartas, cópias agregadas, revisão canônica, conteúdo, elegibilidade e quantidade possuída.
6. Usa o resultado copiado/canônico apenas na operação confiável que o produziu. Uma resposta informativa ao cliente não substitui repetir essa validação na admissão da partida.

Não consumir nem reservar cartas ao salvar, conferir ou admitir o deck; uma mesma coleção pode sustentar várias listas. A quantidade administrativa máxima da coleção não muda o limite de duas cópias de gameplay. Leituras consistentes são necessárias: uma validação feita em cache ou uma lista de propriedade enviada pelo frontend não serve para admissão.

### Adaptação confiável para o catálogo ativo

**APROVADO por Emanuel em 17/10/2026.** `validateGameplayDeck` continua exigindo igualdade entre `GameplayDeckList.contentVersion` e o catálogo recebido. Essa garantia permanece no validador puro; a infraestrutura adapta a intenção persistida antes de chamá-lo, sem reescrever o documento salvo:

| Dado | Intenção persistida | Composição transitória para `validateGameplayDeck` |
| --- | --- | --- |
| `rulesVersion` | Versão de regras da composição | Mesma versão salva, sujeita à validação de suporte/compatibilidade; não atualizar regras automaticamente |
| `contentVersion` | Proveniência histórica | `catalog.contentVersion`, obtido da versão ativa pela infraestrutura confiável |
| `entries` | Referências explícitas `{cardId, revision, quantity}` | Cópia independente das mesmas referências, sem trocar identidade, revisão ou quantidade |
| Nome, datas, `version` e demais metadados | Envelope pessoal | Não entram em `GameplayDeckList` nem substituem validação de gameplay |

Primeiro validar o envelope persistido e a projeção original de composição; só depois criar a cópia transitória. Não apagar campos forjados de um payload e tratá-lo como documento confiável. A adaptação escolhe **o catálogo contra o qual conferir as mesmas escolhas**, não uma nova mecânica para essas escolhas. O contexto `owned`, o catálogo realmente ativo, publicação atual e propriedade são derivados pelo backend; nenhum deles vem como autoridade do cliente.

O validador resolve os perfis no catálogo ativo e recusa identidades ausentes, revisões diferentes ou entradas inelegíveis, além das regras de tamanho/cópias/posse. Não buscar a revisão nova para substituir a salva, não retirar entradas problemáticas para fazer o deck passar e não relaxar `validateGameplayDeck`. O catálogo ativo mantém uma única revisão canônica por identidade, conforme o contrato existente; esta revisão não acrescenta suporte a várias revisões da mesma identidade no mesmo catálogo.

Se passar, o resultado canônico usa a versão de conteúdo ativa da conferência e as mesmas identidades/revisões/quantidades. A proveniência histórica do deck pessoal pode ser registrada separadamente para auditoria, sem alterar `contentVersion`, `version`, datas ou entradas do documento pessoal. Conferência/admissão não é uma operação de salvamento ou migração. O backend não precisa carregar o catálogo histórico para admitir referências que possam ser verificadas integralmente no catálogo ativo.

Exemplo aprovado: deck salvo em `v1`, catálogo ativo `v2` apenas adicionou cartas e preservou todos os pares usados; com tamanho, publicação e posse válidos, o deck pode passar sem nenhuma edição. Se `v2` remover um par, torná-lo inelegível ou exigir outra revisão, a lista fica salva com diagnóstico de reparo e a admissão é recusada até alteração explícita do jogador. Mesmo quando as versões são iguais, falta de posse, publicação, tamanho ou elegibilidade ainda pode impedir a admissão. Igualdade ou diferença de `contentVersion`, isoladamente, não decide a validade.

## Mudanças posteriores nas cartas e no conteúdo

**APROVADO — 17/10/2026.** Não apagar ou atualizar decks pessoais automaticamente por uma mudança de catálogo/coleção. O jogador pode abrir, renomear, excluir ou reparar a intenção salva; a interface futura deve distinguir indisponibilidade de ausência do deck.

| Mudança | Deck salvo | Nova admissão pessoal | Partida já iniciada |
| --- | --- | --- | --- |
| Carta vira draft/archived, é despublicada ou excluída | Referência e lista permanecem; sem expor dados/PNG agora protegidos | Recusada enquanto a referência depender de carta não publicada/existente | Conserva perfis e composição fixados no snapshot |
| Quantidade possuída diminui ou entrada é removida | Lista permanece | Revalidar; recusar se faltar quantidade | Não consultar nem reescrever o inventário da partida |
| Somente arte/nome/apresentação muda | Lista continua apontando para a mesma identidade/revisão mecânica | Mecânica não é inferida da nova apresentação | Estado mecânico permanece fixado; política visual de partida não é implementada aqui |
| Novo conjunto apenas adiciona cartas ou preserva todos os pares usados pelo deck | Proveniência e referências permanecem | Conferir contra o ativo; admitir se os demais requisitos forem atendidos, sem migração obrigatória | Usa a versão e os perfis originais |
| Um par usado é removido, substituído, fica inelegível ou exige outra revisão no ativo | Lista permanece com diagnóstico de reparo | Recusar até alteração explícita do jogador; nunca substituir uma revisão por outra automaticamente | Usa a versão e os perfis originais |
| Configuração ou catálogo obrigatório fica inválido/ausente | Leitura da intenção pessoal continua possível | Falhar sem fallback permissivo | Não substituir o snapshot por conteúdo vivo |

Sem catálogo histórico disponível, leitura, renomeação e exclusão do deck continuam possíveis: renomeação valida apenas nome/envelope/versão e preserva integralmente as referências. Edição da composição ou duplicação exige resolver as referências no catálogo indicado e falha se ele estiver indisponível. Uma reparação explícita pode submeter uma nova composição reconhecida na versão ativa, sem exigir reinterpretar o perfil histórico ausente; não é atualização silenciosa.

A indisponibilidade do histórico não impede por si só a admissão: para ela, as referências são verificadas contra o catálogo ativo pela adaptação acima. Ausência ou invalidade **do catálogo ativo necessário à admissão** continua bloqueando essa operação sem fallback permissivo.

Reparo que altere referências mecânicas é uma edição explícita do deck, com comparação de `version`; não é necessário apenas porque a versão ativa mudou. O backend resolve as referências submetidas no conjunto de destino; identidades/revisões indisponíveis são apontadas, nunca substituídas por outras. O jogador confirma as referências/revisões escolhidas; uma edição pode conservar uma composição parcial, mas não afirma que ela esteja pronta para jogar.

## Treino e referência

As regras aprovadas permitem referências iguais e independentes da coleção, sem concessão ao inventário. **APROVADO — 17/10/2026:** guardar referências imutáveis no documento da versão canônica, separadas dos decks pessoais; elas não ocupam o limite de 20 decks do jogador.

O cliente escolhe apenas um `referenceId` permitido no fluxo de treino. O backend resolve esse ID na versão ativa e constrói `{kind: 'training-reference', catalog, referenceId, referenceDeck}`. O validador exige composição exatamente igual à referência confiável; não aceitar lista personalizada, `kind`, `bypassOwnership` ou boolean do cliente para dispensar propriedade. O conteúdo é o mesmo para ambos os participantes, conforme o design aprovado.

A referência não precisa de posse ou de um `Card` colecionável artificial. Despublicar uma carta de apresentação bloqueia a admissão pessoal, mas **não retira por si só uma referência didática explicitamente permitida**. Para retirar conteúdo também do treino, publicar/ativar uma versão de gameplay que não permita a referência ou suas cartas. O treino nunca obtém assets privados de uma carta despublicada como atalho. Essa separação entre publicação visual e permissão de treino foi aprovada no bloco 4 revisado.

## Operações, concorrência e falhas

**APROVADO — 17/10/2026.** Mutação explícita por serviço backend; sem autosave remoto presumido. Uma operação tem parser estrito, domínio testável e adapter próprio; componentes apenas orquestram serviços tipados. Os [pedidos puros](#contrato-puro-de-recurso-e-mutações), a [porta backend](#porta-backend-do-store-e-erros-de-domínio), os cinco domínios e o [adapter Firestore de decks isolado](#adapter-firestore-isolado) estão implementados. Adapter de catálogo e transporte continuam futuros.

| Operação | Comportamento recomendado |
| --- | --- |
| Criar | Escolher um UUID de destino uma vez por intenção, validá-lo e usá-lo apenas no caminho do titular. Backend exige ausência do destino, valida o rascunho, confere capacidade e grava versão 1 com as duas datas de servidor no mesmo commit. |
| Editar/renomear | Exigir `expectedVersion` igual à versão atual. Validar campos e, ao editar composição, suas referências; renomeação isolada preserva as referências sem exigir catálogo disponível. Preservar `createdAt`; incrementar versão e atualizar data somente em mudança efetiva. Um pedido sem mudança não cria revisão inútil. |
| Excluir | Exigir versão esperada e excluir o documento sem modificar coleção ou assets. Não requer que as cartas ainda sejam publicadas/elegíveis. Sem lixeira/histórico no v0.1; cópias fixadas em partidas futuras não dependem desse documento. |
| Duplicar | Descobre a origem em transação de leitura, valida o catálogo histórico entre callbacks e abre outra transação para reler origem/versão/draft, destino e capacidade. Copia intenção e referências, inclusive incompletas, preservando o nome; cria outro ID, versão 1 e novas datas confiáveis iguais. A origem permanece intacta. |

O UUID pode ser gerado pelo cliente como identificador de tentativa, sem conferir autoridade sobre titular ou cartas. Create-if-absent protege contra sobrescrita; não gerar outro ID automaticamente após resposta incerta. Se o destino já existe, reler/reconciliar, sem sobrescrever uma edição posterior. IDs não são reutilizados pelo aplicativo após exclusão.

Update/delete/duplicação com versão antiga retornam conflito e exigem releitura; sem last-write-wins, merge automático ou lock apenas em memória. Retries internos da transação repetem as leituras e a comparação com a mesma versão esperada, sem adotar a nova versão silenciosamente. Edição efetiva com versão esgotada falha sem reset; duplicar uma origem em `Number.MAX_SAFE_INTEGER` é permitido, pois não incrementa sua versão. Documento inválido continua sendo recusado.

Se o commit ocorrer e sua resposta se perder, reler o mesmo documento para conferir o estado antes de repetir. Um retry de edição pode devolver conflito após uma gravação bem-sucedida; uma exclusão pode devolver ausência. Não prometer CRUD exatamente uma vez ou idempotência histórica após exclusão sem recibos. **Não recomendar uma coleção de recibos permanente no v0.1**: reconciliação explícita cobre esse caso com menos infraestrutura, sem conceder valor de jogo.

### Limite de 20 sob concorrência

**APROVADO; IMPLEMENTADO E EXERCITADO NO EMULADOR; SEM PROVA FORMAL DE PRODUÇÃO.** O adapter consulta até 20 documentos da subcoleção **dentro da mesma transação server read-write** que verifica ausência e cria o destino; se já houver 20, o domínio recusa. Create/duplicate solicitam get/list/create, e o adapter executa a query real sem filtro de elegibilidade ou campos opcionais. Duplicate relê também a origem nessa transação. Edição não altera a contagem; exclusão libera capacidade após commit. Não consultar a quantidade fora da transação nem usar cache, aggregate externo, `deckCount` fornecido pelo cliente ou lock local.

O desenho se apoia no [isolamento serializável do Firestore](https://firebase.google.com/docs/firestore/transaction-data-contention#serializable_isolation) e no suporte a leitura de query pelo [SDK servidor em transação](https://cloud.google.com/nodejs/docs/reference/firestore/latest/firestore/transaction). A aprovação não substitui evidência de integração. O teste específico obrigatório é **19 decks + duas criações simultâneas para o mesmo usuário**, com destinos distintos e tentativas válidas: no cenário controlado, uma confirma, a outra é recusada pelo limite e restam 20; o resultado final **nunca pode deixar 21**.

Na execução de 29/10/2026 com Firestore Emulator **1.19.8**, cinco rodadas independentes de create/create e cinco de create/duplicate começaram com 19 documentos. Em todas as dez, uma chamada confirmou, a outra terminou com `PersonalDeckCapacityError` e a consulta direta final contou **20**. Não houve erro final de contenção/timeout nem estado final com 21. Algumas tentativas observaram ambas 19 e o retry perdedor releu 20; outras já serializaram as leituras em 19/20. O emulador registrou timeouts internos de locks recuperados pelos retries do SDK, sem serem confundidos com recusas por capacidade. A origem de duplicate permaneceu intacta. Cobertura e comandos estão no [contexto operacional](contexto-operacional-para-ias.md#validação-disponível).

Esse resultado é evidência local repetida, **não uma garantia formal de produção**. O [Firestore Emulator não reproduz integralmente o comportamento transacional de produção](https://firebase.google.com/docs/emulator-suite/connect_firestore#how_the_cloud_firestore_emulator_differs_from_production), inclusive contenção e duração de locks; não foi auditada configuração concorrente do banco remoto.

**Condição de parada determinada por Emanuel:** se esse mecanismo não puder garantir o hard cap nos testes de integração, parar antes de criar qualquer workaround e propor um documento de quota/counter controlado exclusivamente pelo backend. Não aumentar o limite, não aceitar 21 temporariamente e não introduzir contador ou documento auxiliar sem apresentar a revisão ao proprietário. O desenho atual evita essa estrutura adicional; não declara sua ausência como obrigação permanente nem como resultado já demonstrado.

Todas as leituras precedem os writes, incluindo perfil, destino, origem quando houver, catálogo e consulta de capacidade. Nos domínios create/update autorizados, o catálogo histórico imutável é resolvido/validado **antes de abrir a transação pessoal**; em duplicate, **entre a transação de descoberta e a de criação**, sem I/O de catálogo dentro de callbacks. A transação final de duplicate relê versão/draft da origem antes de consultar destino/capacidade. Isso não flexibiliza as leituras consistentes de política ativa, publicação e coleção exigidas na admissão futura de partida. Transações podem repetir o callback; não disparar eventos externos, notificações ou efeitos de UI de dentro dele. Essas propriedades seguem os [contratos oficiais de transações](https://firebase.google.com/docs/firestore/manage-data/transactions). O limite de documentos não protege por si só contra abuso de invocações; App Check/rate limiting não são capacidades já implementadas no código atual.

## Fronteira com o futuro Battle Engine

Esta fronteira está **APROVADA por Emanuel em 17/10/2026**, sem iniciar o próximo milestone. O núcleo puro recebe definições/quantidades validadas pelo backend; não lê Firestore, não interpreta UID enviado pelo jogador e não usa `name`, timestamps ou validade do deck pessoal como regra de combate.

Uma futura admissão deverá ler perfil, política ativa, composição, publicação e coleção em contexto transacional consistente e fixar a composição canônica e as versões na criação autoritativa da partida. Se houver mudança concorrente nos dados consultados, revalidar antes de confirmar a criação; não separar uma checagem antiga de uma gravação posterior que a trate como recibo. A operação concreta pertence ao milestone de integração de partidas.

Depois desse commit, o motor usa o snapshot fixado, IDs de instância e regras da partida. Alterar/excluir o deck salvo, reduzir a coleção ou despublicar uma carta não modifica uma partida iniciada. Uma referência opcional à origem do deck serviria somente para auditoria; não seria uma consulta viva para resolver ações. Informação oculta, embaralhamento, PRNG, transições e projeções permanecem sob os contratos e marcos próprios, sem implementação aqui.

## Critérios para um futuro incremento de implementação

Esta lista é planejamento **PENDENTE**, não autorização para executar nesta tarefa:

- Delimitar e obter autorização para cada próximo incremento; o primeiro helper puro abaixo foi autorizado e concluído, sem liberar implementação de toda a lista.
- Especificar e revisar o contrato de transporte dos pedidos/respostas e dos conflitos; manter UID, perfis, propriedade, elegibilidade e datas fora da autoridade do cliente.
- Preparar conteúdo canônico real e vínculos explícitos antes de habilitar decks pessoais jogáveis; não converter fixtures, Nyra ou StarterPack automaticamente.
- Testar rascunhos parciais versus validação completa, normalização/limites, campos indevidos, IDs/revisões forjados, coleção ausente/malformada e referências de treino exatas.
- Testar Rules de leitura própria, negação cruzada/anônima e todos os writes cliente negados; testar autorização do backend separadamente, inclusive conta admin e perfil revogado/inconsistente.
- Testar create/update/delete/duplicate concorrentes, inclusive o caso obrigatório 19 + duas criações sem nunca resultar em 21; obedecer à condição de parada antes de qualquer workaround. Cobrir versões antigas, confirmação perdida, conteúdo ativado em paralelo e inexistência de writes parciais.
- Executar checks de domínio, Rules, integração e frontend apenas quando seus caminhos forem implementados. Testar futura admissão/snapshot no respectivo marco, sem afirmar essa garantia só com testes de Deck Rules.

## DECISÕES QUE EMANUEL PRECISA APROVAR

**Resolvido: arquitetura APROVADA por Emanuel em 17/10/2026.** O título é conservado para manter links existentes. Emanuel aprovou os blocos 1, 2, 3 e 5 e aprovou o bloco 4 com a revisão obrigatória incorporada acima. As alternativas da tabela não foram adotadas. O registro não afirma implementação ou validação de runtime.

1. **Persistência e privacidade — APROVADO:** `users/{uid}/decks/{deckId}`, leitura somente do próprio titular, todo CRUD via backend e nenhuma exceção administrativa geral para decks pessoais.
2. **Intenção salva — APROVADO:** composições de 0–24 cartas reconhecidas, até duas cópias por identidade, inclusive sem posse/elegibilidade atuais; conferir legalidade e propriedade completas novamente antes de qualquer partida.
3. **Conteúdo canônico — APROVADO:** versões imutáveis novas em Firestore com ponteiro ativo confiável e `cardId` colecionável igual ao ID atual da carta/coleção, sem alterar seus schemas. Envelope de conteúdo de até 64 KiB para v0.1.
4. **Ciclo de vida e treino — APROVADO COM REVISÃO:** preservar as referências `{cardId, revision, quantity}` e validá-las contra o catálogo ativo, independentemente da igualdade da proveniência histórica. Adição compatível de conteúdo não exige migração. Referência ausente, revisão substituída ou inelegibilidade exige reparo explícito; nunca substituir revisão automaticamente. Publicação/posse atuais condicionam uso pessoal; referências de treino são permitidas pelo catálogo independentemente da coleção/publicação visual. Snapshots iniciados permanecem fixos.
5. **Limites e concorrência — APROVADO, COM EVIDÊNCIA LOCAL NO EMULADOR:** limites v0.1 revisáveis de 20 decks, nome até 80, envelope de deck até 16 KiB e conteúdo até 64 KiB; versão inteira, create-if-absent e reconciliação de respostas incertas. Os testes específicos de 19 + duas operações terminaram com 20 nas dez rodadas, sem prova formal de produção. Se falhar o mecanismo, parar e propor quota/counter exclusivamente backend antes de qualquer workaround.

A revisão obrigatória de Emanuel foi explícita:

> uma mudança de `contentVersion` ativa NÃO deve, por si só, tornar todos os decks antigos inválidos para novas partidas.

> Nunca substitua automaticamente uma revisão por outra.

Não há decisão de arquitetura aguardando aprovação nesses cinco blocos. Os incrementos receberam autorizações próprias, conforme as seções abaixo; a capacidade transacional possui evidência local no emulador, com a limitação de produção explicitada acima. A autorização não libera deploy, operação remota, implementação do marco inteiro ou avanço ao Battle Engine.

## Primeiro incremento técnico proposto

Status deste incremento: **IMPLEMENTADO E VALIDADO em 17/10/2026**, após autorização explícita de Emanuel para somente esse escopo. O título original da seção é conservado para os links existentes. O marco Deck Builder não está concluído.

### Objetivo

Foi implementado `validateGameplayDeckAgainstActiveCatalog(value, trustedContext)`, exportado por `shared/gameplay`. Recebe uma **projeção de composição salva** (`GameplayDeckList`, sem metadados Firestore) e contexto pessoal confiável, restrito nos tipos a `Extract<GameplayDeckValidationContext, {kind: 'owned'}>`. Valida a projeção original antes de construir uma cópia transitória; conserva suas entradas e `rulesVersion`, usa apenas a `contentVersion` do catálogo do contexto e retorna o `GameplayValidatedDeck` produzido por `validateGameplayDeck`, **sem modificá-lo**. Exige `owned` também em runtime; a exceção de treino permanece no fluxo separado existente.

Esse passo torna verificável a revisão aprovada sem integrar Firebase, criar persistência ou resolver o build compartilhado de Functions. O helper permanece no módulo puro compilado/testado isoladamente; não é autenticação, consulta de propriedade real, conferência de que o catálogo recebido é realmente o ativo ou recibo de admissão. Essas responsabilidades continuam na infraestrutura backend futura. A [API e seus limites](gameplay-contract.md#compatibilidade-pessoal-com-catálogo-ativo) são documentados no Gameplay Contract.

### Arquivos implementados

| Arquivo | Mudança realizada |
| --- | --- |
| [deck-compatibility.ts](../shared/gameplay/src/deck-compatibility.ts) | Helper fino de adaptação/compatibilidade pessoal, com validação do envelope original, contexto `owned` e cópia independente; sem regras de composição paralelas. |
| [index.ts](../shared/gameplay/src/index.ts) | Exportação da API do helper, sem novo contrato público de resultado. |
| [gameplay-deck-compatibility.test.mjs](../tests/gameplay/gameplay-deck-compatibility.test.mjs) | 20 testes de execução específicos, usando fixtures locais. |
| [deck-compatibility.typecheck.ts](../shared/gameplay/type-tests/deck-compatibility.typecheck.ts) | Casos positivos/negativos da API pessoal, referências completas e retorno sem autoridade de autenticação ou mutação de inventário. |

A documentação de API/evidências foi atualizada junto do incremento. `decks.ts`, manifests, dependências, tsconfigs e scripts permaneceram intactos: os padrões existentes de build/teste já incluem esses diretórios.

### Cobertura validada

- `v1 → v2` aditivo: mesmas identidades/revisões/quantidades continuam válidas, retorno canônico usa o catálogo ativo, e a entrada preserva a proveniência original.
- Remoção de identidade, revisão diferente ou inelegibilidade no ativo: recusar sem substituir referência ou atualizar o documento original.
- Versões iguais com composição inválida: continuar recusando; igualdade não concede validade.
- Tamanho, cópias, posse e formato continuam obrigatórios; regras incompatíveis, campos forjados e contextos de treino/mistos são recusados, inclusive quando forçados em runtime.
- Entrada, catálogo, propriedade e referências permanecem independentes e sem mutação; não produzir instâncias, concessões ou recibos de autorização.
- Chamada direta de `validateGameplayDeck` com versões divergentes continua falhando por `content-version`; não enfraquecer seu contrato para acomodar a adaptação.

`npm.cmd run test:gameplay` passou com **79/79 testes**, incluindo os 20 novos, build TypeScript e testes de tipos. A suíte original de 59 testes permaneceu aprovada; `validateGameplayDeck` e `training-reference` não foram alterados. Evidência datada no [contexto operacional](contexto-operacional-para-ias.md#validação-disponível). Angular, emuladores, Rules e Functions não foram executados porque o incremento permanece isolado. O teste concorrente de 20 decks pertence ao incremento futuro de persistência e continua obrigatório; este helper não fornece evidência para o hard cap.

### Fora do escopo desse primeiro incremento

Parser do documento Firestore e seus metadados, CRUD, transporte/Callables, adapters de persistência, leitura real de catálogo/coleção, provisionamento/ativação de conteúdo, UI, Rules, índices, quota/counter, teste transacional do cap, migração ou escrita de decks, integração/build de Functions, mudanças em `Card`/coleção/StarterPack, admissão real de partidas, Battle Engine, matchmaking, deploy e qualquer operação remota.

## Contrato puro de rascunhos pessoais

Status deste incremento: **IMPLEMENTADO E VALIDADO em 17/10/2026**, com autorização exclusiva para intenção pessoal, normalização, limites, exportação e testes. Não inclui metadados de persistência, documento Firestore ou mutações/concorrência.

`parsePersonalDeckDraft(value)` retorna `PersonalDeckDraft` com somente `{name, rulesVersion, contentVersion, entries}`. Reutiliza `GameplayDeckList`/`GameplayDeckEntry`; referências continuam `{cardId, revision, quantity}`. O nome recebe trim, é não vazio e tem até 80 unidades UTF-16, sem slug ou exigência de unicidade. Regras continuam `0.1`; conteúdo é somente proveniência sintaticamente válida, sem consulta ao catálogo ativo.

Aceita total agregado de 0–24 cartas e linhas de quantidade 1 ou 2; agrega a mesma identidade/revisão, recusa revisões conflitantes e terceira cópia sem truncar. Ordena por `cardId` lexical ASCII, sem associar à ordem da partida. Envelope e referências são estritos, rejeitando autoridade, flags de validade, treinamento e metadados de persistência; resultado e referências não compartilham estruturas com a entrada. Rejeições usam `GameplayContractError`, sem novo contrato público de erro.

`PERSONAL_DECK_LIMITS` exporta os limites revisáveis de v0.1 (20/80/24/2/16 KiB). Nome/composição são aplicados por este parser; quota por conta não é. O JSON compacto UTF-8 normalizado atual é conservadoramente menor que 8 KiB pelos limites dos campos, incluindo escapes do nome; por isso o teto futuro de 16 KiB permanece constante documentada, sem adicionar cálculo de bytes ou dependência Node/DOM ao domínio. Metadados futuros/documento completo e tamanho bruto de transporte não são medidos aqui.

Não exige nem valida catálogo, existência real da identidade, revisão canônica, publicação, ownership ou elegibilidade. Uma referência desconhecida pode passar sintaticamente e ainda ser recusada pela futura camada confiável. O rascunho não comprova autenticação, autorização ou aptidão para jogar. `validateGameplayDeck` e `validateGameplayDeckAgainstActiveCatalog` ficaram intactos e continuam exigindo composição completa para conferência/admissão, usando sua projeção sem `name`.

Arquivos implementados: [personal-decks.ts](../shared/gameplay/src/personal-decks.ts), exportações em [index.ts](../shared/gameplay/src/index.ts), [36 testes Node](../tests/gameplay/personal-deck-drafts.test.mjs) e [testes de tipos](../shared/gameplay/type-tests/personal-decks.typecheck.ts). API detalhada em [Gameplay Contract](gameplay-contract.md#intenção-parcial-de-deck-pessoal).

`npm.cmd run test:gameplay` passou com **115/115 testes**, incluindo os 79 anteriores e 36 novos, além do build e testes de tipos. Angular/Firebase/Functions/Rules não foram executados; o incremento permanece isolado e não fornece prova do cap transacional de 20 decks. Evidências no [contexto operacional](contexto-operacional-para-ias.md#validação-disponível).

## Contrato puro de recurso e mutações

Status deste incremento: **IMPLEMENTADO E VALIDADO em 17/10/2026**, após autorização de Emanuel para somente tipos, parsers puros, exportações, testes e documentação. A projeção `PersonalDeckResource` contém `{id, version, draft, createdAt, updatedAt}`. Não é o documento Firestore da seção de modelo: não altera seu `schemaVersion` ou campos achatados, não duplica UID e não implementa conversão do caminho ou de Timestamp. A conversão pertence ao [adapter isolado](#adapter-firestore-isolado); aqui só se confere uma projeção recebida, sem comprovar sua origem.

| Pedido | Contrato exato |
| --- | --- |
| `PersonalDeckCreateRequest` | `{deckId, draft}` |
| `PersonalDeckUpdateRequest` | `{deckId, expectedVersion, draft}` |
| `PersonalDeckRenameRequest` | `{deckId, expectedVersion, name}` |
| `PersonalDeckDeleteRequest` | `{deckId, expectedVersion}` |
| `PersonalDeckDuplicateRequest` | `{sourceDeckId, expectedSourceVersion, newDeckId}`; IDs distintos |

Cada tipo tem seu parser `parsePersonalDeck…` exportado em `shared/gameplay`. Todo payload com draft compõe `parsePersonalDeckDraft`, sem regras paralelas. Rename usa o mesmo helper privado de nome e não recebe composição: continua possível preparar o pedido sem catálogo histórico disponível. Duplicate não recebe nome adicional, lista ou metadados: o domínio lê a origem e preserva o nome, já que nomes repetidos são válidos, sem sufixo automático.

Datas são strings ISO UTC canônicas `YYYY-MM-DDTHH:mm:ss.sssZ`, anos 0001–9999, com validação de calendário e `createdAt <= updatedAt`. Não se retorna `Date`, não se lê relógio nem se certifica timestamp de servidor. A projeção adota milissegundos; conversão determinística de Timestamp é responsabilidade futura e não será usada para comparar concorrência.

`version` é inteiro seguro positivo da revisão do documento; é independente de `revision` da carta, `rulesVersion` e `contentVersion`. `expectedVersion`/`expectedSourceVersion` significam a versão lida pelo cliente, não a nova versão desejada. O parser apenas valida e preserva os números recebidos. Não atribui versão inicial, não incrementa o número, não compara com estado persistido e não detecta no-op/conflito. O valor máximo seguro passa estruturalmente; uma futura operação que precise incrementá-lo deverá falhar por esgotamento. Atomicidade dependerá de transação backend, ainda inexistente.

Recurso e pedidos são readonly nos tipos e independentes da entrada, com envelopes exatos e erros estruturais genéricos. Rejeitam UID/ownerUid, autoridade, catálogos e metadados fora da respectiva fronteira; resource não é recibo de autorização. IDs usam o boundary existente, sem geração ou exigência de formato UUID no parser. Os envelopes normalizados atuais continuam estruturalmente abaixo do teto v0.1 de 16 KiB; não se mede payload bruto nem armazenamento Firestore. Não há autenticação, catálogo/propriedade reais, quota de 20, CRUD, adapter, repository, Functions, Rules ou UI.

Fonte: [personal-decks.ts](../shared/gameplay/src/personal-decks.ts), [exportações](../shared/gameplay/src/index.ts), [testes de execução](../tests/gameplay/personal-deck-resources.test.mjs) e [de tipos](../shared/gameplay/type-tests/personal-deck-resources.typecheck.ts). Contrato detalhado em [Gameplay Contract](gameplay-contract.md#recurso-pessoal-e-pedidos-de-mutação); resultados no [contexto operacional](contexto-operacional-para-ias.md#validação-disponível). Deck Rules e o helper de compatibilidade não são alterados.

`npm.cmd run test:gameplay` passou com **145/145 testes**, incluindo os 115 anteriores e 30 novos, além do build TypeScript e testes de tipos. Suítes Angular/Firebase/Functions/Rules não foram executadas neste incremento isolado. Isso não comprova transações ou o hard cap de 20 decks; o teste concorrente obrigatório continua pendente.

## Porta backend do store e erros de domínio

Status deste incremento: **IMPLEMENTADO E VALIDADO em 17/10/2026**, após autorização exclusiva para interfaces/tipos backend, erros puros, testes e documentação. Fonte: [personal-deck-store.ts](../functions/src/decks/personal-deck-store.ts) e [personal-deck-errors.ts](../functions/src/decks/personal-deck-errors.ts). Nada foi acrescentado ao módulo compartilhado: a porta fica no backend e reutiliza `PersonalDeckResource`, sem segundo schema ou tipos Firebase.

| Interface/tipo | Contrato |
| --- | --- |
| `PersonalDeckStore` | `runTransaction<T>(uid, action): Promise<T>`; UID confiável vincula toda a unidade ao mesmo titular. Não há leitura ou write direto fora do callback. |
| `PersonalDeckStoreTransaction` | `get(deckId)` retorna recurso ou `null`; `list(limit)` retorna recursos readonly; `create(resource)`, `replace(resource)` e `delete(deckId)` enfileiram operações distintas. |
| `PersonalDeckReadLimit` | Derivado de `typeof PERSONAL_DECK_LIMITS.maxDecks`, atualmente 20; parâmetro obrigatório da lista, sem opção ilimitada ou paginação antecipada. |

O UID é argumento backend, previamente derivado de autenticação/autorização; não integra draft, recurso, request ou documento. A porta não autentica esse argumento. O [adapter isolado](#adapter-firestore-isolado) mantém o escopo do titular, traduz dados persistidos para a projeção existente e recusa documentos malformados, sem ocultá-los de uma lista/contagem de capacidade.

`create` significa create-if-absent: destino existente deve falhar, inclusive no commit, sem overwrite ou geração de outro ID. `replace` exige recurso previamente lido como existente e substitui sua representação completa, sem criar ou fazer merge. `delete` recebe somente ID previamente lido como existente, sem transformar ausência em sucesso. As precondições são obrigações do domínio/adapter; a interface sozinha não as executa.

Todas as leituras `get/list` devem ocorrer antes dos writes no callback. Delete/rename/update comparam a versão esperada; rename/update decidem incremento, timestamps e no-op. Create lê destino e `list(PERSONAL_DECK_LIMITS.maxDecks)` na mesma unidade antes de decidir capacidade e enfileirar `create`; duplicate relê primeiro a origem e compara versão/draft descobertos. A lista devolve no máximo o limite, ou todos os recursos se houver menos, sem filtrar por composição ou elegibilidade. O adapter confirma todas as escritas atomicamente, aborta todas em falha e pode repetir o callback em contenção; callbacks não podem produzir efeitos externos. Os doubles exercitam decisões de domínio; a [integração no emulador](#adapter-firestore-isolado) exercita a persistência real. A condição de parada aprovada permanece, sem extrapolar a evidência local para prova formal de produção.

| Erro | Código estável |
| --- | --- |
| `PersonalDeckConflictError` | `personal-deck-conflict` |
| `PersonalDeckNotFoundError` | `personal-deck-not-found` |
| `PersonalDeckAlreadyExistsError` | `personal-deck-already-exists` |
| `PersonalDeckCapacityError` | `personal-deck-capacity-exceeded` |
| `PersonalDeckVersionExhaustedError` | `personal-deck-version-exhausted` |
| `PersonalDeckClockError` | `personal-deck-invalid-time` |
| `PersonalDeckContentError` | `personal-deck-content` |
| `PersonalDeckContentUnavailableError` | `personal-deck-content-unavailable` |

Todos derivam de `PersonalDeckDomainError`, com união `PersonalDeckDomainErrorCode` e mensagem genérica. Os construtores não recebem argumentos, exceto `PersonalDeckContentError`, que recebe apenas o motivo estável descrito na [validação histórica](#validação-pura-de-referências-históricas). Não recebem UID, recurso, versões atuais/esperadas, coleção, paths ou causa como propriedades de contexto. **A stack nativa é preservada para diagnóstico interno**, conforme correção explícita de Emanuel no incremento de delete; ela não será parte do payload público, cujo mapper ainda não foi implementado. São distintos de `GameplayContractError`; não há códigos HTTP/Callable ou tradução de exceção Firebase. Capacidade é uma decisão do domínio create a partir da leitura limitada, não uma falha técnica do banco; a classe de erro não replica o limite. Ausência de catálogo histórico tem erro próprio, distinto de ausência do deck pessoal.

A porta permanece dependente **somente de tipos**, encaminhados por [gameplay.d.ts](../functions/src/gameplay.d.ts) às declarações geradas de `shared/gameplay`. O domínio de delete reutiliza o parser em runtime pelo módulo copiado para dentro do artefato Functions, conforme a seção seguinte. Os scripts em [functions/package.json](../functions/package.json) preparam esse build antes de compilar/testar Functions, preservando `rootDir: src`, `lib/index.js`, dependências e entrypoints. O predeploy local existente continua compilando o pacote; `gcp-build` vazio usa o JavaScript pré-compilado. Procedimento e limite dessa validação no [contexto operacional](contexto-operacional-para-ias.md#comandos-de-validação); isso não comprova deploy ou funcionamento remoto.

Validação original da porta: `test:gameplay` **145/145**, `test:functions` **74/74** (67 anteriores + sete novos), testes de tipos backend e `build:functions`, todos exit 0. [Testes de erros](../functions/tests/personal-deck-store.test.ts) cobrem taxonomia/contexto mínimo e agora preservação de stack interna; [testes de tipos](../functions/tests/personal-deck-store.typecheck.ts) verificam recurso, UID externo, limite derivado e operações no mesmo callback. A porta não implementa store fake ou concorrência; os doubles ficam nos testes dos domínios. Angular, Rules e emuladores não foram executados nessa etapa.

O estado presente das capacidades está no [quadro consolidado](#validação-pura-de-referências-históricas). A porta foi implementada antes da persistência; o [adapter Firestore isolado](#adapter-firestore-isolado) acrescenta transações reais e evidência concorrente no emulador, sem transporte, Rules/UI de decks ou deploy.

## Operação de domínio de exclusão

Status deste incremento: **IMPLEMENTADO E VALIDADO em 17/10/2026**, após autorização de Emanuel para somente delete e correção da preservação de stack, sem create/update/rename/duplicate ou persistência real. Fonte: [delete-personal-deck.ts](../functions/src/decks/delete-personal-deck.ts).

`deletePersonalDeck(uid: string, request: unknown, store: PersonalDeckStore): Promise<void>` recebe UID já confiável do backend e payload desconhecido separado. Não autentica esse UID nem deriva paths; a futura camada de transporte continua responsável por autenticação/autorização. O retorno não contém recurso, confirmação com dados ou receipt.

1. `parsePersonalDeckDeleteRequest` valida estritamente `{deckId, expectedVersion}` antes de iniciar a transação.
2. `store.runTransaction(uid, callback)` usa exatamente o UID recebido.
3. Dentro do mesmo callback, `get(deckId)` retorna recurso ou ausência.
4. Ausência lança `PersonalDeckNotFoundError`; versão diferente lança `PersonalDeckConflictError`.
5. Apenas na igualdade estrita de versão ocorre `transaction.delete(deckId)`; a operação aguarda a conclusão de `runTransaction`.

`expectedVersion` é a versão observada pelo cliente, sem incremento, fallback para a atual ou force delete. Um recurso com draft incompleto pode ser excluído: não se consultam catálogo, cartas, publicação, elegibilidade, posse, lista ou capacidade. Não há create/replace, relógio, logs de negócio, notificações ou outros efeitos no callback. Request e recurso lido permanecem intactos; falhas de abertura, leitura, enfileiramento ou conclusão do store propagam sem conversão silenciosa. Repetir a chamada após exclusão bem-sucedida pode resultar em not-found; não há promessa de exactly-once.

O módulo compartilhado é reutilizado sem duplicar parser: [gameplay.d.ts](../functions/src/gameplay.d.ts) encaminha declarações e [copy-gameplay.cjs](../functions/scripts/copy-gameplay.cjs) copia o build compartilhado para `functions/lib/gameplay` em produção e `functions/lib-test/src/gameplay` em testes. O domínio importa `../gameplay`; seu runtime fica inteiro no artefato local, sem dependência de caminho fora de `functions/`. Não há mudança de dependências, configs TypeScript, `main`, config Firebase ou entrypoints. Nenhuma Function nova é exposta.

Os [testes de delete](../functions/tests/delete-personal-deck.test.ts) usam store em memória somente no harness; os [testes de tipos](../functions/tests/delete-personal-deck.typecheck.ts) mantêm UID separado, store injetado e retorno void. Isso verifica o fluxo do domínio; não certifica isolamento/atomicidade de Firestore, Rules, autorização autenticada ou exclusão real. Stack preservada continua exclusivamente para diagnóstico interno; não foi criado serializer público ou mapper HTTP/HttpsError.

Validação: **145/145 gameplay**, **88/88 backend** (74 anteriores + 14 novos testes de delete), incluindo testes de tipos, e `build:functions`, todos exit 0. A cópia do artefato `lib` também foi carregada isoladamente, executando parser/delete sem carregar módulos fora dela. Evidências no [contexto operacional](contexto-operacional-para-ias.md#validação-disponível). Angular, Rules e emuladores não foram executados; o hard cap e sua prova concorrente continuam pendentes.

As capacidades presentes estão no [quadro consolidado](#validação-pura-de-referências-históricas); a evidência original acima se restringe ao incremento de delete.

## Operação de domínio de renomeação

Status deste incremento: **IMPLEMENTADO E VALIDADO em 17/10/2026**, após autorização de Emanuel para somente rename, porta de tempo e erros necessários; sem create/update/duplicate, adapter ou transporte. Fontes: [rename-personal-deck.ts](../functions/src/decks/rename-personal-deck.ts) e [personal-deck-clock.ts](../functions/src/decks/personal-deck-clock.ts).

`renamePersonalDeck(uid: string, request: unknown, store: PersonalDeckStore, clock: PersonalDeckClock): Promise<PersonalDeckResource>` recebe UID e clock confiáveis do backend. O cliente escolhe somente `{deckId, expectedVersion, name}`, validado primeiro por `parsePersonalDeckRenameRequest`, antes de iniciar transação ou consultar tempo. Nenhuma autenticação ou nova Callable foi implementada.

No mesmo callback de `runTransaction(uid)`, a operação lê o recurso e distingue ausência (`PersonalDeckNotFoundError`) de versão observada diferente (`PersonalDeckConflictError`). Só depois compara o nome normalizado com o atual. Igualdade é no-op: retorna cópia independente, sem `replace`, incremento, alteração de data ou leitura do clock. No-op não contorna conflito e é permitido mesmo quando a versão já é `Number.MAX_SAFE_INTEGER`.

Uma mudança efetiva preserva ID, `createdAt`, regras, proveniência, referências, revisões, quantidades e ordem canônica; altera somente `draft.name`, `version + 1` e `updatedAt`. Usa apenas `replace`, nunca list/create/delete. A porta exige recursos previamente validados e normalizados por `parsePersonalDeckResource`; o mesmo parser valida e copia o candidato, sem catálogo, propriedade ou migração mecânica. Resultado, recurso original e objeto enfileirado para persistência ficam independentes, inclusive em no-op.

`PersonalDeckClock` oferece somente `now(): string`: ISO UTC canônico com milissegundos, anos 0001–9999, sem `Date.now()` ou Firebase no domínio. A leitura é lazy, somente depois de detectar mudança e descartar esgotamento. Uma chamada lógica obtém o tempo no máximo uma vez e reutiliza o valor em todos os replays. Cada tentativa relê o recurso, compara novamente `expectedVersion` e calcula a partir dessa leitura, sem mutar estado de tentativa anterior ou adotar versão nova silenciosamente.

O candidato precisa satisfazer `createdAt <= updatedAt` pelo parser e `updatedAt novo >= updatedAt armazenado`. Igualdade temporal é permitida. Se o tempo memoizado regredir em relação ao recurso de um replay, falha; não recalibra o relógio, não usa `max(old, now)` e não ajusta data silenciosamente. Falha/valor inválido do clock ou regressão lançam `PersonalDeckClockError`, uma falha backend distinta de payload inválido do cliente. Em mudança efetiva, versão máxima lança `PersonalDeckVersionExhaustedError`, sem overflow ou reset. Os novos erros mantêm código estável, mensagem genérica, stack interna e nenhum contexto sensível; não há mapper HTTP/HttpsError.

Falhas de abertura, get, replace ou conclusão do store propagam sem conversão. Não há logs de negócio, notificações ou serviços externos no callback. Clock e store usados pelos [testes de rename](../functions/tests/rename-personal-deck.test.ts) são doubles locais determinísticos; os [testes de tipos](../functions/tests/rename-personal-deck.typecheck.ts) verificam assinatura, dependências, resultado e erros. Isso não comprova atomicidade de Firestore ou persistência real.

Validação: **145/145 gameplay**, **119/119 backend** (88 anteriores + 29 de rename + dois dos novos erros), testes de tipos e `build:functions`, todos exit 0. Cobertura inclui no-op com versão máxima, esgotamento real, limites/calendário do clock, regressão em replay, ausência de alias com o write e propagação de falhas do store. Logs no [contexto operacional](contexto-operacional-para-ias.md#validação-disponível). Angular, Rules e emuladores não foram executados; o hard cap e sua prova concorrente continuam pendentes.

## Porta backend de leitura de catálogo versionado

Status deste incremento: **IMPLEMENTADO E VALIDADO em 17/10/2026**, após autorização de Emanuel para somente a interface backend de leitura por versão explícita. Fonte: [personal-deck-catalog.ts](../functions/src/decks/personal-deck-catalog.ts).

`PersonalDeckCatalogReader` oferece somente `get(contentVersion: string): Promise<GameplayDeckCatalog | null>`. Reutiliza diretamente `GameplayDeckCatalog` de `shared/gameplay`, por importação apenas de tipos, sem segundo schema, parser, erro ou implementação de leitura. O catálogo é global e não recebe UID, draft completo ou contexto pessoal; autenticação/autorização pertence à integração/endpoint confiável, ainda não implementado.

`null` significa exclusivamente catálogo inexistente. Catálogo presente malformado, versão divergente da solicitada ou falha de infraestrutura deve rejeitar a Promise; não pode ser ocultado como ausência. A validação profunda do documento `gameplayContentVersions/{contentVersion}` e sua projeção são implementadas pelo [adapter histórico](#adapter-firestore-de-catálogo-histórico). A porta não define exceção própria de ausência; create/update/duplicate convertem null em `PersonalDeckContentUnavailableError`.

A projeção retorna o contrato readonly já existente, incluindo cards, definições e efeitos; isso não congela objetos em runtime nem comprova a fidelidade de um adapter. A porta não verifica tamanho do deck, posse, publicação/status de `Card` ou elegibilidade adicional: preserva o valor `eligible` presente no catálogo. Não altera revisões, não migra proveniência, não filtra por jogador e não decide admissão de partida.

Não há active config, fallback para catálogo ativo, writes, ativação ou provisionamento. A porta é consumida pelos domínios create/update antes da transação pessoal e por duplicate entre suas duas fases; delete/rename permanecem sem consulta de catálogo. Há reader Firestore isolado, sem conteúdo remoto provisionado, `gameplayConfig/active`, Callable, Rules ou UI.

[Testes de tipos](../functions/tests/personal-deck-catalog.typecheck.ts) verificam assinatura exata, retorno compartilhado ou null, versão explícita, ausência de UID/draft/contexto pessoal/write/ativação e readonly aninhado. Não foi criado banco fake, teste de leitura real ou novo teste de execução. `test:gameplay` **145/145**, backend **119/119**, testes de tipos e `build:functions` passaram, exit 0; as contagens de execução ficaram inalteradas. Evidências no [contexto operacional](contexto-operacional-para-ias.md#validação-disponível). Sem alteração de runtime, dependências, configuração, dados remotos ou deploy.

## Validação pura de referências históricas

Status deste incremento: **IMPLEMENTADO E VALIDADO em 17/10/2026**, com autorização de Emanuel exclusivamente para o helper puro, testes e documentação. Fonte: [validate-personal-deck-references.ts](../functions/src/decks/validate-personal-deck-references.ts).

```ts
validatePersonalDeckDraftReferences(
  value: unknown,
  trustedCatalog: GameplayDeckCatalog,
): PersonalDeckDraft
```

O helper recebe o catálogo histórico confiável já resolvido. Primeiro chama `parsePersonalDeckDraft`, reutilizando integralmente nome, identifiers, limites, agregação e ordem canônica; aceita rascunhos de 0–24 cartas. Em seguida usa `parseGameplayDeckCatalog`: o parser profundo já existente em `decks.ts` foi apenas renomeado/exportado no mesmo arquivo e no barrel, sem mover ou duplicar regras. Seu corpo e a validação de Deck Rules permanecem iguais. Ambos os parsers exigem `rulesVersion: '0.1'`; regras incompatíveis, draft inválido e corrupção do catálogo geram `GameplayContractError`. O catálogo inteiro é conferido, inclusive cartas não usadas e identidades duplicadas, antes de diagnosticar referências.

Com os contratos estruturais satisfeitos, exige igualdade exata entre `draft.contentVersion` e a versão histórica recebida, existência de cada `cardId` e igualdade exata de sua revisão canônica. `PersonalDeckContentError`, em [personal-deck-errors.ts](../functions/src/decks/personal-deck-errors.ts), distingue `content-version`, `unknown-card` e `revision`, com código `personal-deck-content`, mensagem genérica e somente o motivo como contexto adicional. Não inclui carta, revisão, catálogo, deck, UID ou causa; conserva a stack interna nativa.

**`eligible: false` não rejeita uma referência reconhecida nesse nível de persistência.** O helper não recebe UID, ownership ou contexto de treino, não verifica publicação/status de `Card`, preview ou assets. Retorna somente o `PersonalDeckDraft` normalizado e detached, sem flags de validade ou autoridade de partida. Não substitui cartas/revisões, altera quantidades ou migra proveniência. A futura admissão continua exigindo composição completa, elegibilidade e propriedade/contexto confiáveis pelos fluxos próprios.

Não há adaptação para catálogo ativo aqui: `v1` salvo exige catálogo histórico `v1`. A compatibilidade de `v1` salvo com ativo `v2` continua pertencendo exclusivamente a `validateGameplayDeckAgainstActiveCatalog`, que permanece inalterado. `validateGameplayDeck` continua exigindo 24 cartas e suas condições originais. O helper não chama esses validadores, não consome `PersonalDeckCatalogReader` e não faz I/O. O adapter futuro continua obrigado a rejeitar conteúdo corrompido; a validação defensiva pura não implementa essa leitura nem prova sua origem.

Cobertura em [31 testes de execução](../functions/tests/validate-personal-deck-references.test.ts) e [testes de tipos](../functions/tests/validate-personal-deck-references.typecheck.ts): drafts vazios/parciais/completos, identidade/revisão/versão, inelegibilidade aceita, normalização delegada, frozen/detached, corrupção do catálogo, privacidade dos erros e regressão dos validadores de partida. `test:gameplay` **145/145**, backend **150/150**, testes de tipos e `build:functions` passaram, exit 0. Evidências no [contexto operacional](contexto-operacional-para-ias.md#validação-disponível); Angular, Rules e emuladores não foram executados, pois esses caminhos não mudaram.

| Capacidade de Deck Builder | Estado real |
| --- | --- |
| Store contract | ✅ |
| Delete domain | ✅ |
| Rename domain | ✅ |
| Canonical catalog read port | ✅ Interface, sem reader concreto |
| Historical draft reference check | ✅ Helper puro |
| Update domain | ✅ Domínio com portas injetadas |
| Create domain | ✅ Domínio com portas injetadas |
| Duplicate domain | ✅ Domínio com duas fases transacionais e portas injetadas |
| Firestore deck adapter | ✅ Isolado, sem transporte |
| Firestore catalog adapter | ❌ |
| Capacidade concorrente no emulador | ✅ Dez rodadas 19 → 20; sem prova formal de produção |
| Callables de decks | ❌ |
| Rules de decks | ❌ |
| UI | ❌ |

O estado atual completo está no quadro acima; as operações update/create/duplicate foram autorizadas em incrementos próprios, descritos abaixo. O helper histórico permanece puro e separado do reader.

## Operação de domínio de atualização

Status deste incremento: **IMPLEMENTADO E VALIDADO em 17/10/2026**, com autorização de Emanuel exclusivamente para UPDATE, erro mínimo de catálogo indisponível, testes e documentação. Fonte: [update-personal-deck.ts](../functions/src/decks/update-personal-deck.ts).

```ts
updatePersonalDeck(
  uid: string,
  request: unknown,
  store: PersonalDeckStore,
  catalogReader: PersonalDeckCatalogReader,
  clock: PersonalDeckClock,
): Promise<PersonalDeckResource>
```

O UID e as portas são dependências confiáveis do backend; a operação não autentica nem autoriza esse argumento por conta própria. A sequência é estrita:

1. `parsePersonalDeckUpdateRequest(request)` valida e normaliza antes de reader, store ou clock.
2. `catalogReader.get(draft.contentVersion)` resolve uma vez a versão histórica explícita. `null` gera `PersonalDeckContentUnavailableError`, sem abrir transação; falhas do reader propagam intactas.
3. `validatePersonalDeckDraftReferences` valida o draft contra esse catálogo antes da transação, sem duplicar regras ou usar `validateGameplayDeck`.
4. `store.runTransaction(uid)` faz get do destino, distingue ausência, compara `expectedVersion` e só então decide no-op ou substituição.

Resolver conteúdo antes do callback é compatível com o contrato imutável por versão e foi explicitamente autorizado. Replays não repetem a leitura de catálogo nem fazem I/O externo dentro da transação. O store continua obrigado a devolver recursos estruturalmente validados e normalizados. Dentro do callback, a operação usa somente get e, se necessário, replace; não consulta list, create, delete, capacidade, coleção ou `Card`.

O no-op compara explicitamente `name`, `rulesVersion`, `contentVersion` e entradas canônicas por `cardId/revision/quantity`. Linhas repetidas e ordem bruta do request já foram normalizadas pelo parser. Igualdade retorna cópia independente do recurso atual, sem version + 1, alteração de data, clock ou replace. Mesmo em no-op, request, catálogo, referências, existência e versão esperada precisam passar; não há bypass de conteúdo ou conflito.

Uma alteração efetiva substitui o draft completo solicitado, preserva `id` e `createdAt`, calcula `stored.version + 1` e usa tempo confiável. Alterar explicitamente `contentVersion` ou uma revisão é permitido quando o request inteiro é reconhecido pelo catálogo solicitado; não há migração automática. Draft vazio/parcial/completo e carta com `eligible: false` podem ser salvos nesse nível. Não há conferência de ownership, publicação, aptidão para batalha ou catálogo ativo.

A política de clock é a mesma do rename: consulta lazy, no máximo uma vez por chamada lógica, depois das validações, conflito, no-op e esgotamento. Versão máxima com mudança gera `PersonalDeckVersionExhaustedError`; no-op na máxima continua permitido. Timestamp é validado pelo parser de recurso e deve respeitar `createdAt <= newUpdatedAt` e `newUpdatedAt >= stored.updatedAt`; igualdade temporal é permitida. Falha/tempo inválido ou regressivo gera `PersonalDeckClockError`, sem clamp ou reajuste.

Cada replay relê o recurso, verifica novamente a versão esperada e recalcula a partir dessa leitura, reutilizando o instante já obtido. Não incrementa um candidato anterior nem avança clock para acomodar contenção. Se a nova tentativa observar outra versão, falha com conflito; se observar o mesmo draft solicitado, retorna no-op. O adapter futuro deve descartar writes de tentativas abortadas; os doubles locais só exercitam o contrato, sem comprovar transações reais.

O candidato é validado/copiado por `parsePersonalDeckResource`, e uma segunda cópia separa o retorno do objeto enfileirado em replace. Request, recurso original, draft de trabalho, write e resultado não compartilham estruturas mutáveis perigosas. Falhas do store propagam intactas. Erros existentes permanecem distintos: `GameplayContractError`, `PersonalDeckContentError`, `PersonalDeckNotFoundError`, `PersonalDeckConflictError`, `PersonalDeckVersionExhaustedError` e `PersonalDeckClockError`. O novo `PersonalDeckContentUnavailableError` tem código `personal-deck-content-unavailable`, mensagem genérica, stack interna e nenhum identificador, versão, path ou causa anexados.

Cobertura em [55 testes runtime](../functions/tests/update-personal-deck.test.ts) e [testes de tipos](../functions/tests/update-personal-deck.typecheck.ts): ordem de I/O, normalização, catálogo/referências, 0–24 e inelegibilidade, no-op, edições explícitas, versões/clock, falhas, frozen/aliases e replays sobre a segunda leitura. `test:gameplay` **145/145**, backend **205/205**, testes de tipos e `build:functions` passaram, exit 0; evidências no [contexto operacional](contexto-operacional-para-ias.md#validação-disponível). Angular, Rules e emuladores não foram executados, pois esses caminhos não mudaram. Sem dependências/build novos, adapter, catálogo real, active config, Firebase, Callable/mapper, Rules, Angular/UI, Battle Engine, deploy ou alteração remota.

## Operação de domínio de criação

Status deste incremento: **IMPLEMENTADO E VALIDADO em 17/10/2026**, com autorização de Emanuel exclusivamente para CREATE, testes e documentação. Fonte: [create-personal-deck.ts](../functions/src/decks/create-personal-deck.ts).

```ts
createPersonalDeck(
  uid: string,
  request: unknown,
  store: PersonalDeckStore,
  catalogReader: PersonalDeckCatalogReader,
  clock: PersonalDeckClock,
): Promise<PersonalDeckResource>
```

O UID e as portas são dependências confiáveis, sem autenticação/autorização integrada. `parsePersonalDeckCreateRequest` valida `{deckId, draft}` antes de qualquer I/O, recusando UID, versão, expectedVersion, datas, flags ou campos extras. O reader resolve uma única vez `draft.contentVersion`, fora da transação; null gera `PersonalDeckContentUnavailableError`. Em seguida o helper histórico existente reconhece as referências, sem lookup paralelo ou migração. Drafts vazios/parciais/completos e `eligible: false` são permitidos; não há consulta de propriedade, publicação, catálogo ativo ou aptidão para batalha.

Cada tentativa transacional executa **get → list limitada → create**. Destino já existente gera `PersonalDeckAlreadyExistsError` antes de list/clock; não vira no-op, não gera outro ID e não sobrescreve. Se ausente, consulta `list(PERSONAL_DECK_LIMITS.maxDecks)` e recusa `resources.length >= PERSONAL_DECK_LIMITS.maxDecks` com `PersonalDeckCapacityError`, sem clock/create. Não duplica o limite em constante local, filtra decks incompletos/inelegíveis ou aceita capacidade fornecida pelo cliente. Todas as leituras do store precedem a escrita.

Depois das pré-condições, obtém no máximo um instante confiável por chamada lógica. Valida o candidato com `parsePersonalDeckResource`, fixa `id` exatamente no destino solicitado, `version: 1` e `createdAt === updatedAt === instante confiável`. Clock inválido ou que lança gera `PersonalDeckClockError`, sem `Date.now`, ajuste silencioso ou fallback. Copia novamente o recurso antes de enfileirar exclusivamente `transaction.create`; request, draft, write e retorno ficam independentes. Não há replace, delete, upsert, merge ou expectedVersion.

Replay relê destino e capacidade, reutiliza o instante já obtido e reconstrói um novo candidato de versão 1. Se a capacidade passar de 19 para 20, recusa com Capacity; se o destino aparecer, recusa com AlreadyExists sem nova listagem/clock. Writes de tentativas descartadas não são commits; o adapter futuro deverá preservar create-if-absent também no commit. Reader/store falham sem conversões arbitrárias. São reutilizados os erros de contrato, conteúdo indisponível/incompatível, destino existente, capacidade e clock; não foi criada classe nova nem usado `PersonalDeckConflictError` no fluxo de create.

Cobertura em [48 testes runtime](../functions/tests/create-personal-deck.test.ts) e [testes de tipos](../functions/tests/create-personal-deck.typecheck.ts): ordem, limites 0/18/19/20, rejeição de autoridade, catálogo/referências, clock, falhas intactas, frozen/aliases e replays. `test:gameplay` **145/145**, backend **253/253**, testes de tipos e `build:functions` passaram, exit 0. Evidências no [contexto operacional](contexto-operacional-para-ias.md#validação-disponível). Angular, Rules e emuladores não foram executados por ausência de mudanças nesses caminhos.

Os doubles desse incremento exercitaram decisões e replays, sem comprovar isolamento real. O [teste posterior de integração/emulador](#limite-de-20-sob-concorrência) repetiu os cenários de 19 decks + duas operações com resultado final 20; não é prova formal de produção. Não há contador ou workaround. Se a query transacional não garantir o hard cap, permanece a condição de parar e propor quota/counter exclusivamente backend antes de qualquer alternativa.

Esse incremento de create não incluiu duplicate, adapters de deck/catálogo, fonte real de conteúdo, active config, Firebase, Callable/mapper, Rules, Angular/UI, Battle Engine, deploy ou alteração remota. Duplicate foi autorizado e implementado separadamente, conforme a seção seguinte. **Deck Builder continua o único CURRENT e está INCOMPLETO.**

## Operação de domínio de duplicação

Status deste incremento: **IMPLEMENTADO E VALIDADO em 29/10/2026**, com autorização de Emanuel exclusivamente para `duplicatePersonalDeck`, testes de execução/tipos e documentação. Fonte: [duplicate-personal-deck.ts](../functions/src/decks/duplicate-personal-deck.ts).

```ts
duplicatePersonalDeck(
  uid: string,
  request: unknown,
  store: PersonalDeckStore,
  catalogReader: PersonalDeckCatalogReader,
  clock: PersonalDeckClock,
): Promise<PersonalDeckResource>
```

O UID confiável permanece separado do pedido. `parsePersonalDeckDuplicateRequest` valida estritamente `{sourceDeckId, expectedSourceVersion, newDeckId}`, com IDs distintos, antes de qualquer I/O. O cliente não fornece draft, nome alternativo, ownership, versão desejada, timestamps ou bypass. O domínio reutiliza os contratos, parsers e erros existentes; não autentica o UID nem expõe transporte novo.

**Fase 1 — descoberta:** `runTransaction(uid)` lê somente a origem, recusa ausência com `PersonalDeckNotFoundError` e versão divergente com `PersonalDeckConflictError`. `parsePersonalDeckResource` produz uma projeção validada, normalizada e independente. Não há destino, listagem/capacidade, clock ou writes nessa fase; retries repetem a leitura e a comparação da versão esperada.

**Entre as fases:** fora dos callbacks, `catalogReader.get(source.draft.contentVersion)` resolve exatamente a versão histórica descoberta. Null gera `PersonalDeckContentUnavailableError`; `validatePersonalDeckDraftReferences` confere o draft contra esse catálogo. Corrupção estrutural produz `GameplayContractError`; referência incompatível produz `PersonalDeckContentError`. Rascunhos incompletos e cartas reconhecidas com `eligible: false` permanecem permitidos. Não há migração de revisão, catálogo ativo, ownership ou publicação consultados. Falhas do reader/store propagam sem serem mascaradas como ausência ou erro de negócio.

**Fase 2 — criação:** uma nova `runTransaction(uid)` executa, nesta ordem:

1. Relê a origem, recusa ausência e compara novamente `expectedSourceVersion`.
2. Normaliza a projeção atual e compara integralmente o draft com o validado na descoberta: nome, regras, proveniência e cada referência/revisão/quantidade canônica. Divergência gera `PersonalDeckConflictError`, inclusive quando a versão não mudou; alterações somente de metadados não mudam o draft.
3. Lê o destino; existência gera `PersonalDeckAlreadyExistsError`, antes de consultar capacidade ou tempo.
4. Consulta `list(PERSONAL_DECK_LIMITS.maxDecks)`; tamanho no limite ou acima gera `PersonalDeckCapacityError`, sem clock ou write.
5. Obtém um instante confiável por `PersonalDeckClock` e valida um novo recurso, com `id = newDeckId`, `version = 1` e `createdAt === updatedAt`. Falha ou timestamp inválido gera `PersonalDeckClockError`.
6. Enfileira exclusivamente `transaction.create()` depois de todas as leituras e retorna outra cópia independente do recurso.

O draft preserva nome, referências, revisões e quantidades da origem, sem sufixo de cópia ou dados derivados de validade. A origem nunca é alterada; `Number.MAX_SAFE_INTEGER` nela não impede duplicar, pois a versão nova é 1 e não há incremento da origem. As datas são novas leituras confiáveis para o destino, sem copiar as datas históricas nem exigir comparação temporal com outro recurso.

Cada retry da fase 2 relê origem, destino e capacidade, revalida as precondições e reconstrói um candidato independente. O relógio é lazy e consultado no máximo uma vez por chamada lógica; se já forneceu um instante, esse valor é reutilizado. Objetos mutáveis enfileirados em tentativas descartadas não são reutilizados, e o retorno não compartilha estruturas com origem, descoberta ou write. Somente o write da tentativa final pode ser confirmado pelo fake store; isso exercita a porta e não comprova uma transação Firestore.

Cobertura em [51 testes de execução](../functions/tests/duplicate-personal-deck.test.ts) e [testes de tipos](../functions/tests/duplicate-personal-deck.typecheck.ts): sucesso, falhas/precondições, referências históricas, drafts vazios/parciais/completos, `eligible: false`, capacidade 0/19/20, versão máxima da origem, clock, propagação de erros, frozen/aliases e retries nas duas fases. `test:gameplay` **145/145**, backend **304/304**, testes de tipos e `build:functions` passaram, exit 0. Evidências no [contexto operacional](contexto-operacional-para-ias.md#validação-disponível). Angular, Rules e emuladores não foram executados, pois esses caminhos não mudaram.

Os testes desse incremento usaram doubles e não comprovaram isolamento real. A evidência posterior de 19 decks + duas criações válidas simultâneas no emulador está em [capacidade concorrente](#limite-de-20-sob-concorrência), sem prova formal de produção. Se o mecanismo falhar, permanece a condição de parar antes de workaround e propor quota/counter backend ao proprietário.

O incremento de domínio duplicate não incluiu adapter Firebase, Callable/mapper, Rules, Angular/UI, catálogo remoto, contador, Battle Engine ou deploy. O adapter foi autorizado em incremento separado, abaixo. **Deck Builder permanece o único CURRENT e está INCOMPLETO.**

## Adapter Firestore isolado

Status deste incremento: **IMPLEMENTADO E VALIDADO LOCALMENTE em 29/10/2026**, com escopo autorizado exclusivamente para `PersonalDeckStore` real e testes de integração no emulador. Fonte: [firestore-personal-deck-store.ts](../functions/src/decks/firestore-personal-deck-store.ts); [testes de integração](../functions/tests/firestore-personal-deck-store.emulator.ts) e [testes de tipos](../functions/tests/firestore-personal-deck-store.typecheck.ts). A interface pública do store não mudou.

`createFirestorePersonalDeckStore(firestore: Firestore): PersonalDeckStore` recebe a instância Admin SDK por injeção. `runTransaction(uid, callback)` valida o segmento de UID confiável e constrói exclusivamente `users/{uid}/decks`; IDs de documento reutilizam o parser compartilhado e recusam segmentos reservados/paths arbitrários. O adapter não autentica o UID nem consulta perfil, coleção, publicação ou catálogo. Não há exportação de endpoint em `index.ts`.

O documento persistido contém exatamente os oito campos planos do [modelo aprovado](#modelo-de-decks-pessoais), com `schemaVersion: 1`. UID e deckId pertencem ao caminho. A leitura valida o envelope e converte suas datas para ISO UTC antes de chamar `parsePersonalDeckResource`; a escrita chama o mesmo parser e converte os instantes do domínio com `Timestamp.fromMillis`. Timestamps com precisão submilissegundo são recusados para impedir perda de informação. Não há `serverTimestamp()`, migração ou segundo contrato de deck. O JSON normalizado com datas ISO respeita o limite compartilhado de 16 KiB.

| Operação do adapter | Semântica |
| --- | --- |
| `get(deckId)` | Leitura transacional; recurso validado ou null somente para documento ausente |
| `list(20)` | Query limitada da mesma subcoleção, dentro da transação, sem filtros; valida cada documento retornado e não esconde corrupção |
| `create(resource)` | `transaction.create` com precondição real de destino inexistente no commit |
| `replace(resource)` | Presença validada por get/list na mesma tentativa; `transaction.set` completo, sem merge, protegido pelas leituras transacionais contra upsert concorrente |
| `delete(deckId)` | Presença validada por get/list na mesma tentativa antes de enfileirar a exclusão |

Cada retry recebe um handle novo e confirmações de presença vazias. Todas as leituras precisam terminar antes de qualquer write. O handle deixa de ser utilizável ao concluir o callback; writes com leituras pendentes, leitura após write ou uso após o callback falham. Uma falha do adapter invalida a tentativa mesmo se o callback tentar capturá-la, e callbacks que falham abortam todos os writes enfileirados. Erros do SDK propagam para o chamador, sem tradução para ausência ou recusa de negócio.

Versionamento, no-op, referências históricas e capacidade continuam nos domínios; o store não decide essas políticas. Os testes integrados injetam catálogo fake e clock determinístico, mantendo o store, as transações e as consultas finais reais no emulador. A cobertura inclui os cinco domínios, isolamento de UIDs, ausência, destino existente/precondição de create, datas/versões, no-op confirmado por `updateTime`, replace/delete sem upsert, rollback, reexecução concorrente, corrupção e limites 0/19/20. A suíte real passou com **44/44**; gameplay **145/145**, backend **304/304**, typecheck explícito e build Functions também passaram, exit 0. Resultados completos e condições de execução ficam no [contexto operacional](contexto-operacional-para-ias.md#validação-disponível); a evidência prioritária de capacidade está [acima](#limite-de-20-sob-concorrência).

Nenhuma Callable, autenticação de transporte, Rules, UI, Angular service, catálogo remoto, conteúdo, contador, migração, partida ou deploy foi acrescentado pelo incremento do store. As Rules continuam negando acesso cliente a decks. O reader histórico foi autorizado separadamente, abaixo.

## Adapter Firestore de catálogo histórico

Status: **IMPLEMENTADO E VALIDADO LOCALMENTE em 25/11/2026**, com autorização de Emanuel exclusivamente para leitura histórica e testes de integração. Factory [createFirestorePersonalDeckCatalogReader](../functions/src/decks/firestore-personal-deck-catalog.ts) recebe `Firestore` do Admin SDK e retorna a porta pública inalterada `PersonalDeckCatalogReader`. O único caminho lido é `gameplayContentVersions/{contentVersion}`; o identificador é validado antes de compor o caminho, inclusive recusando segmentos reservados do Firestore. Não recebe UID e não consulta propriedade, publicação, jogador ou configuração ativa.

### Envelope histórico validado

Representação **APROVADA explicitamente por Emanuel em 25/11/2026**, após identificar que o contrato anterior não especificava os campos das referências. O documento contém exatamente os quatro campos obrigatórios:

| Campo | Representação |
| --- | --- |
| `schemaVersion` | Inteiro fixo `1`; sem fallback ou migração de schema desconhecido |
| `catalog` | `GameplayDeckCatalog`, validado integralmente por `parseGameplayDeckCatalog`; `contentVersion` igual ao ID do documento |
| `trainingReferences` | Array obrigatório, podendo ser vazio, de objetos exatos `{referenceId, referenceDeck}`; IDs únicos conforme Gameplay Contract e `referenceDeck` no formato `GameplayDeckList` |
| `createdAt` | `Timestamp` do Admin SDK; strings, números, null e mapas que imitam Timestamp são recusados |

Cada referência passa por `parseGameplayDeckList` e `validateGameplayDeck` com o próprio catálogo e contexto `training-reference`. Isso exige mesmas regras/conteúdo, 24 cartas, até duas cópias por identidade e revisão/elegibilidade canônicas. Nenhuma referência inválida é ignorada: mesmo uma referência não utilizada pelo rascunho pessoal invalida o envelope inteiro. A validação reutiliza Deck Rules sem mudar sua semântica. O reader retorna somente o catálogo; não expõe referência de treino como autoridade pessoal.

O envelope completo normalizado, incluindo todas as referências, deve ter até **65.536 bytes de JSON em UTF-8**, com `createdAt` projetado para ISO UTC em milissegundos somente para medir tamanho. Um Timestamp válido com precisão maior é aceito e permanece intacto no documento; sua data não faz parte do retorno. O catálogo e as listas de referência são projetados pelos parsers, sem alterar definições, revisões, ordem ou `eligible: false`. Não há agregação/substituição silenciosa de definições nem fragmentação para contornar o teto.

Documento ausente retorna `null`. Documento presente inválido rejeita com os erros existentes de contrato/Deck Rules; falhas do SDK propagam sem captura ou conversão para ausência. O retorno é uma projeção aninhada independente, readonly nos tipos e sem congelamento obrigatório em runtime. Leituras repetidas e alterações pelo consumidor não alteram a origem ou outras projeções.

[Testes de integração](../functions/tests/firestore-personal-deck-catalog.emulator.ts) usam exclusivamente o Firestore Emulator e `demo-cardgame`, com fixtures por execução e limpeza somente dos próprios documentos. Incluem os limites exatos 65.536/65.537 bytes, falha RPC real por recurso de banco inválido, independência de retornos e `createPersonalDeck` + store + reader reais: conteúdo válido permite salvar; ausência, corrupção, referência de treino inválida ou falha RPC impedem qualquer gravação. [Testes de tipos](../functions/tests/firestore-personal-deck-catalog.typecheck.ts) verificam a factory, assinatura, ausência de UID/writes e readonly aninhado. Resultados executados estão no [contexto operacional](contexto-operacional-para-ias.md#validação-disponível).

Sem alterações em `shared/gameplay`, sem escrita/ativação de catálogo, active config, endpoints, Rules, Angular, migração, contador, conteúdo real, Battle Engine ou deploy. A integração de Update/Duplicate foi autorizada separadamente, abaixo.

## Integração real de Update e Duplicate

Ampliação de testes autorizada em 25/11/2026, na [suíte existente do catálogo](../functions/tests/firestore-personal-deck-catalog.emulator.ts), reutilizando inicialização, fixtures e limpeza. Os domínios usam `createFirestorePersonalDeckStore(firestore)` e `createFirestorePersonalDeckCatalogReader(firestore)` reais, com `PersonalDeckClock` determinístico, exclusivamente no Firestore Emulator e projeto `demo-cardgame`. Não há mocks de persistência nem alteração do código de produção.

**Update:** os novos cenários verificam alteração real, versão + 1, `updatedAt` novo e `createdAt` preservado, rascunhos vazios/parciais/completos e `eligible: false`. A troca explícita entre dois catálogos aceita somente a revisão reconhecida no conjunto solicitado, sem substituir versão/revisão automaticamente. O no-op usa entradas divididas/reordenadas e nome com espaços, conferindo normalização, ausência de leitura do clock e preservação integral dos dados e `updateTime`. Ausência do recurso, conflito de versão, catálogo ausente/corrompido, referência de treino inválida e identidade/revisão não reconhecidas impedem writes.

**Duplicate:** origem válida produz outro documento na versão 1, com draft normalizado idêntico e datas novas e iguais. Origem e decks não relacionados conservam dados e `updateTime`. Há casos vazios/parciais com inelegibilidade, origem ausente, versão divergente, destino existente e as mesmas falhas históricas de conteúdo. A capacidade conta a origem entre os documentos: 19 permite terminar em 20; 20 recusa sem criar o destino.

As duas disputas entre descoberta e criação usam uma barreira fora dos callbacks: um wrapper chama o reader real e pausa somente depois da leitura histórica. A alteração concorrente confirma por transação real antes de liberar Duplicate. Um caso avança a versão pelo domínio Update; o outro altera **somente a composição**, mantendo versão e timestamps do domínio, para representar uma anomalia privilegiada e isolar a conferência de draft. Ambos exigem conflito, destino ausente e nenhuma escrita adicional à concorrente já confirmada. Não há sleeps; o timeout apenas limita falhas do teste.

Os dois casos de rollback instrumentam o store real e deixam o domínio enfileirar `replace` ou `create`. Em seguida, acrescentam um `create` de um deck de fixture já existente. O callback termina normalmente e o **commit real falha com `ALREADY_EXISTS`, código 6**. O trace verifica que a escrita principal precedeu a precondição inválida; a comparação de toda a subcoleção, incluindo `updateTime`, comprova a ausência de writes parciais no cenário. O blocker é um deck normal de teste, sem documento de quota ou novo schema. Os wrappers sincronizam/injetam precondição; não fornecem dados simulados.

Após sucesso, os testes conferem o documento plano/Timestamps por leitura direta, `parsePersonalDeckResource` e round-trip pelo store real. Nas falhas, comparam todos os documentos antes/depois e conferem explicitamente a presença esperada do destino. As anomalias necessárias são criadas somente em fixtures próprias do emulador, depois de uma origem válida criada pelo domínio.

A suíte anterior do store permanece com catálogo fake e store real; os testes unitários de domínio continuam usando doubles, incluindo cenários de replay/retries. A evidência nova com ambos os adapters reais não substitui essa classificação nem comprova a garantia concorrente em produção. Totais, comandos e logs executados ficam no [contexto operacional](contexto-operacional-para-ias.md#validação-disponível).

**Deck Builder permanece o único CURRENT e INCOMPLETO.** Encerrar após esse incremento. Próximo candidato pequeno, mediante autorização própria: delimitar o contrato da camada backend autenticada de leitura/listagem própria de decks, sem implementar transporte, Rules, UI ou provisionamento neste trabalho.
