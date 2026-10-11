# Modelo Firestore

As Rules privilegiam autorização, status, timestamps, quantidade/faixas numéricas dos atributos e envelope do canvas, mantendo o limite de avaliação do Firestore. Limites de textos, chaves/rótulos/IDs de atributos, metadados visuais e propriedades profundas são verificados pelos validators do cliente antes de gravar ou reconstruir o editor; não são uma promessa de validação exaustiva pelo servidor.

Contratos ficam em `model/interfaces`. IDs pertencem ao caminho e são acrescentados na leitura; não precisam ser duplicados no documento. Timestamps persistidos são de servidor. Não armazenar File, Blob, Base64, URLs de download, nós Konva, listeners ou histórico no Firestore.

## `users/{uid}`

Perfil com `displayName`, `contactEmail`, `role`, `roleId`, `createdAt` e `updatedAt`. Nome/contato podem ser vazios, limitados a 120/254 caracteres. Papéis aceitos: `admin` e `member`, sempre iguais nos dois campos.

Cadastro autenticado cria somente o próprio perfil member, com e-mail de contato igual ao e-mail do token e timestamps de servidor. Um perfil existente nunca é sobrescrito automaticamente pelo login. O bootstrap mínimo antigo, apenas role/roleId, continua legível; edição completa recebe updatedAt e preserva createdAt ou sua ausência.

Admin lê/lista/vincula/edita perfis. Um autenticado lê o próprio perfil; membros não fazem update nem se promovem. Exclusão de perfis e rebaixamento do próprio admin são negados pelas Rules. `contactEmail` não altera a credencial Auth. A lista não representa todas as contas Authentication; veja [usuários](usuarios.md) e [autenticação](autenticacao-e-admin.md).

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

Elementos possuem ID/nome/tipo, geometria, opacidade, visible/locked e properties tipadas. Tipos atuais: text, icon, rect, circle, line, image, artwork, attribute, bar. A ordem do array determina z-order. Bindings seguros usam campos conhecidos e `attributes.<key>`; conteúdo completo fica em [editor](editor-de-cartas.md).

Personalização acrescenta somente campos opcionais em `properties`: `borderStyle` nos estilos; `textDecoration`/`verticalAlign` em texto/ícone/atributo; `flipX`, `flipY`, `brightness`, `contrast`, `saturation` e `hue` em imagem/artwork. Canvas continua versão 1; a validação preserva a ausência desses campos em documentos antigos e rejeita valores fornecidos fora dos contratos. Defaults de renderização e faixas ficam em [personalização visual](editor-de-cartas.md#personalização-visual). Filtros, pixels em cache e atributos internos Konva não são persistidos.

Limites do cliente: dimensões 160–2048, 64 elementos, 24 assets e documento estruturado até 128 KiB. Fontes/cores/crop/faixas/IDs/referências são validados profundamente antes da persistência/importação. Assets locais podem ter storagePath null; a gravação final pelo serviço exige arquivos materializados no namespace do proprietário.

`firestore.indexes.json` isenta `canvas` de índices de campo único em cards/cardTemplates. O editor não consulta geometria ou propriedades internas. Consultas atuais usam updatedAt; não foram adicionados índices compostos.

## `cardTemplates/{templateId}`

Campos: `name`, `canvas`, `attributes`, `createdAt`, `updatedAt`. Nome obrigatório até 120; canvas e atributos usam os mesmos contratos. ID é acrescentado na leitura. Templates são administrativos, sem catálogo público. O template local Fantasy Basic não é criado automaticamente na coleção.

Salvar uma carta baseada em template preserva templateId como associação e copia assets ao namespace da carta quando necessário. O documento de carta contém seu canvas editável; renderização não exige buscar continuamente o template original.

## Regras e garantias

Cards publicados têm leitura pública de metadados; admin lê todos e é o único que escreve. Templates exigem admin para leitura/escrita. Storage exige admin para artes/assets, aceita imagens declaradas PNG/JPEG/WebP até 5 MiB, exige documento proprietário no upload e bloqueia overwrite.

Rules validam campos base, raridade/status, timestamps, atributos numéricos/ranges e envelope do canvas: versão, dimensões, background estrutural, até 64 elementos e 24 assets. Não fazem a validação profunda de toda union de elementos, IDs/metadados de cada asset ou todos os valores visuais. O limite de 128 KiB e validação profunda são garantias do cliente, não devem ser anunciados como enforcement completo das Rules. Ampliar limites exige testes no orçamento de expressões.

Rules não filtram consultas: uma lista pública futura precisa consultar somente `status == published`. Slug não garante unicidade global. Consulte [cartas](cartas.md) para transações e compensação. Backend remoto e publicação das Rules/índices continuam sujeitos à conferência externa; nenhum deploy foi feito nesta entrega.
