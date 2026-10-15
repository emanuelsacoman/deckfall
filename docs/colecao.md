# Coleção do jogador

`/game/colecao` consulta a propriedade de cartas concedidas pela abertura do Starter Pack ou manualmente por administradores. Ao entrar em `/game`, `initializePlayer` concede uma única instância lacrada, sem adicionar cartas; `openPack` soma seu conteúdo em transação. O jogador continua sem escrita direta na coleção. Não há loja, recompensas periódicas, economia, decks funcionais ou gameplay. Veja [Player Bootstrap](player-bootstrap.md) e [pacotes](pacotes.md).

## Propriedade e autorização

O documento `users/{uid}/collection/{cardId}` persiste somente `quantity`, `firstAcquiredAt` e `lastAcquiredAt`. `cardId` vem do caminho na leitura. Nome, raridade, atributos, arte e canvas continuam em `cards/{cardId}`; `PlayerOwnedCard` une os dois contratos apenas em memória. Veja [o modelo Firestore](modelo-dados-firestore.md).

`quantity` é um inteiro de 1 a 9999. Esse teto é técnico, sem relação com futuros limites de deck. Zero é uma instrução de remoção, nunca um valor persistido. Criação usa timestamps de servidor nos dois campos; atualização conserva `firstAcquiredAt` e renova `lastAcquiredAt`, inclusive ao reduzir a quantidade.

| Conta | Leitura | Escrita |
| --- | --- | --- |
| Member com perfil válido | Get/list da própria coleção | Nenhuma |
| Admin | Coleções de perfis existentes | Conceder/definir quantidade de cartas publicadas e remover entradas |
| Anônimo ou perfil inválido | Nenhuma | Nenhuma |

Firestore Rules exigem perfil do proprietário existente e carta `published` para criação/atualização, recusam campos desconhecidos, quantidade inválida e alteração da primeira data. Delete administrativo não exige carta ou perfil ainda existente, permitindo limpeza de entradas órfãs nas Rules. O serviço e a UI trabalham com um perfil encontrado; não criam coleção para UID sem perfil. As permissões do documento de usuário, cartas e templates permanecem separadas.

## Serviço e concorrência

`PlayerCollectionService` concentra `listCurrentUser`, `listForUser`, `setQuantity` e `remove` em `model/services/cruds/collection/`. Componentes não acessam Firestore. Leituras são feitas sob demanda no servidor; cada entrada resolve a carta com `CardService.getById`, sem varrer o catálogo para o jogador.

`setQuantity(uid, cardId, quantity, original)` define o total absoluto. A transação lê perfil, carta quando necessário e entrada antes de escrever. Compara quantidade e as duas datas da entrada carregada; se outra sessão criou, alterou ou removeu a entrada, exige recarregar. A primeira concessão usa `original: null`; remoção dispensa leitura da carta global. Uma operação simultânea para o mesmo UID/carta é recusada na instância local do serviço, sem lock global entre abas.

## Abertura de pack e soma única

`PlayerInitializationService` solicita `initializePlayer` com dados vazios; essa operação grava somente player e Starter Pack lacrado. Uma conta nova pode abrir Coleção e encontrá-la vazia antes da abertura. `PlayerPackService` lê instâncias próprias e solicita `openPack({packInstanceId})`; somente o backend autenticado escolhe o conteúdo, usando a versão fixa da instância.

A abertura **soma** à propriedade existente. Se uma carta tinha uma cópia e o pack fornece duas, o novo total é três. A primeira data existente é preservada; `lastAcquiredAt` recebe a data do commit. Entradas fora do conteúdo permanecem intactas. Se qualquer soma ultrapassar 9999 ou houver configuração/carta/entrada inválida, nenhum item é gravado e o pack permanece lacrado. Coleção, estado opened, data e snapshot são persistidos no mesmo commit; não há sucesso parcial.

Nova chamada, retry ou duas abas não concedem novamente. O estado opened é verificado no backend; uma repetição retorna o mesmo `revealedCards` persistido. Transações concorrentes são repetidas pelo Firestore e a segunda observa a abertura concluída. Mudança da versão atual não altera conteúdo do pack histórico nem permite outro starter. A gestão manual continua definindo **total absoluto**, diferente dessa soma.

O layout monta `/game/colecao` somente depois de inicialização bem-sucedida ou `alreadyInitialized`, quando já existe a instância lacrada/aberta. Após a abertura, o link do resumo monta a coleção com leitura nova do servidor; **Atualizar coleção** também relê quantidades de uma tela já montada. Não há inventário duplicado em estado global nem atualização realtime entre abas. Logout/troca de UID descarta respostas antigas, sem cancelar uma transação já aceita no servidor.

## Carta indisponível e falha de leitura

Se a carta foi retirada de publicação, excluída ou sua leitura foi negada, a entrada de propriedade permanece e a junção retorna `card: null`. A UI informa indisponibilidade sem revelar nome, raridade, arte ou outros dados protegidos. Admin pode remover essa entrada; alterar sua quantidade positiva exige que a carta esteja publicada.

Somente ausência/negação de acesso é tratada como indisponibilidade. Erros de rede e outras falhas de leitura chegam ao estado de erro com nova tentativa, sem fingir que a carta deixou de existir. Uma imagem ausente ou falha no download também não remove a propriedade.

## Experiência do jogador

`CollectionComponent` mostra carregamento, erro com retry, coleção vazia, cartas indisponíveis, ausência de resultados e grid responsivo preenchido com nome, raridade e quantidade. **Atualizar coleção** relê do servidor e descarta as imagens anteriores; troca de UID ou sessão inválida limpa os dados e ignora respostas antigas.

Busca é local por nome/tipo/subtipo, desconsiderando caixa e diacríticos; combina com filtro de raridade usando as constantes do contrato. Não há consulta Firestore por tecla. O contador de cartas diferentes considera IDs disponíveis; a quantidade total soma todas as entradas de propriedade, inclusive indisponíveis. Um contador separado informa os IDs indisponíveis, sem metadados protegidos. Nenhuma estatística de nível, XP ou jogo é criada.

`PlayerCardPreviewComponent` solicita o PNG próximo da área visível com IntersectionObserver (margem de 200px), ou imediatamente quando essa API não está disponível. Apresenta loading, erro e retry; ignora respostas antigas e libera object URLs ao trocar entrada, ocorrer erro de imagem ou destruir o componente. Download já iniciado por `getBlob` não é abortado pela UI. Não há Stage Konva por item.

Coleção, reveal e resumo de pacote usam o mesmo componente. Falhas conservam o código em `PublishedCardPreviewError`, com `cardId`, caminho determinístico, mensagem segura e erro original em `cause` quando disponível. A interface diferencia:

| Código | Mensagem ao jogador |
| --- | --- |
| `storage/object-not-found` | A imagem desta carta ainda não foi publicada. |
| `storage/unauthorized` | Sua conta não possui autorização para carregar esta imagem. |
| `storage/unauthenticated` | Sua sessão precisa ser renovada para carregar esta imagem. |
| `storage/retry-limit-exceeded` ou falha de rede reconhecida | Não foi possível baixar a imagem. Confira sua conexão. |
| `preview-invalid`, incluindo MIME/tamanho inválido ou falha de exibição | A imagem publicada desta carta está inválida. |
| Desconhecido | Não foi possível carregar a imagem publicada. Tente novamente. |

Em desenvolvimento, o console registra `[Deckfall preview]` e somente `{cardId, path, code}`. Não registra causa original, mensagens SDK, tokens ou URLs de download. No cache compartilhado do pack, uma Promise rejeitada ou uma imagem que falha ao exibir é removida, permitindo que **Tentar novamente** faça novo download.

## Gestão administrativa

Em `/admin/usuarios/editar/:uid`, a seção de coleção é separada do formulário de perfil e só aparece após encontrar `users/{uid}`. O administrador escolhe uma carta publicada e define a quantidade total possuída: mudar de 2 para 3 resulta em 3, sem somar mais 3 cópias. Pode alterar o total ou remover a entrada após confirmação; a remoção não exclui `cards/{cardId}`.

Cadastro prepara identidade/perfil. A primeira entrada em `/game` solicita um pack lacrado e exige definição/versão ativa válida; o botão de abertura solicita uma operação validada pelo backend, sem escolha arbitrária de cartas ou reconcessão. Correções de propriedade continuam disponíveis na gestão manual, sem apagar marcador/instância ou resultado. Definições/versões são geridas em `/admin/pacotes`; **Configurar StarterPack** seleciona o conteúdo do inicial com nome dedicado, sem conceder propriedade nessa administração. Veja [gestão de usuários](usuarios.md) e [configuração do starter](pacotes.md#configurar-o-starter).

## Imagem publicada e assets privados

| Caminho Storage | Uso e acesso |
| --- | --- |
| `cards/{cardId}/art/*` e `cards/{cardId}/assets/*` | Originais editáveis, somente admin |
| `templates/{templateId}/assets/*` | Assets de templates, somente admin |
| `published-cards/{cardId}/preview.png` | PNG completo achatado, leitura autenticada de carta publicada |

O PNG usa caminho determinístico e permite overwrite administrativo. Deve ser não vazio, declarar `image/png` e ter no máximo 20 MiB: limite técnico separado dos 5 MiB de assets, dimensionado para o canvas máximo de 2048×2048. Rules validam MIME declarado/tamanho, sem inspeção profunda do conteúdo. A imagem representa a carta; `CardCanvasData` continua sendo sua fonte editável.

Storage permite somente `get` da preview para uma conta com perfil `member` ou `admin`, `role == roleId` e carta existente `published`; não libera listagem do namespace. A autorização da imagem consulta perfil e carta, sem exigir propriedade na coleção. Esses são os dois documentos usados no orçamento de avaliação das [Rules Storage com Firestore](https://firebase.google.com/docs/storage/security/rules-conditions). Criação/substituição exigem admin e carta publicada; delete exige admin.

`PublishedCardStorageService` usa `getBlob`, sem `getDownloadURL` ou URLs com token persistidas. Upload envia `cacheControl: private, no-store`. Downloads diretos seguem Rules e dependem também do CORS do bucket, conforme [a documentação Firebase](https://firebase.google.com/docs/storage/web/download-files) e [o guia local](configuracao-cors-storage.md). O componente do jogador consome esse PNG; não reconstrói Konva nem baixa assets administrativos.

O fluxo administrativo é diferente: editor e galeria geram a composição usando assets privados e o renderer existente. Ver a carta correta no admin não comprova que o PNG publicado exista ou possa ser baixado por um member.

O adapter chama `getBlob(reference)` sem o argumento opcional de tamanho. No SDK Firebase instalado, esse argumento aciona `Blob.slice` sem preservar MIME. O serviço valida o Blob recebido sem forçar `image/png`: exige Blob real, MIME `image/png`, tamanho positivo e até 20 MiB. O limite é conferido após o download; Rules e upload administrativo também limitam os objetos novos, mas o cliente não interrompe preventivamente a transferência de um objeto remoto maior criado por acesso privilegiado.

## Sincronização após salvar e excluir

Após confirmar o documento, `CardService` chama `PublishedCardPreviewService`. Para `published`, ele relê a carta, reutiliza `CardPreviewService` e o renderer existente para gerar PNG, compara status/`updatedAt` antes do upload e confere novamente depois. Para `draft`/`archived`, tenta excluir a imagem com verificação de versão antes/depois. Na exclusão, confirma ausência do documento antes/depois do cleanup, avisando se a carta foi recriada.

Falha de renderização, upload ou limpeza posterior não desfaz a gravação confirmada. Salvamento retorna avisos em `CardSaveResult.warnings`, exibidos como alertas; na criação, eles acompanham a navegação para edição do novo ID. Falha de limpeza após exclusão informa que o documento já foi excluído. Avisos de sincronização/cleanup não repetem mensagens brutas do SDK e conservam o código seguro disponível. A imagem pode ficar ausente/desatualizada: reabrir e salvar a versão publicada atual permite tentar novamente, assim como a ferramenta administrativa abaixo.

Firestore e Storage não são atômicos. As verificações detectam corridas, mas uma janela residual entre consulta e operação Storage pode deixar imagem ausente/desatualizada; não há reconciliação backend. Quando o documento passa a draft/archived ou é excluído, Rules negam novos downloads independentemente da limpeza. Bytes já baixados e object URLs não são apagados remotamente; o lifecycle do componente libera suas URLs ao trocar/destruir a apresentação.

Leitura integral da coleção, uma resolução de carta por entrada, downloads/memória e futura paginação estão registrados em [riscos](riscos-e-dividas-tecnicas.md).

## Reparar previews publicadas

Em `/admin/cartas/lista`, **Sincronizar previews publicadas** relê o catálogo no servidor e seleciona somente cartas `published`. **Regenerar preview** faz o mesmo para uma carta da lista. `PublishedCardPreviewService.repairPublished` remove IDs duplicados e processa uma carta por vez pelo mesmo renderer e upload usados após salvar; a ação explícita regenera o PNG, inclusive quando já existe.

Cada carta é relida e sua versão é conferida antes/depois do upload. O resultado mostra nome, caminho e estado **Sincronizada**, **Falha** ou **Ignorada**. Retirada/exclusão antes da geração ignora a entrada sem alterar arquivos; alteração concorrente impede anunciar sucesso. Falhas não interrompem as demais cartas. Sair da página impede iniciar os próximos itens; uma operação já iniciada pode terminar.

O reparo escreve somente o PNG achatado no namespace publicado. Não salva documentos de cartas, altera gameplay/coleção/packs, duplica canvas, grava URLs no Firestore nem publica assets privados. A lista bloqueia outro reparo, atualização e exclusão durante o lote. Cartas antigas podem receber o PNG por essa ação, sem reabrir/salvar cada documento; não existe reconciliação backend automática.

## Diagnóstico de 15/10/2026

A causa confirmada no cliente foi o uso de `getBlob(reference, limite)` com Firebase 10.14.1: `getBlobInternal` em `node_modules/@firebase/storage/dist/index.esm2017.js` retorna `blob.slice(0, maxDownloadSizeBytes)` quando há limite. Sem o terceiro argumento de `slice`, o Blob resultante fica com `type: ''`, mesmo quando o download original é `image/png`; a validação estrita recusava a preview válida. O adapter passou a omitir esse argumento e manteve as validações posteriores. O teste `published-card-storage-sdk.spec.ts` exercita o SDK instalado e um Blob PNG nativo no Chrome, com transporte local isolado; não usa sessão de produção.

Além disso, o wrapper anterior destruía `error.code` ao criar um `Error` genérico, e o componente mostrava a mesma mensagem para todas as falhas. O contrato tipado e a distinção acima preservam a observabilidade sem expor credenciais. Essa perda de informação era um segundo defeito, separado da perda de MIME.

A leitura remota somente leitura encontrou o seguinte para Nyra:

| Evidência | Valor observado |
| --- | --- |
| Documento | `cards/46f5c359-0d1e-423e-911e-4ba592567405`, `status: published` |
| `updatedAt` | `2026-10-14T22:27:37.186Z` |
| Objeto existente | `published-cards/46f5c359-0d1e-423e-911e-4ba592567405/preview.png` |
| MIME, tamanho e dimensões | `image/png`, 2.575.604 bytes, 1086 × 1448 |
| `generation` / `updated` | `1792016860478126` / `2026-10-14T22:27:40.508Z` |
| Cache | `private, no-store` |
| GET exato com OAuth da CLI | HTTP 206, PNG e `Access-Control-Allow-Origin` correspondente a cada uma das duas origens |

As Rules publicadas de Firestore e Storage correspondiam às locais; a permissão IAM da integração Storage Rules → Firestore estava presente. O Auth retornou `localhost`, `cardgame-6fdcb.firebaseapp.com`, `cardgame-6fdcb.web.app` e `deckfall.web.app` nos Authorized domains. Nenhuma dessas configurações foi alterada nesta correção.

O proprietário relatou que voltou a funcionar no localhost; o perfil remoto da conta informada era `admin/admin`. O relato não identificou individualmente coleção, reveal ou resumo, nem trouxe o request Network. Portanto, permanecem pendentes o teste de member real, a confirmação de cada etapa e o registro de HTTP/código Firebase/MIME no navegador. O GET com OAuth da CLI não mede a Storage Rule para esse member. Não houve novo deploy; a disponibilização da correção no domínio hospedado exige publicar o Hosting após autorização.

## Localhost, domínio e erro de permissão

Por padrão, o desenvolvimento utiliza o Firebase configurado no environment, como o domínio publicado; emuladores exigem opção explícita e projeto `demo-` em localhost. O fluxo isolado de Auth/Firestore/Storage/Functions está em [pacotes](pacotes.md#localhost-isolado). Alterar um arquivo `.rules` local não muda a autorização remota. Em 13/10/2026, as duas Functions, Firestore Rules e Hosting de pacotes/administração foram publicados e conferidos com autorização. Em 14/10, Nyra foi publicada e o StarterPack ativado com uma cópia dela. Para outros ambientes sem conteúdo inicial válido, o gate informa preparação pendente em vez de conceder propriedade vazia. O estado e os limites da verificação de 15/10 estão registrados acima.

Em 12/10/2026, a leitura das releases confirmou que as Rules ativas ainda eram anteriores à coleção e não continham `published-cards`. A carta do relato estava em `draft`: o save foi confirmado no Firestore, mas o cleanup da preview recebeu `storage/unauthorized`, mesmo podendo não existir arquivo. Depois da autorização, as duas Rules e o Hosting foram publicados; a conferência posterior confirmou o conteúdo esperado.

O aviso agora distingue falha de remoção de falha de sincronização. Em `storage/unauthorized`/`storage/unauthenticated`, orienta conferir Rules publicadas e perfil administrativo antes de repetir. Para gerar uma imagem destinada ao jogador, salvar com status **Publicada**; um rascunho continua privado e apenas tenta remover sua representação anterior. A publicação técnica não altera automaticamente o status das cartas.
