# Coleção do jogador

`/game/colecao` consulta a propriedade de cartas concedidas pelo Player Bootstrap ou manualmente por administradores. Ao entrar em `/game`, o backend concede uma única vez a Starter Collection default configurada. O jogador continua sem escrita direta na própria coleção; não há packs, recompensas periódicas, economia, decks funcionais ou gameplay. Veja [Player Bootstrap](player-bootstrap.md).

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

## Starter Collection e soma única

`PlayerInitializationService` não grava coleção: solicita a Callable `initializePlayer` com dados vazios. O backend lê o UID autenticado, perfil, player, definição default, cartas publicadas e entradas correspondentes numa transação Firestore. Somente depois de validar tudo grava quantidades e `players/{uid}.starterGrantedAt` no mesmo commit.

Starter **soma** à propriedade existente. Se uma carta tinha uma cópia e o starter concede duas, o novo total é três. A primeira data existente é preservada; `lastAcquiredAt` recebe a data do commit. Entradas fora do starter permanecem intactas. Se qualquer soma ultrapassar 9999 ou houver configuração/carta/entrada inválida, nenhum item nem o marcador são gravados.

Nova chamada, retry ou duas abas não concedem novamente. O marcador é verificado no backend; transações concorrentes são repetidas pelo Firestore e a segunda observa o estado inicializado. Mudança da versão do starter não permite nova concessão. A gestão manual continua definindo **total absoluto**, diferente dessa soma inicial.

O layout monta `/game/colecao` somente depois de inicialização bem-sucedida ou `alreadyInitialized`; a leitura sob demanda do serviço existente já observa o commit confirmado. Não há duplicação de inventário no estado global. Logout/troca de UID descarta respostas antigas na apresentação, sem cancelar uma transação que já foi aceita no servidor.

## Carta indisponível e falha de leitura

Se a carta foi retirada de publicação, excluída ou sua leitura foi negada, a entrada de propriedade permanece e a junção retorna `card: null`. A UI informa indisponibilidade sem revelar nome, raridade, arte ou outros dados protegidos. Admin pode remover essa entrada; alterar sua quantidade positiva exige que a carta esteja publicada.

Somente ausência/negação de acesso é tratada como indisponibilidade. Erros de rede e outras falhas de leitura chegam ao estado de erro com nova tentativa, sem fingir que a carta deixou de existir. Uma imagem ausente ou falha no download também não remove a propriedade.

## Experiência do jogador

`CollectionComponent` mostra carregamento, erro com retry, coleção vazia, cartas indisponíveis, ausência de resultados e grid responsivo preenchido com nome, raridade e quantidade. **Atualizar coleção** relê do servidor e descarta as imagens anteriores; troca de UID ou sessão inválida limpa os dados e ignora respostas antigas.

Busca é local por nome/tipo/subtipo, desconsiderando caixa e diacríticos; combina com filtro de raridade usando as constantes do contrato. Não há consulta Firestore por tecla. O contador de cartas diferentes considera IDs disponíveis; a quantidade total soma todas as entradas de propriedade, inclusive indisponíveis. Um contador separado informa os IDs indisponíveis, sem metadados protegidos. Nenhuma estatística de nível, XP ou jogo é criada.

`PlayerCardPreviewComponent` solicita o PNG próximo da área visível com IntersectionObserver (margem de 200px), ou imediatamente quando essa API não está disponível. Apresenta loading, erro e retry; ignora respostas antigas e libera object URLs ao trocar entrada, ocorrer erro de imagem ou destruir o componente. Download já iniciado por `getBlob` não é abortado pela UI. Não há Stage Konva por item.

## Gestão administrativa

Em `/admin/usuarios/editar/:uid`, a seção de coleção é separada do formulário de perfil e só aparece após encontrar `users/{uid}`. O administrador escolhe uma carta publicada e define a quantidade total possuída: mudar de 2 para 3 resulta em 3, sem somar mais 3 cópias. Pode alterar o total ou remover a entrada após confirmação; a remoção não exclui `cards/{cardId}`.

Cadastro prepara identidade/perfil. A primeira entrada em `/game` solicita o starter ao backend e exige configuração ativa válida; não existe botão arbitrário de obter cartas ou conceder o starter novamente. Correções de propriedade continuam disponíveis na gestão manual, sem apagar o marcador. A definição default é gerida no Console, sem nova tela administrativa nesta fase. Veja [gestão de usuários](usuarios.md) e [configuração do starter](player-bootstrap.md).

## Imagem publicada e assets privados

| Caminho Storage | Uso e acesso |
| --- | --- |
| `cards/{cardId}/art/*` e `cards/{cardId}/assets/*` | Originais editáveis, somente admin |
| `templates/{templateId}/assets/*` | Assets de templates, somente admin |
| `published-cards/{cardId}/preview.png` | PNG completo achatado, leitura autenticada de carta publicada |

O PNG usa caminho determinístico e permite overwrite administrativo. Deve ser não vazio, declarar `image/png` e ter no máximo 20 MiB: limite técnico separado dos 5 MiB de assets, dimensionado para o canvas máximo de 2048×2048. Rules validam MIME declarado/tamanho, sem inspeção profunda do conteúdo. A imagem representa a carta; `CardCanvasData` continua sendo sua fonte editável.

Storage permite somente `get` da preview para uma conta com perfil `member` ou `admin`, `role == roleId` e carta existente `published`; não libera listagem do namespace. A autorização da imagem consulta perfil e carta, sem exigir propriedade na coleção. Esses são os dois documentos usados no orçamento de avaliação das [Rules Storage com Firestore](https://firebase.google.com/docs/storage/security/rules-conditions). Criação/substituição exigem admin e carta publicada; delete exige admin.

`PublishedCardStorageService` usa `getBlob`, sem `getDownloadURL` ou URLs com token persistidas. Upload envia `cacheControl: private, no-store`. Downloads diretos seguem Rules e dependem também do CORS do bucket, conforme [a documentação Firebase](https://firebase.google.com/docs/storage/web/download-files) e [o guia local](configuracao-cors-storage.md). O componente do jogador consome esse PNG; não reconstrói Konva nem baixa assets administrativos.

## Sincronização após salvar e excluir

Após confirmar o documento, `CardService` chama `PublishedCardPreviewService`. Para `published`, ele relê a carta, reutiliza `CardPreviewService` e o renderer existente para gerar PNG, compara status/`updatedAt` antes do upload e confere novamente depois. Para `draft`/`archived`, tenta excluir a imagem com verificação de versão antes/depois. Na exclusão, confirma ausência do documento antes/depois do cleanup, avisando se a carta foi recriada.

Falha de renderização, upload ou limpeza posterior não desfaz a gravação confirmada. Salvamento retorna avisos em `CardSaveResult.warnings`; falha de limpeza após exclusão informa que o documento já foi excluído. A imagem pode ficar ausente/desatualizada: reabrir e salvar a versão publicada atual permite tentar novamente. Cartas publicadas anteriormente não recebem backfill automático; precisam ser salvas para gerar sua representação.

Firestore e Storage não são atômicos. As verificações detectam corridas, mas uma janela residual entre consulta e operação Storage pode deixar imagem ausente/desatualizada; não há reconciliação backend. Quando o documento passa a draft/archived ou é excluído, Rules negam novos downloads independentemente da limpeza. Bytes já baixados e object URLs não são apagados remotamente; o lifecycle do componente libera suas URLs ao trocar/destruir a apresentação.

Leitura integral da coleção, uma resolução de carta por entrada, downloads/memória e futura paginação estão registrados em [riscos](riscos-e-dividas-tecnicas.md). Após autorização do proprietário, Rules e Hosting foram publicados e conferidos; CORS das duas origens e a integração IAM Storage → Firestore estavam configurados. Isso não constitui teste de uma sessão Firebase Authentication real.

## Localhost, domínio e erro de permissão

Por padrão, o desenvolvimento utiliza o Firebase configurado no environment, como o domínio publicado; emuladores exigem opção explícita e projeto `demo-` em localhost. O fluxo isolado de Auth/Firestore/Storage/Functions está em [Player Bootstrap](player-bootstrap.md). Alterar um arquivo `.rules` local não muda a autorização remota. As novas Functions e Rules desta fase não foram publicadas; antes de deploy autorizado, o frontend apontado ao Firebase real apresenta erro honesto ao não encontrar o backend.

Em 12/10/2026, a leitura das releases confirmou que as Rules ativas ainda eram anteriores à coleção e não continham `published-cards`. A carta do relato estava em `draft`: o save foi confirmado no Firestore, mas o cleanup da preview recebeu `storage/unauthorized`, mesmo podendo não existir arquivo. Depois da autorização, as duas Rules e o Hosting foram publicados; a conferência posterior confirmou o conteúdo esperado.

O aviso agora distingue falha de remoção de falha de sincronização. Em `storage/unauthorized`/`storage/unauthenticated`, orienta conferir Rules publicadas e perfil administrativo antes de repetir. Para gerar uma imagem destinada ao jogador, salvar com status **Publicada**; um rascunho continua privado e apenas tenta remover sua representação anterior. A publicação técnica não altera automaticamente o status das cartas.
