# Player Bootstrap e Starter Collection

O cliente solicita operações de jogo; o backend confiável decide a concessão de propriedade. A primeira operação é `initializePlayer`, Callable Firebase Functions Gen 2 escrita em TypeScript e executada com Admin SDK somente em `functions/`.

## Identidade, jogador e propriedade

```text
Firebase Authentication
          ↓
users/{uid} — identidade e acesso
          ↓
initializePlayer — UID autenticado, validação e transação
          ↓
players/{uid} — estado mínimo e marcador da concessão única
          ↓
starterCollections/default — definição administrativa
          ↓
users/{uid}/collection/{cardId} — quantidade e datas
```

`users/{uid}` continua guardando nome, contato e papéis; não recebe moedas, XP, nível, resultados ou estado de jogo. `players/{uid}` tem `createdAt`, `updatedAt`, `starterGrantedAt` e, após conceder, `starterVersion`. UID pertence ao caminho. `starterVersion` registra qual definição foi concedida, sem transformar versão nova em direito de ganhar cartas novamente.

Não há decks, gameplay, packs, aleatoriedade, economia, reset ou regrant. A gestão manual de coleção existente continua disponível para correções administrativas.

## Contrato da operação

O Angular chama `initializePlayer` com dados vazios. A identidade vem exclusivamente de `request.auth.uid`; não é aceito UID ou escolha de cartas no payload. O backend exige Authentication e `users/{uid}` existente, com `role == roleId` em `member` ou `admin`. E-mail não concede autorização.

Resultado mínimo de primeira inicialização:

```ts
{ initialized: true, alreadyInitialized: false, cardsGranted: 3 }
```

`cardsGranted` representa cópias somadas, não o número de IDs diferentes. Outra chamada retorna:

```ts
{ initialized: true, alreadyInitialized: true, cardsGranted: 0 }
```

Essa resposta não inclui documentos administrativos, tokens, assets ou detalhes internos do SDK. Erros de validação usam códigos Callable; falhas inesperadas retornam mensagem genérica sem expor dados administrativos.

## Transação e idempotência

Uma transação Firestore lê perfil e player. Se o player válido já possui `starterGrantedAt`, retorna sem writes, antes de consultar a definição atual. Uma configuração posteriormente desativada não impede o acesso de jogador já inicializado nem renova a concessão.

Para a primeira concessão, a mesma transação lê `starterCollections/default`, todas as cartas referidas e as entradas correspondentes do inventário. Valida tudo antes de escrever. Grava quantidades, datas e marcador de player no mesmo commit com timestamps de servidor. Erro em qualquer item cancela toda a concessão, inclusive a criação do player.

O backend exige campos exatos e datas ordenadas no player: `createdAt <= updatedAt`, e, quando concedido, `createdAt <= starterGrantedAt <= updatedAt`. `starterVersion` deve estar ausente antes da concessão e ser um inteiro válido depois dela. `updatedAt` posterior ao relógio confiável do backend é inválido; nem um marcador com data futura libera acesso como já inicializado.

Duas solicitações concorrentes podem ler o estado ainda não inicializado. Ao disputar o commit, o Firestore repete a transação em conflito e ela passa a observar o marcador já concedido, sem somar novamente. O cache/deduplicação Angular melhora a UX, mas não é a garantia de idempotência.

## Soma com coleção existente

O starter adiciona quantidades às concedidas manualmente antes do bootstrap. Se a carta possuída tem uma cópia e o starter fornece duas, o total passa a três. Entradas fora do starter não são alteradas.

Para cartas já possuídas, `firstAcquiredAt` permanece igual e `lastAcquiredAt` recebe o timestamp do commit. Uma entrada nova recebe as duas datas do mesmo commit. A soma não pode exceder `PLAYER_COLLECTION_MAX_QUANTITY = 9999`; uma única ultrapassagem impede todo o bootstrap. Datas/quantidades inválidas em uma entrada que será somada também impedem writes.

Uma entrada existente precisa conter somente os três campos previstos, com `firstAcquiredAt <= lastAcquiredAt`. O backend recusa `lastAcquiredAt` posterior ao seu relógio confiável, evitando preservar uma primeira aquisição futura ou gravar datas fora de ordem. Essa verificação se aplica às entradas do starter que serão somadas, não ao inventário inteiro.

A gestão manual `PlayerCollectionService.setQuantity` continua definindo o **total absoluto**. Ela não altera o marcador de player nem transforma remoção manual de cartas em permissão de receber o starter novamente.

## Configuração administrativa default

Crie `starterCollections/default` no Firestore Console ou numa ferramenta administrativa autorizada. Nesta fase não há tela Angular para o starter. Use IDs de cartas existentes escolhidas pelo administrador; a implementação não contém IDs fictícios nem seleciona cartas arbitrariamente.

| Campo | Tipo e valor exigido |
| --- | --- |
| active | Boolean true para conceder; false desativa novas concessões |
| version | Inteiro de 1 a 1000000 |
| cards | Lista de 1 a 25 mapas, cada um contendo somente `cardId` e `quantity` |
| updatedAt | Timestamp, não string; escrita por SDK cliente administrativo usa serverTimestamp |
| cards[].cardId | ID existente em `cards`, no padrão `[a-zA-Z0-9_-]{1,128}` |
| cards[].quantity | Inteiro de 1 a 9999 |

Cada ID aparece uma única vez e precisa referenciar carta com `status == published`. Carta inexistente, draft ou archived impede toda a operação. A definição valida também campos desconhecidos e tipos; nenhuma inicialização parcial é aceita.

Rules permitem armazenar definição inativa vazia, mas ela não inicializa jogadores. Definição inexistente, inativa, ativa vazia ou inválida falha de forma segura, sem marcar player como inicializado. Configurar versão/cartas afeta somente quem ainda não recebeu o starter; não exige novo deploy de Functions.

O Console e Admin SDK ignoram Security Rules. Não presumir que uma edição aceita no Console esteja válida: a Function revalida toda a definição. Rules limitam o envelope de writes administrativos, mas não prometem validação profunda de todos os itens/duplicatas/status.

Salvar cartas como Publicada gera a imagem final pelo fluxo existente. O bootstrap concede propriedade; não gera PNG nem modifica o modelo das cartas. Cartas publicadas antigas podem precisar ser salvas novamente para criar a preview.

## Entrada em /game

`GameLayoutComponent` solicita a operação pelo `PlayerInitializationService` ao reconhecer sessão válida. Isso atende novos cadastros, contas antigas e admins que acessam o jogo. Não depende somente do cadastro.

O serviço expõe `idle`, `preparing`, `ready` e `error`. Compartilha chamadas locais pendentes do mesmo UID e reutiliza o sucesso enquanto essa sessão estiver ativa. Logout/perfil inválido/troca de UID limpa o resultado; callbacks antigos não liberam outra conta. O SDK usa timeout de 30 segundos.

Durante a preparação, o layout mostra **Preparando sua jornada...**. Um erro crítico mostra mensagem e **Tentar novamente**; o outlet só é montado em `ready`. Login, Minha conta, logout e administração continuam disponíveis. Não há cartas locais falsas nem sucesso sem resposta backend válida.

Depois do commit, `/game/colecao` usa `PlayerCollectionService` normalmente, lendo a propriedade já persistida. Não há cache paralelo de inventário para invalidar. A operação aceita pelo servidor pode concluir depois de logout ou perda da resposta; retry permanece seguro graças ao marcador atômico.

## Regras de acesso

| Domínio | Member com perfil válido | Admin pelo SDK cliente | Backend Admin SDK |
| --- | --- | --- | --- |
| players | Get próprio; nenhuma escrita | Get/list; nenhuma escrita | Leitura/escrita validada pela operação |
| starterCollections/default | Nenhum acesso | Get e gestão; sem listagem/outros IDs | Lê configuração e revalida |
| collection | Get/list própria; nenhuma escrita | Gestão manual já existente | Soma inicial em transação |

Anônimos e perfis inválidos não acessam players/starter/coleção. A política de Storage não muda: jogador baixa somente PNG final autenticado de carta publicada; assets editáveis continuam administrativos.

## Região e runtime

A região da Function é explicitamente `southamerica-east1`, igual à localização da base Firestore `(default)` de `cardgame-6fdcb`, confirmada por consulta somente leitura nesta etapa. O provider Angular usa a mesma região. Não houve criação/alteração de serviço remoto nessa consulta.

Backend: Node.js 22, TypeScript 5.9.3, Firebase Functions 7.4.0 e Admin SDK 14.5.0, com package/lock próprios. Angular 18, Firebase Web SDK e Konva foram preservados. Não há service account no repositório; a Function publicada utiliza identidade do ambiente gerenciado.

## Executar isolado em localhost

Instale dependências frontend/backend com `npm.cmd ci` e `npm.cmd --prefix functions ci`. Use Node.js 22, Firebase CLI e Java 21 compatíveis para os emuladores. Os runtimes portáteis usados nesta máquina estão descritos no [contexto operacional](contexto-operacional-para-ias.md), sem modificar o Node/Java do sistema.

No environment de desenvolvimento, use `production: false`, `firebaseEmulators: true` e configuração pública de projeto `demo-`, como `demo-cardgame`; copie [o exemplo exclusivo de emuladores](config/environment.emulators.example.ts). Essa opção conecta Auth, Firestore, Storage e Functions somente em localhost/loopback. Produção ou projeto fora de `demo-` não aceita a opção, evitando mistura de serviços locais e reais. Por padrão, emuladores estão desabilitados.

Para `demo-cardgame`, os campos locais podem usar esta configuração de teste, sem credenciais e sem projeto real:

```ts
export const environment = {
  production: false,
  firebaseEmulators: true,
  firebase: {
    apiKey: 'demo-api-key',
    authDomain: 'demo-cardgame.firebaseapp.com',
    projectId: 'demo-cardgame',
    storageBucket: 'demo-cardgame.appspot.com',
    appId: 'demo-cardgame'
  }
};
```

Esse bloco pertence somente a `environment.development.ts`. Preserve o environment de produção com emuladores desabilitados e os valores públicos do Web App real.

Em um terminal, inicie:

```powershell
npm.cmd run emulators:start
```

Em outro terminal, execute `npm.cmd start`. A interface dos emuladores fica em `http://127.0.0.1:4000`; Auth usa 9099, Firestore 8080, Storage 9199 e Functions 5001, conforme `firebase.json`. Esses serviços são locais e isolados do Firebase remoto.

1. Cadastre uma conta local pela aplicação. No Firestore do Emulator UI, promova somente o perfil dessa conta para `role: admin` e `roleId: admin`, preservando os outros campos. Isso é o bootstrap do admin local, sem mudar produção.
2. Entre como admin, crie/salve cartas com status Publicada e confira suas previews. Copie os IDs reais dessas cartas da lista/rotas administrativas.
3. No Firestore do Emulator UI, configure `starterCollections/default` conforme o contrato, com esses IDs, quantidades e Timestamp. Não crie players ou coleções manualmente para simular a concessão.
4. Cadastre um member local, entre em `/game` e abra Coleção. Confira player/entradas no Emulator UI; repita o acesso e confirme quantidades inalteradas.

Os scripts não importam nem populam dados remotos. Os emuladores são temporários; sem export/import explícito, reiniciá-los não preserva o inventário local.

## Testes e pendências antes de deploy

```powershell
npm.cmd run build:functions
npm.cmd run test:functions
npm.cmd run test:functions:emulator
npm.cmd run test:rules
npm.cmd test -- --watch=false --browsers=ChromeHeadless
npm.cmd run build -- --configuration production
```

`test:functions` verifica o domínio com store substituível; `test:functions:emulator` integra Callable/Auth/Firestore no projeto isolado `demo-cardgame`. Os testes de Rules continuam separados e incluem Storage. Resultados finais ficam no [contexto operacional](contexto-operacional-para-ias.md).

**Não houve deploy nesta etapa.** Rules/Hosting publicados anteriormente não incluem o bootstrap novo. Antes de disponibilizá-lo no Firebase real, o proprietário precisa conferir plano/faturamento e serviços exigidos por Functions Gen 2, identidade/IAM de execução, região, providers/domínios Auth e configurar starter default com IDs reais. A publicação de Function, Rules e frontend exige escopo autorizado e verificação autenticada posterior em localhost/domínio. Sem Function disponível, o novo frontend apontado ao backend real informa falha de preparação.

App Check, rate limiting, monitoramento e controles de abuso permanecem pendências explícitas; a idempotência não elimina custo de chamadas abusivas. Contadores reais na Home e leitura administrativa do status de inicialização ficaram como melhorias posteriores. Não há ação de reset/regrant; futuras operações de valor precisam da mesma autoridade e validação backend. Veja [riscos e dívidas](riscos-e-dividas-tecnicas.md).
