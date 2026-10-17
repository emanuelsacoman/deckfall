# Deck Builder v0.1 — proposta de arquitetura

Status: **PROPOSTA / PENDENTE DE APROVAÇÃO**

Last reviewed: 2026-10-17

Source of truth for: proposta de persistência, autorização e ciclo de vida de decks pessoais; não descreve funcionalidades implementadas

## Escopo e autorização recebida

Emanuel autorizou em 17/10/2026 iniciar Deck Builder e promovê-lo a CURRENT, **exclusivamente em definição documental e arquitetural**. Essa autorização não aprova as recomendações abaixo nem libera implementação. Todas as escolhas novas deste documento são **PROPOSTA / PENDENTE**. As regras já aprovadas continuam no [Game Design](game-design.md#preparação-decks-e-acesso--aprovado).

Não foram criados tipos, serviços, UI, Functions, Rules, índices, documentos Firestore ou dados remotos. Não há deploy, persistência real, catálogo cadastrado, integração com partidas ou Battle Engine. Nenhum schema existente precisa ser alterado para a proposta. Não se cria ADR Accepted enquanto a arquitetura estiver pendente.

## Base atual verificada em modo somente leitura

| Fato observado no repositório | Consequência para a proposta | Evidência principal |
| --- | --- | --- |
| Perfil válido exige `role == roleId`, em `member/admin`; UID autenticado identifica o titular. | Não autorizar por e-mail, payload do cliente ou guard Angular. | [Rules](../firestore.rules), [domínio backend](../functions/src/pack-domain.ts), [autenticação](autenticacao-e-admin.md) |
| Coleção guarda quantidade e duas datas em `users/{uid}/collection/{cardId}`; o ID vem do caminho. Member lê a própria coleção; a gestão manual administrativa existente é preservada. | Quantidade possuída é por identidade, sem saldo separado por revisão. Decks não concedem ou consomem cartas. | [interface](../src/app/model/interfaces/Collection/player-card-collection.ts), [serviço](../src/app/model/services/cruds/collection/player-collection.service.ts), [coleção](colecao.md) |
| `Card` tem status `draft/published/archived`, dados/editor/canvas e datas; não possui revisão nem perfil canônico de batalha. | Publicação, `updatedAt`, raridade ou atributos genéricos não tornam uma carta elegível para gameplay. | [Card](../src/app/model/interfaces/Cards/card.ts), [cartas](cartas.md) |
| Deck Rules recebe composição e contexto confiável separados; verifica 24 cartas, duas cópias por identidade, revisão/elegibilidade e posse ou referência exata. | Reutilizar o validador, sem aceitar contexto confiável enviado pelo cliente. | [implementação](../shared/gameplay/src/decks.ts), [contrato](gameplay-contract.md#deck-rules-e-contexto-confiável), [testes](../tests/gameplay/gameplay-deck.test.mjs) |
| `initializePlayer` e `openPack` autenticam e validam no backend, com transação e erros limitados. Admin SDK ignora Rules. | Repetir autorização e validação no serviço de decks; Rules sozinhas não protegem uma Callable. | [Callables](../functions/src/index.ts), [abertura](../functions/src/open-pack.ts), [ADR-0001](decisions/0001-autoridade-backend.md) |
| O adapter do bootstrap oferece `get(path)` e `set(path)`; não oferece consulta de coleção, create ou delete. | Uma futura persistência de decks precisa de fronteira própria, sem transformar bootstrap em serviço de decks. | [adapter](../functions/src/firestore-bootstrap-store.ts), [contrato do store](../functions/src/pack-domain.ts) |
| `/game/decks` é placeholder; não existe match de decks nas Rules, e o fallback nega acesso. Gameplay ainda é módulo isolado. | Tudo abaixo é uma proposta futura; não há permissão ou endpoint existente a reutilizar como atalho. | [placeholder](../src/app/view/game/decks/decks.component.ts), [Rules](../firestore.rules), [ADR-0005](decisions/0005-contrato-gameplay-puro.md) |

Essa inspeção não conferiu produção. Resultados anteriores de runtime continuam datados no [contexto operacional](contexto-operacional-para-ias.md#validação-disponível); não foram reexecutados nesta tarefa documental.

## Decisões propostas e alternativas

Cada linha é **PROPOSTA / PENDENTE**; a recomendação não constitui aprovação.

| Decisão | Recomendação | Única alternativa considerada | Motivo da recomendação |
| --- | --- | --- | --- |
| Local dos decks pessoais | `users/{uid}/decks/{deckId}` | Coleção global com `ownerUid` em cada documento | O caminho expressa o titular e evita duplicar propriedade ou introduzir consulta global. |
| Escrita | Backend confiável para todo CRUD; cliente lê apenas seus decks | Escrita direta de rascunhos, com validação final no backend | Centraliza limites, concorrência e formato; evita dois modelos diferentes de escrita e validação. |
| O que pode ser salvo | Intenção privada, inclusive composição incompleta ou sem posse suficiente | Salvar somente decks completos e jogáveis naquele instante | Permite montar aos poucos e conservar a lista após mudanças de coleção/conteúdo; não equivale a permitir jogar. |
| Conteúdo canônico | Versões imutáveis em coleção nova, com um ponteiro de versão ativa controlado pelo backend | Bundles imutáveis no repositório, ativados por release do backend | Mantém a política ativa consultável na transação de admissão e permite revisão sem acoplar conteúdo a um deploy. O pool pequeno cabe em um documento por versão. |
| Identidade colecionável | Mesmo `cardId` de `cards/{cardId}` e da coleção | Tabela de mapeamento entre identidades de gameplay e cartas colecionáveis | Uma identidade única dispensa aliases, somas entre variantes e alterações da coleção. |
| Novas partidas pessoais | Somente conteúdo ativo, com migração explícita do deck | Permitir várias versões históricas simultaneamente | Reduz combinações de regras e evita atualização silenciosa de revisões. |
| Capacidade por conta | 20 decks, incluindo incompletos | 10 decks | Espaço suficiente para experimentar, mantendo leitura e controle do limite pequenos; sem cobrança ou desbloqueio econômico. |
| Conflitos | Inteiro `version` e comparação da versão esperada | Comparação de `updatedAt`, como em operações atuais do catálogo | Separa revisão do documento de relógio e de revisão mecânica das cartas. |

## Modelo proposto para decks pessoais

**PROPOSTA / PENDENTE.** Um documento por deck em `users/{uid}/decks/{deckId}`, sem subcoleção de cartas. O conjunto é pequeno e pode ser lido e substituído atomicamente.

| Campo persistido | Contrato recomendado |
| --- | --- |
| `schemaVersion` | Inteiro fixo 1; versão do envelope de persistência, independente das regras. |
| `name` | Texto simples após trim, não vazio, até 80 caracteres pelo mesmo critério de comprimento usado nos campos atuais do projeto. Nomes repetidos são permitidos. |
| `version` | Inteiro seguro positivo; inicia em 1 e avança em cada edição efetiva, inclusive renomeação. Nunca fornecido como novo valor pelo cliente. |
| `rulesVersion` | Versão aprovada suportada: `0.1`. |
| `contentVersion` | Identificador do conjunto canônico ao qual as entradas se referem. Não é autorização para usar essa versão em uma partida. |
| `entries` | Array de referências `{cardId, revision, quantity}`; sem perfis inline ou instâncias de batalha. |
| `createdAt` | Timestamp de servidor, definido na criação e imutável. |
| `updatedAt` | Timestamp de servidor, atualizado com a edição efetiva. |

`uid` e `deckId` vêm do caminho, sem duplicação no documento. Um UUID opaco identifica o deck; nome e slug não são identidade. IDs de carta/conteúdo seguem os limites do Gameplay Contract; versões/revisões/quantidades são inteiros seguros, sem conversão permissiva de strings ou floats.

Não persistir `isValid`, `isPlayable`, ownership, elegibilidade, raridade, nomes/imagens de cartas, canvas, custo/efeitos, resultado de partida, `selectedDeckId` ou modo de treino. Esses dados têm outras fontes ou ainda não são requisitos. Não criar descrição, capa, favoritos, histórico de versões ou compartilhamento no v0.1.

### Composição salva e limites

**PROPOSTA / PENDENTE.** A gravação aceita de zero a 24 cartas no total e até duas cópias por identidade. Cada linha tem quantidade 1 ou 2; remover uma carta remove a linha. O backend agrega linhas repetidas da mesma identidade/revisão, recusa revisões conflitantes, confere os limites e salva uma linha por identidade em ordem lexical ASCII. Não existe mínimo de Unidades/Ações, raridade ou facção.

Toda referência precisa ser reconhecida e corresponder à revisão canônica de seu `contentVersion`, mesmo em rascunho. Guardar uma intenção incompleta não permite inventar IDs/perfis. Revisões de conteúdo já utilizadas continuam disponíveis para leitura e reparo; sua retirada de novas partidas não apaga as listas salvas. O backend permite conservar referências reconhecidas que perderam publicação, elegibilidade ou posse; informa indisponibilidade sem promover o deck a jogável.

Limite proposto de **16 KiB** para o pedido de mutação e para a representação normalizada do documento. A medida de aplicação é JSON em UTF-8, com timestamps da projeção normalizados para ISO UTC; não é uma medição do armazenamento interno do Firestore. Campos exatos, até 24 entradas, IDs limitados e nome curto mantêm o envelope pequeno. Recusar campos extras, conteúdo binário e tentativas de inflar o pedido antes de consultas caras. O teto da aplicação é deliberadamente menor que o [limite da plataforma](https://firebase.google.com/docs/firestore/quotas#collections_documents_and_fields), sem alterar esse limite nem schemas existentes.

Listar apenas a subcoleção própria, com consulta limitada, e ordenar localmente até 20 decks por atualização e ID como desempate. Não há necessidade inicial de consulta global, índice composto ou contador em `users`/`players`. Nenhum índice está sendo criado nesta proposta.

## Ownership e autorização propostas

**PROPOSTA / PENDENTE.** O titular é exclusivamente `request.auth.uid`, com perfil existente e `role == roleId` em `member/admin`. Não exigir novo campo de autorização em `users` nem usar o recebimento do starter como comprovante de posse de cartas.

| Ator | Leitura de decks pessoais | Criação, edição, exclusão e duplicação |
| --- | --- | --- |
| Anônimo, perfil ausente ou papel inconsistente | Negada | Negadas |
| Member com perfil válido | Somente seus documentos e sua subcoleção | Somente por backend autenticado, no próprio caminho |
| Admin usando o aplicativo | Somente seus próprios decks; sem acesso administrativo geral a decks privados no v0.1 | Mesmo fluxo backend do titular; sem exceção para SDK cliente |
| Backend privilegiado | Apenas os dados necessários à operação autorizada | Revalida identidade, perfil, caminho, formato e invariantes; não confia no Admin SDK como autorização de produto |

As Rules futuras permitiriam get/list próprios e negariam todos os writes cliente, inclusive administrativos. O privilégio atual de gerir manualmente coleção não seria ampliado a decks pessoais. Acesso operacional por IAM/Admin SDK continua sendo uma fronteira privilegiada distinta; não há promessa de que Rules bloqueiem operadores do projeto.

O cliente pode solicitar `deckId`, nome, composição e versão esperada. Payloads não podem fornecer UID proprietário, `ownership`, `eligible`, `definition`, `validatedDeck` ou uma exceção `training` como autoridade. Verificar identificadores antes de compor caminhos; não aceitar paths arbitrários. Respostas de erro não revelam coleção/decks de terceiros ou detalhes internos.

## Conteúdo canônico e revisões

**PROPOSTA / PENDENTE.** Preservar integralmente `Card`, `CardCanvasData`, `users`, `players`, coleção e pacotes. Adicionar, apenas em implementação futura aprovada, duas estruturas independentes:

| Caminho proposto | Responsabilidade mínima |
| --- | --- |
| `gameplayContentVersions/{contentVersion}` | Envelope de conteúdo com `schemaVersion`, `catalog` no formato `GameplayDeckCatalog`, referências de treino identificadas e suas composições, e `createdAt` de servidor. A versão do caminho coincide com `catalog.contentVersion`; todas as referências usam suas regras/conteúdo. Documento imutável após criação. |
| `gameplayConfig/active` | `schemaVersion`, `contentVersion` e `updatedAt` de servidor; aponta para uma versão existente e integralmente validada. Política única de conteúdo permitido para novas admissões. |

O ponteiro não contém perfis duplicados. Publicar uma nova versão e ativá-la exige operação privilegiada explícita, com validação de todas as definições, referências e identidades antes do commit; não é uma capacidade do jogador nem uma nova tela administrativa presumida. Não se reescreve uma versão histórica. Provisionamento/publicação desse conteúdo será um trabalho próprio autorizado, sem seed remoto implícito.

Limite técnico proposto para o envelope completo de uma versão de conteúdo: **64 KiB** de JSON normalizado em UTF-8, incluindo catálogo, referências e data normalizada. Conferir tamanho, campos exatos, IDs únicos, versões coincidentes e validade completa das referências antes de gravar/ativar. O pool didático inicial tem 16 identidades aprovadas; isso não aprova futuros aumentos nem dispensa esse limite. Uma versão que não caiba deve ser recusada, sem fragmentação automática ou contorno do teto; outro modelo exigiria revisão arquitetural.

Clientes não gravam nenhuma dessas estruturas. Recomenda-se fornecer ao jogador autenticado uma projeção de catálogo/referências permitidos por serviço backend; os documentos autoritativos completos permanecem sem leitura direta pelo cliente. A projeção pessoal só apresenta cartas atualmente publicadas e não expõe metadados ou assets privados. O modo de treino fornece seu conteúdo didático próprio. Não expor cartas draft/archived através de uma junção privilegiada para contornar as Rules de `cards` ou Storage.

Para deck pessoal, `GameplayCardDefinition.cardId` deve ser exatamente o ID de `cards/{cardId}` e `users/{uid}/collection/{cardId}`. Uma referência de treino pode usar identidades didáticas que ainda não tenham `Card` colecionável; elas não ficam disponíveis para partidas pessoais por causa disso. Slug, nome, arte, facção ou posição na lista não resolvem essa associação.

`revision` é a revisão do perfil mecânico, não `updatedAt` de `Card`, versão do canvas ou `version` do deck. O mesmo par `cardId/revision` mantém o mesmo perfil em todos os conjuntos. Alterar custo, atributos mecânicos ou efeitos exige nova revisão e novo `contentVersion`; mudar somente arte/texto de apresentação não altera automaticamente a mecânica. Uma nova revisão não exige adquirir outra cópia: a coleção continua medindo quantidade por identidade.

O catálogo e suas referências precisam de validação editorial e técnica antes de existir como conteúdo utilizável. Os nomes/perfis aprovados no Game Design e o manifesto da Starter Wave não criam documentos, vínculos ou elegibilidade; Nyra não é adaptada automaticamente. Se configuração, versão ou vínculo obrigatório não existir ou estiver inválido, retornar indisponibilidade; não derivar um perfil dos defaults do editor nem usar fixtures como fallback.

## Deck salvo e deck validado para uma partida

| Conceito | Significado proposto |
| --- | --- |
| Deck salvo pelo jogador | Intenção privada com referências e metadados. Pode estar incompleto, desatualizado ou sem quantidade possuída suficiente. Permanecer salvo não certifica acesso ao jogo. |
| Resultado de uma conferência | Diagnóstico calculado contra conteúdo e coleção observados naquela operação. Pode mudar; não é campo permanente de autoridade nem token emitido ao cliente para reutilização. |
| Deck admitido para uma partida futura | Backend autenticou, escolheu conteúdo permitido, releu dados confiáveis e obteve uma composição canônica válida para fixar no estado daquela partida. Não é o documento pessoal usado diretamente pelo motor. |

**PROPOSTA / PENDENTE.** Na persistência de rascunhos, reutilizar `parseGameplayDeckList` para o envelope e aplicar as restrições de composição parcial acima. Não relaxar `validateGameplayDeck` para aceitar decks incompletos e não reutilizar o modo de referência como bypass de propriedade. A política de rascunho pertence à aplicação; as regras completas aprovadas permanecem no módulo puro.

Na futura conferência completa/admissão pessoal, o backend:

1. Deriva o titular da autenticação e valida o perfil; lê o deck do próprio caminho e confere a versão esperada.
2. Lê `gameplayConfig/active` e a versão canônica correspondente; recusa versão do deck diferente da ativa, sem substituir entradas silenciosamente.
3. Obtém as identidades agregadas e lê `users/{uid}/collection/{cardId}` e `cards/{cardId}` necessários. Ausência na coleção equivale a zero; entrada malformada ou falha de leitura impede concluir a validação, sem converter erro em propriedade válida.
4. Valida o envelope da coleção, inclusive quantidade inteira e datas coerentes. Essa é uma exigência **proposta para o novo fluxo backend**, seguindo a validação estrita de entradas na abertura de packs em `pack-domain.ts`; não é uma garantia do parser frontend da coleção, que admite datas ausentes/inválidas como null. Deriva elegibilidade efetiva para deck pessoal: permitida no catálogo **e** carta existente com status `published`.
5. Monta `{kind: 'owned', catalog, ownership}` exclusivamente com esses dados e chama `validateGameplayDeck`. O validador aplica exatamente 24 cartas, cópias agregadas, revisão canônica, conteúdo, elegibilidade e quantidade possuída.
6. Usa o resultado copiado/canônico apenas na operação confiável que o produziu. Uma resposta informativa ao cliente não substitui repetir essa validação na admissão da partida.

Não consumir nem reservar cartas ao salvar, conferir ou admitir o deck; uma mesma coleção pode sustentar várias listas. A quantidade administrativa máxima da coleção não muda o limite de duas cópias de gameplay. Leituras consistentes são necessárias: uma validação feita em cache ou uma lista de propriedade enviada pelo frontend não serve para admissão.

## Mudanças posteriores nas cartas e no conteúdo

**PROPOSTA / PENDENTE.** Não apagar ou atualizar decks pessoais automaticamente por uma mudança de catálogo/coleção. O jogador pode abrir, renomear, excluir ou reparar a intenção salva; a interface futura deve distinguir indisponibilidade de ausência do deck.

| Mudança | Deck salvo | Nova admissão pessoal | Partida já iniciada |
| --- | --- | --- | --- |
| Carta vira draft/archived, é despublicada ou excluída | Referência e lista permanecem; sem expor dados/PNG agora protegidos | Recusada enquanto a referência depender de carta não publicada/existente | Conserva perfis e composição fixados no snapshot |
| Quantidade possuída diminui ou entrada é removida | Lista permanece | Revalidar; recusar se faltar quantidade | Não consultar nem reescrever o inventário da partida |
| Somente arte/nome/apresentação muda | Lista continua apontando para a mesma identidade/revisão mecânica | Mecânica não é inferida da nova apresentação | Estado mecânico permanece fixado; política visual de partida não é implementada aqui |
| Perfil ganha revisão nova e novo conjunto é ativado | Versões antigas permanecem registradas | Exigir atualização explícita para o conjunto ativo e revalidar | Usa a versão e os perfis originais |
| Configuração ou catálogo obrigatório fica inválido/ausente | Leitura da intenção pessoal continua possível | Falhar sem fallback permissivo | Não substituir o snapshot por conteúdo vivo |

Sem catálogo histórico disponível, leitura, renomeação e exclusão do deck continuam possíveis: renomeação valida apenas nome/envelope/versão e preserva integralmente as referências. Edição da composição ou duplicação exige resolver as referências no catálogo indicado e falha se ele estiver indisponível. Uma reparação explícita pode submeter uma nova composição reconhecida na versão ativa, sem exigir reinterpretar o perfil histórico ausente; não é atualização silenciosa.

Atualizar conteúdo é uma edição explícita do deck, com comparação de `version`. O backend resolve cada identidade no conjunto de destino; identidades removidas são apontadas para reparo, nunca substituídas por outras. O jogador confirma as referências/revisões de destino; uma atualização de conteúdo pode conservar uma composição parcial, mas não afirma que ela esteja pronta para jogar.

## Treino e referência

As regras aprovadas permitem referências iguais e independentes da coleção, sem concessão ao inventário. **PROPOSTA / PENDENTE:** guardar referências imutáveis no documento da versão canônica, separadas dos decks pessoais; elas não ocupam o limite de 20 decks do jogador.

O cliente escolhe apenas um `referenceId` permitido no fluxo de treino. O backend resolve esse ID na versão ativa e constrói `{kind: 'training-reference', catalog, referenceId, referenceDeck}`. O validador exige composição exatamente igual à referência confiável; não aceitar lista personalizada, `kind`, `bypassOwnership` ou boolean do cliente para dispensar propriedade. O conteúdo é o mesmo para ambos os participantes, conforme o design aprovado.

A referência não precisa de posse ou de um `Card` colecionável artificial. Despublicar uma carta de apresentação bloqueia a admissão pessoal, mas **não retira por si só uma referência didática explicitamente permitida**. Para retirar conteúdo também do treino, publicar/ativar uma versão de gameplay que não permita a referência ou suas cartas. O treino nunca obtém assets privados de uma carta despublicada como atalho. Essa separação entre publicação visual e permissão de treino depende da aprovação destacada ao final.

## Operações, concorrência e falhas

**PROPOSTA / PENDENTE.** Mutação explícita por serviço backend; sem autosave remoto presumido. Uma futura operação tem parser estrito, domínio testável e adapter próprio; componentes apenas orquestram serviços tipados. Não se implementa esse serviço nem seu contrato de transporte nesta tarefa.

| Operação | Comportamento recomendado |
| --- | --- |
| Criar | Escolher um UUID de destino uma vez por intenção, validá-lo e usá-lo apenas no caminho do titular. Backend exige ausência do destino, valida o rascunho, confere capacidade e grava versão 1 com as duas datas de servidor no mesmo commit. |
| Editar/renomear | Exigir `expectedVersion` igual à versão atual. Validar campos e, ao editar composição, suas referências; renomeação isolada preserva as referências sem exigir catálogo disponível. Preservar `createdAt`; incrementar versão e atualizar data somente em mudança efetiva. Um pedido sem mudança não cria revisão inútil. |
| Excluir | Exigir versão esperada e excluir o documento sem modificar coleção ou assets. Não requer que as cartas ainda sejam publicadas/elegíveis. Sem lixeira/histórico no v0.1; cópias fixadas em partidas futuras não dependem desse documento. |
| Duplicar | Backend lê origem do próprio titular, verifica sua versão esperada e cria outro ID, aplicando o mesmo limite/validação da criação. Copia intenção e referências, inclusive incompletas; não copia datas, versão do documento ou suposta validade. Nome de cópia continua dentro de 80 caracteres. |

O UUID pode ser gerado pelo cliente como identificador de tentativa, sem conferir autoridade sobre titular ou cartas. Create-if-absent protege contra sobrescrita; não gerar outro ID automaticamente após resposta incerta. Se o destino já existe, reler/reconciliar, sem sobrescrever uma edição posterior. IDs não são reutilizados pelo aplicativo após exclusão.

Update/delete/duplicação com versão antiga retornam conflito e exigem releitura; sem last-write-wins, merge automático ou lock apenas em memória. Retries internos da transação repetem as leituras e a comparação com a mesma versão esperada, sem adotar a nova versão silenciosamente. Versão esgotada ou documento inválido falha sem reset.

Se o commit ocorrer e sua resposta se perder, reler o mesmo documento para conferir o estado antes de repetir. Um retry de edição pode devolver conflito após uma gravação bem-sucedida; uma exclusão pode devolver ausência. Não prometer CRUD exatamente uma vez ou idempotência histórica após exclusão sem recibos. **Não recomendar uma coleção de recibos permanente no v0.1**: reconciliação explícita cobre esse caso com menos infraestrutura, sem conceder valor de jogo.

### Limite de 20 sob concorrência

**PROPOSTA / PENDENTE.** Criar/duplicar deve consultar até 20 documentos da subcoleção **dentro da mesma transação server read-write** que verifica ausência e cria o destino; se já houver 20, recusar. Edição não altera a contagem; exclusão libera capacidade após commit. Não consultar a quantidade fora da transação nem usar cache, aggregate externo, `deckCount` fornecido pelo cliente ou lock local.

A recomendação se apoia no [isolamento serializável do Firestore](https://firebase.google.com/docs/firestore/transaction-data-contention#serializable_isolation) e no suporte a leitura de query pelo [SDK servidor em transação](https://cloud.google.com/nodejs/docs/reference/firestore/latest/firestore/transaction). A integração deve provar o limite com testes concorrentes, inclusive inserções na coleção inicialmente vazia e duas criações quando há 19 documentos; não tratar a proposta como garantia já testada. Evita um contador em `users`/`players` ou documento auxiliar de quota no primeiro desenho.

Todas as leituras precedem os writes, incluindo perfil, destino, origem quando houver, catálogo e consulta de capacidade. Transações podem repetir o callback; não disparar eventos externos, notificações ou efeitos de UI de dentro dele. Essas propriedades seguem os [contratos oficiais de transações](https://firebase.google.com/docs/firestore/manage-data/transactions). O limite de documentos não protege por si só contra abuso de invocações; App Check/rate limiting não são capacidades já implementadas no código atual.

## Fronteira com o futuro Battle Engine

As recomendações desta seção continuam **PROPOSTA / PENDENTE** e não iniciam o próximo milestone. O núcleo puro recebe definições/quantidades validadas pelo backend; não lê Firestore, não interpreta UID enviado pelo jogador e não usa `name`, timestamps ou validade do deck pessoal como regra de combate.

Uma futura admissão deverá ler perfil, política ativa, composição, publicação e coleção em contexto transacional consistente e fixar a composição canônica e as versões na criação autoritativa da partida. Se houver mudança concorrente nos dados consultados, revalidar antes de confirmar a criação; não separar uma checagem antiga de uma gravação posterior que a trate como recibo. A operação concreta pertence ao milestone de integração de partidas.

Depois desse commit, o motor usa o snapshot fixado, IDs de instância e regras da partida. Alterar/excluir o deck salvo, reduzir a coleção ou despublicar uma carta não modifica uma partida iniciada. Uma referência opcional à origem do deck serviria somente para auditoria; não seria uma consulta viva para resolver ações. Informação oculta, embaralhamento, PRNG, transições e projeções permanecem sob os contratos e marcos próprios, sem implementação aqui.

## Critérios para um futuro incremento de implementação

Esta lista é planejamento **PENDENTE**, não autorização para executar nesta tarefa:

- Aprovar ou revisar as decisões abaixo e delimitar um próximo incremento próprio; não implementar toda a lista por uma aprovação genérica da arquitetura.
- Especificar e revisar o contrato de transporte dos pedidos/respostas e dos conflitos; manter UID, perfis, propriedade, elegibilidade e datas fora da autoridade do cliente.
- Preparar conteúdo canônico real e vínculos explícitos antes de habilitar decks pessoais jogáveis; não converter fixtures, Nyra ou StarterPack automaticamente.
- Testar rascunhos parciais versus validação completa, normalização/limites, campos indevidos, IDs/revisões forjados, coleção ausente/malformada e referências de treino exatas.
- Testar Rules de leitura própria, negação cruzada/anônima e todos os writes cliente negados; testar autorização do backend separadamente, inclusive conta admin e perfil revogado/inconsistente.
- Testar create/update/delete/duplicate concorrentes, limite em 0/19/20, versões antigas, confirmação perdida, conteúdo ativado em paralelo e inexistência de writes parciais.
- Executar checks de domínio, Rules, integração e frontend apenas quando seus caminhos forem implementados. Testar futura admissão/snapshot no respectivo marco, sem afirmar essa garantia só com testes de Deck Rules.

## DECISÕES QUE EMANUEL PRECISA APROVAR

**Todas PENDENTES.** Autorizar a definição do milestone não aprovou estes cinco blocos:

1. **Persistência e privacidade:** `users/{uid}/decks/{deckId}`, leitura somente do próprio titular, todo CRUD via backend e nenhuma exceção administrativa geral para decks pessoais.
2. **Intenção salva:** permitir composições de 0–24 cartas reconhecidas, até duas cópias por identidade, inclusive sem posse/elegibilidade atuais; validar a legalidade e propriedade completas novamente antes de qualquer partida. Alternativa: salvar apenas decks completos e jogáveis no instante da gravação.
3. **Conteúdo canônico:** versões imutáveis novas em Firestore, limitadas a 64 KiB por envelope completo, com um ponteiro ativo confiável e `cardId` colecionável igual ao ID atual da carta/coleção, sem alterar seus schemas. Alternativa de armazenamento: bundles versionados no repositório ativados por release do backend.
4. **Ciclo de vida e treino:** admitir novas partidas pessoais somente na versão ativa, com atualização explícita de decks antigos; publicação/posse atuais condicionam uso pessoal, e referências de treino são permitidas pelo catálogo independentemente da coleção/publicação visual. Snapshots de partidas iniciadas permanecem fixos conforme o design já aprovado.
5. **Limites e concorrência:** 20 decks por conta, nome até 80, envelope até 16 KiB, versão inteira com comparação da versão esperada, create-if-absent e reconciliação de respostas incertas; sem cobrança, contador em schema existente, histórico ou recibos permanentes no v0.1.

**Próxima ação permitida nesta entrega: aguardar a revisão de Emanuel. Nenhuma implementação está autorizada por este documento.**
