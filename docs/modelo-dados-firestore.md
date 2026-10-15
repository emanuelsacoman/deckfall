# Modelo Firestore

As Rules privilegiam autorização, status, timestamps, quantidade/faixas numéricas dos atributos e envelope do canvas, mantendo o limite de avaliação do Firestore. Limites de textos, chaves/rótulos/IDs de atributos, metadados visuais e propriedades profundas são verificados pelos validators do cliente antes de gravar ou reconstruir o editor; não são uma promessa de validação exaustiva pelo servidor.

Contratos ficam em `model/interfaces`. IDs pertencem ao caminho e são acrescentados na leitura; não precisam ser duplicados no documento. Timestamps persistidos são de servidor. Não armazenar File, Blob, Base64, URLs de download, nós Konva, listeners ou histórico no Firestore.

## `users/{uid}`

Perfil com `displayName`, `contactEmail`, `role`, `roleId`, `createdAt` e `updatedAt`. Nome/contato podem ser vazios, limitados a 120/254 caracteres. Papéis aceitos: `admin` e `member`, sempre iguais nos dois campos.

Cadastro autenticado cria somente o próprio perfil member, com e-mail de contato igual ao e-mail do token e timestamps de servidor. Um perfil existente nunca é sobrescrito automaticamente pelo login. O bootstrap mínimo antigo, apenas role/roleId, continua legível; edição completa recebe updatedAt e preserva createdAt ou sua ausência.

Admin lê/lista/vincula/edita perfis. Um autenticado lê o próprio perfil; membros não fazem update nem se promovem. Exclusão de perfis e rebaixamento do próprio admin são negados pelas Rules. `contactEmail` não altera a credencial Auth. A lista não representa todas as contas Authentication; veja [usuários](usuarios.md) e [autenticação](autenticacao-e-admin.md).

## `users/{uid}/collection/{cardId}`

Propriedade da carta, separada de seus dados e design. `PlayerCardCollectionEntry` acrescenta `cardId` do caminho na leitura; o documento não duplica ID, nome, raridade, atributos, arte ou canvas.

| Campo persistido | Contrato |
| --- | --- |
| quantity | Inteiro positivo de 1 a 9999; limite técnico, sem relação com decks |
| firstAcquiredAt | Timestamp de servidor na criação; imutável no update |
| lastAcquiredAt | Timestamp de servidor na criação e em toda definição de quantidade |

Somente esses três campos são aceitos pelas Rules. Zero remove o documento; não é persistido. Criação exige as duas datas iguais a `request.time`; update preserva a primeira e exige a última igual a `request.time`.

Member com perfil válido lê/lista apenas a própria coleção; admin lê coleções de perfis existentes e é o único cliente com writes permitidos pelas Rules. Criação/update pelo SDK cliente exigem `users/{uid}` existente e `cards/{cardId}` existente com `status == published`. Delete administrativo dispensa a existência da carta/perfil, para permitir limpeza de propriedade órfã. O serviço/UI exigem o perfil carregado para suas operações.

`PlayerOwnedCard` é uma junção local com `card: Card | null`, nunca persistida. Carta retirada/excluída ou negada pode permanecer como propriedade indisponível, sem exposição dos dados protegidos. Cadastro/bootstrap não gravam entradas: `initializePlayer` concede um Starter Pack lacrado e `openPack` soma cartas em transação, conforme [pacotes](pacotes.md). O Admin SDK ignora Rules; a operação repete validação de perfil, carta, quantidade e datas no servidor. A gestão manual administrativa permanece pelo contrato atual. Veja [coleção](colecao.md) para transações, concorrência e imagens publicadas.

Antes de somar uma entrada existente na abertura, o backend exige os três campos exatos, datas Timestamp e `firstAcquiredAt <= lastAcquiredAt <= relógio do backend`. Datas futuras, fora de ordem ou soma acima de 9999 impedem toda a abertura, mantendo o pacote lacrado. Não há varredura de entradas fora do conteúdo do pack.

## `players/{uid}`

Estado mínimo do jogador, separado de identidade/autorização em `users/{uid}`. O UID vem do caminho; não é duplicado. Não há moedas, XP, nível, placar, deck selecionado ou outros campos de sistemas futuros.

| Campo persistido | Contrato |
| --- | --- |
| createdAt | Timestamp de servidor na criação; preservado na inicialização de documento existente válido |
| updatedAt | Timestamp de servidor do commit da primeira concessão do pack |
| starterGrantedAt | Timestamp do commit da concessão da instância; null em estado válido ainda não concedido |
| starterVersion | Versão inteira do Starter Pack concedido, entre 1 e 1000000; presente após concessão |
| starterPackInstanceId | `starter`, ID da instância no caminho do titular; presente após concessão |

`initializePlayer` cria o documento com marcador no mesmo commit de `users/{uid}/packs/starter` lacrado, sem ler/escrever coleção. Não cria player vazio quando configuração/carta for inválida. Versão, instância e `starterGrantedAt` auditam a concessão; versão nova da definição não concede outro starter. A abertura não altera esse marcador.

Ao ler player existente, a operação exige campos exatos e `createdAt <= updatedAt <= relógio confiável do backend`. Sem concessão, `starterGrantedAt` é null e versão/instância devem estar ausentes. Com concessão, ambos são obrigatórios e `createdAt <= starterGrantedAt <= updatedAt`. A instância precisa existir com a mesma versão e `acquiredAt == starterGrantedAt`. Um estado inválido, inclusive antigo sem ID de pack ou com data futura, falha sem writes; não é tratado como inicialização concluída nem reconcedido automaticamente.

Rules permitem get próprio para member/admin com perfil válido e get/list administrativo. Create/update/delete são negados a todos os clientes, inclusive admin; a escrita pertence ao backend Admin SDK. Anônimo, perfil ausente/inválido e leitura de outro jogador por member são negados. Não há endpoint de reset/regrant.

## `packDefinitions/{packId}`

Configuração administrativa gerenciada em `/admin/pacotes`, atualmente consumida pelo jogador somente com `packId == starter`, sem loja ou preço. Outras definições permanecem no catálogo administrativo, sem concessão/distribuição implementada.

| Campo persistido | Contrato |
| --- | --- |
| name | String não vazia, até 120 caracteres |
| description | String até 1000; pode ser vazia |
| active | Boolean; true permite novas concessões |
| currentVersion | Inteiro de 1 a 1000000; escolhe versão para novas instâncias |
| createdAt / updatedAt | Timestamps ordenados; createdAt preservado na edição |

Rules permitem somente admin get/list/create/update, com campos exatos e timestamps de servidor de escrita. A definição `starter` exige nome exato `StarterPack`; outras não podem usar variantes desse nome com caixa, espaços, `_` e `-`. O ID não é renomeado. Delete é negado. Members/anônimos não precisam ler a definição para mostrar suas instâncias. Inexistência/inatividade/configuração inválida impede bootstrap, sem writes. Desativar definição não revoga um pack concedido; abertura usa sua versão fixa e ainda exige definição válida. `/admin/pacotes` administra essas configurações sem criar instâncias nem conceder conteúdo.

## `packDefinitions/{packId}/versions/{version}`

| Campo persistido | Contrato |
| --- | --- |
| version | Inteiro de 1 a 1000000, igual ao ID decimal canônico do documento |
| cards | De 1 a 25 mapas contendo somente `{cardId, quantity}` |
| createdAt | Timestamp de criação |

Cada `cardId` segue `[a-zA-Z0-9_-]{1,128}` e `quantity` é inteiro de 1 a 9999. IDs únicos; múltiplas cópias usam quantity. Functions validam todos os itens, campos exatos, duplicatas, existência e `published` das cartas, tanto ao conceder quanto ao abrir. Sem randomização. Nome/raridade são capturados da carta corrente na abertura, não da versão.

Admin cliente lê/lista/cria versões somente sob definição existente após o commit (`existsAfter`), com Timestamp de servidor. Isso permite criar definição e versão 1 em uma transação. Update/delete são negados para todas as versões, inclusive admin. Rules validam envelope, limite da lista, versão/caminho/data, sem validação profunda de cada item ou carta. `PackDefinitionService` verifica conteúdo/cartas publicadas, versão de origem ainda atual e colisões de versão e cria uma nova versão junto do avanço de `currentVersion`; metadados ou rascunhos de versão desatualizados são recusados. Console e Admin SDK ignoram Rules: preservar conteúdo histórico é obrigação operacional; revalidação não substitui um hash/cópia imutável. Nunca editar uma versão histórica para alterar instâncias existentes.

## `users/{uid}/packs/{packInstanceId}`

| Campo persistido | Contrato |
| --- | --- |
| packId | `starter` nesta etapa |
| definitionVersion | Versão inteira concedida; nunca substituída por currentVersion ao abrir |
| source | `starter` |
| state | `sealed` ou `opened` |
| acquiredAt | Timestamp de servidor da concessão; preservado |
| openedAt | null enquanto lacrado; Timestamp de servidor da abertura |
| revealedCards | Ausente em sealed; lista de 1 a 25 snapshots em opened |

Cada snapshot contém somente `{cardId, name, rarity, quantity}`. Raridade usa common/rare/epic/legendary; nome até 120, quantidade de 1 a 9999, IDs sem duplicatas. Não persiste preview, assets, canvas ou atributos. O ID acrescentado como `PlayerPack.id` na leitura não é duplicado no documento.

A instância starter tem ID determinístico `starter`, isolado por UID. `openPack` consulta a instância exclusivamente no caminho autenticado; valida auditoria com player e, antes da primeira abertura, definição/versão/cartas/entradas existentes. Coleção e estado/data/snapshot da abertura são gravados no mesmo commit. Retry/concorrência retornam o resultado persistido sem somar novamente. Pacote já aberto pode ser revisto mesmo após retirar uma carta; novo download de sua preview continua sujeito ao status atual.

Member válido get/list somente próprios; admin lê packs de perfis existentes. Create/update/delete são negados a todos os clientes, inclusive admin. Escrita pelo backend Admin SDK exige validação própria. Anônimo/perfil inválido e acesso de member a outro UID são negados. Veja [pacotes](pacotes.md) para payload, abertura e erros.

O caminho antigo `starterCollections/default` não é mais lido/escrito, não possui match de acesso e não concorre com o starter novo. Não houve migração de produção: o bootstrap anterior ainda era local. Dados antigos dos emuladores podem ser descartados/recriados; não existe reset/regrant remoto.

## `cards/{cardId}`

Campos base obrigatórios nas gravações: `name`, `slug`, `description`, `rarity`, `status`, `art`, `attributes`, `setId`, `createdAt`, `updatedAt`. Campos novos opcionais: `type`, `subtype`, `templateId`, `canvas`.

| Campo | Contrato |
| --- | --- |
| name / slug | Nome obrigatório; slug derivado. Até 120 caracteres |
| description | Até 5000 caracteres |
| rarity | common, rare, epic, legendary |
| status | draft, published, archived |
| art | null ou metadados `{storagePath,fileName,contentType,size}` da arte principal |
| attributes | Lista genérica, até 8 atributos |
| setId | String até 128 ou null; sets não implementados |
| type / subtype | String até 80 ou null, quando presentes |
| templateId | ID até 128 ou null, quando presente |
| canvas | CardCanvasData versão 1, quando presente |
| createdAt / updatedAt | Timestamps de servidor; createdAt imutável |

Atributos usam `{key,label,value}` e podem incluir `{id,min,max,icon,color}`. Sem min/max, a faixa é 0–100. Limites personalizados ficam dentro de ±1.000.000, min < max e valor finito na faixa. Chave até 40, minúscula seguida de letras/números/_/-, rótulo até 60, ID até 128, ícone até 32 e cor validada pelo cliente. IDs/chaves únicos são validados no cliente. Não existe dependência obrigatória dos quatro atributos iniciais.

## Canvas versionado

```text
canvas
  version: 1
  width, height
  background: {kind,color,color2,angle,assetId}
  elements: CardCanvasElement[]
  assets: {id,storagePath,fileName,contentType,size}[]
```

Elementos possuem ID/nome/tipo, geometria, opacidade, visible/locked e properties tipadas. Tipos atuais: text, icon, rect, circle, line, image, artwork, attribute, bar, frame, emblem. A ordem do array determina z-order. Bindings seguros usam campos conhecidos e `attributes.<key>`; conteúdo completo fica em [editor](editor-de-cartas.md).

Personalização acrescenta somente campos opcionais em `properties`: `borderStyle` nos estilos; `textDecoration`/`verticalAlign` em texto/ícone/atributo; `flipX`, `flipY`, `brightness`, `contrast`, `saturation` e `hue` em imagem/artwork. Canvas continua versão 1; a validação preserva a ausência desses campos em documentos antigos e rejeita valores fornecidos fora dos contratos. Defaults de renderização e faixas ficam em [personalização visual](editor-de-cartas.md#personalização-visual). Filtros, pixels em cache e atributos internos Konva não são persistidos.

Ornamentos acrescentam dois tipos à union do canvas v1, sem campos obrigatórios novos nos tipos anteriores:

| Tipo | `properties`, além do estilo compartilhado |
| --- | --- |
| frame | `frameStyle` (ornate/runic/minimal), `motif`, `borderWidth` (2–128), `cornerRadius` (0–4096), `detail` inteiro (0–12), `seed` inteiro (0–999999), `accentColor`, `gemColor` |
| emblem | `motif`, `container` (medallion/shield/plain), `accentColor`, `gemColor`, `relief` (0–1) |

`motif` aceita flame, leaf, crystal, sun, moon, skull, heart, sword, shield, drop, bolt e star. Cores usam a validação compartilhada. Tema é um preset local que materializa cores/propriedades; não há coleção nova nem ID de tema obrigatório. O documento persiste parâmetros vetoriais, sem caminhos Konva/SVG, imagem derivada ou binário. Renderização reconstrói o acabamento a partir desses valores. Cartas anteriores continuam válidas; clientes anteriores que não conhecem os tipos novos os rejeitam. Veja [o ateliê](editor-de-cartas.md#ateliê-de-molduras-e-emblemas).

Limites do cliente: dimensões 160–2048, 64 elementos, 24 assets e documento estruturado até 128 KiB. Fontes/cores/crop/faixas/IDs/referências são validados profundamente antes da persistência/importação. Assets locais podem ter storagePath null; a gravação final pelo serviço exige arquivos materializados no namespace do proprietário.

`firestore.indexes.json` isenta `canvas` de índices de campo único em cards/cardTemplates. O editor não consulta geometria ou propriedades internas. Consultas atuais usam updatedAt; não foram adicionados índices compostos.

## `cardTemplates/{templateId}`

Campos: `name`, `canvas`, `attributes`, `createdAt`, `updatedAt`. Nome obrigatório até 120; canvas e atributos usam os mesmos contratos. ID é acrescentado na leitura. Templates são administrativos, sem catálogo público. O template local Fantasy Basic não é criado automaticamente na coleção.

Salvar uma carta baseada em template preserva templateId como associação e copia assets ao namespace da carta quando necessário. O documento de carta contém seu canvas editável; renderização não exige buscar continuamente o template original.

## Regras e garantias

Cards publicados têm leitura pública de metadados; admin lê todos e é o único que escreve. Templates exigem admin para leitura/escrita. Storage exige admin para artes/assets, aceita imagens declaradas PNG/JPEG/WebP até 5 MiB, exige documento proprietário no upload e bloqueia overwrite.

Representação de apresentação fica somente no Storage em `published-cards/{cardId}/preview.png`, sem campo novo em `Card`, canvas ou coleção. PNG não vazio até 20 MiB admite overwrite administrativo, condicionado à carta publicada. Get exige sessão e perfil member/admin consistente, mais carta existente `published`; listagem do namespace e acesso anônimo são negados. Delete exige admin. Assets editáveis e templates continuam privados. Veja [cartas](cartas.md) e [coleção](colecao.md).

Rules validam campos base, raridade/status, timestamps, atributos numéricos/ranges e envelope do canvas: versão, dimensões, background estrutural, até 64 elementos e 24 assets. Não fazem a validação profunda de toda union de elementos, IDs/metadados de cada asset ou todos os valores visuais. O limite de 128 KiB e validação profunda são garantias do cliente, não devem ser anunciados como enforcement completo das Rules. Ampliar limites exige testes no orçamento de expressões.

Rules não filtram consultas: uma lista pública futura precisa consultar somente `status == published`. Slug não garante unicidade global. Consulte [cartas](cartas.md) para transações e compensação. O registro de publicação autorizada de 13/10/2026 informa Rules de players/packs/definições com conteúdo remoto igual ao arquivo local; Storage Rules da coleção/preview já estavam publicadas e índices não mudaram. Essa publicação de infraestrutura não criou conteúdo ou concessões. A [configuração posterior de 14/10/2026](contexto-operacional-para-ias.md#configuração-do-starterpack-com-nyra--14102026) registra Nyra publicada e StarterPack ativo na versão 1, com uma cópia dela. A revisão documental não revalidou produção. Ambientes novos ainda exigem configuração administrativa; conferência com sessão member real, reveal e resumo permanece pendente conforme o [diagnóstico de previews](contexto-operacional-para-ias.md#diagnóstico-das-previews-publicadas--15102026).
