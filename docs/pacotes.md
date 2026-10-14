# Pacotes do jogador

O pacote inicial tem nome reservado **StarterPack**, é determinístico, gratuito e concedido uma única vez pelo backend. `initializePlayer` entrega uma instância lacrada; `openPack` adiciona suas cartas à coleção e persiste o resultado. O Angular somente solicita e revela o resultado confirmado. A administração configura definições e versões em `/admin/pacotes`, sem conceder instâncias ou cartas.

Não há loja, preço, moeda, compra, aleatoriedade, probabilidades, proteção contra duplicatas, crafting, trocas, decks ou gameplay nesta etapa.

## Definição, versão e instância

| Caminho | Responsabilidade |
| --- | --- |
| `packDefinitions/starter` | Nome/descrição, ativação para novas concessões e ponteiro de versão atual |
| `packDefinitions/starter/versions/{version}` | Lista imutável de IDs e quantidades daquela versão |
| `users/{uid}/packs/starter` | Uma instância por titular, versão fixa, aquisição e estado |
| `players/{uid}` | Marcador/auditoria da concessão única |
| `users/{uid}/collection/{cardId}` | Quantidade e datas da propriedade, após a abertura |

`PackDefinition` contém exatamente `name` (não vazio, até 120), `description` (até 1000, pode ser vazia), `active` (boolean), `currentVersion` (inteiro de 1 a 1000000), `createdAt` e `updatedAt` (Timestamp ordenados). `active: false` interrompe novas concessões; não cancela uma instância válida já concedida.

`PackDefinitionVersion` contém exatamente `version`, `cards` e `createdAt`. O ID é a representação decimal canônica da versão: `1`, sem zeros iniciais, e o campo `version` deve corresponder ao caminho. `cards` possui entre 1 e 25 itens `{cardId, quantity}`, com IDs no padrão `[a-zA-Z0-9_-]{1,128}` e quantidade inteira entre 1 e 9999. IDs duplicados são recusados; várias cópias usam um único item com `quantity` maior. O conteúdo é definido pelo administrador usando cartas reais publicadas, sem IDs escolhidos pelo código.

`PlayerPack` contém `packId: 'starter'`, `definitionVersion`, `source: 'starter'`, `state`, `acquiredAt` e `openedAt`. Lacrado usa `state: 'sealed'` e `openedAt: null`, sem `revealedCards`. Aberto usa `state: 'opened'`, Timestamp de abertura e lista `revealedCards`.

Cada `PackOpenedCard` persiste somente `{cardId, name, rarity, quantity}`. Nome/raridade são capturados da carta publicada no momento da abertura; a ordem segue a versão. Não duplica canvas, descrição, atributos, assets, preview nem documento completo. `cards/{cardId}` continua fonte principal da carta; o snapshot mantém o histórico do resultado concedido.

## Concessão do Starter Pack

`initializePlayer({})` aceita exclusivamente identidade de `request.auth.uid`. Valida perfil, player, definição ativa, versão atual e todas as cartas antes de gravar player e instância lacrada em uma transação. Não lê/escreve collection e não retorna cartas. O ID constante `starter` é isolado pelo caminho `users/{uid}`; não muda quando surge outra versão.

Uma repetição valida marcador/instância e retorna `alreadyInitialized`, sem modificar instância, player ou coleção. Instância ausente/inconsistente ou marcador antigo inválido exige revisão, sem reconcessão automática. Transações concorrentes resultam em exatamente uma instância. Contrato e entrada em `/game` estão em [Player Bootstrap](player-bootstrap.md).

O mecanismo anterior `starterCollections/default` não é consultado. Ele foi substituído por definição/versionamento de pack; as Rules atuais não permitem acesso ao caminho antigo. A consulta posterior ao relato de preparação bloqueada encontrou somente `initializePlayer` ativa no Firebase, sem `openPack`, starter configurado ou players; não há migração remota a executar nesse estado observado. Dados locais antigos podem ser descartados/recriados nos emuladores; não há reset/regrant de produção.

## openPack e atomicidade

Entrada única:

```ts
{ packInstanceId: 'starter' }
```

UID, cartas, quantidades, estado ou versão enviados pelo cliente são recusados. O servidor resolve somente `users/{request.auth.uid}/packs/{packInstanceId}`. Não existe parâmetro para abrir a instância de outro UID.

A transação valida Authentication, perfil consistente, player, instância e vínculo de auditoria: marcador, ID, versão e data de aquisição devem corresponder. Se já estiver aberta, retorna o snapshot persistido sem consultar configuração/cartas atuais e sem conceder novamente. Isso recupera uma resposta perdida e preserva o histórico mesmo depois da retirada de cartas ou remoção da configuração por ferramenta privilegiada.

Para uma instância lacrada, valida a definição, consulta **`versions/{definitionVersion}` da instância**, valida conteúdo, todas as cartas ainda `published` e entradas existentes que serão somadas. `currentVersion` nunca substitui a versão histórica; desativação da definição não impede abertura válida já concedida.

Depois de todas as leituras/verificações, o mesmo commit grava:

```text
quantidades e datas da coleção
                +
pack.state = opened
pack.openedAt = timestamp de servidor
pack.revealedCards = snapshot do resultado
```

Resultado da primeira abertura contém `packInstanceId`, `alreadyOpened: false` e `revealedCards`, a lista confirmada pelo backend. Retry retorna `alreadyOpened: true` e exatamente o mesmo resultado persistido. Duas chamadas concorrentes observam o mesmo commit e não duplicam quantidade. Deduplicação local por UID/instância ajuda a interface; segurança e idempotência pertencem ao backend.

Uma entrada nova recebe `quantity` do pack e as duas datas do commit. Uma existente soma a quantidade, conserva `firstAcquiredAt` e atualiza `lastAcquiredAt`. Campos exatos, quantidade de 1 a 9999 e datas `firstAcquiredAt <= lastAcquiredAt <= relógio backend` são obrigatórios. Se qualquer soma ultrapassa `PLAYER_COLLECTION_MAX_QUANTITY = 9999`, toda a abertura falha, mantendo pacote lacrado e coleção inalterada. Entradas fora do conteúdo do pack não são lidas/alteradas. A gestão manual administrativa continua definindo total absoluto, conforme [coleção](colecao.md).

Se uma carta foi excluída ou virou draft/archived antes da abertura, a operação falha sem writes; o pacote continua lacrado. O administrador precisa restaurar/publicar a carta ou revisar a configuração. Não substituir uma versão histórica para contornar o problema nem conceder uma carta indisponível. Pacote já aberto conserva seu snapshot para revisão, sem uma segunda concessão.

## Experiência em /game

O menu possui Início, Coleção, Pacotes, Decks, Jogar e Perfil. `/game/pacotes` consulta somente instâncias do titular, mostra loading, erro/retry, vazio, pacotes lacrados e histórico de abertos. Não há catálogo de compra. `returnUrl` inclui a listagem e a rota interna validada de abertura.

A Home consulta o estado atual da instância após o bootstrap. Enquanto lacrada, destaca **Seu Starter Pack chegou!**, com link **Abrir Starter Pack** para `/game/pacotes/abrir/:id`. Não abre automaticamente nem depende apenas de `starterPackGranted` cached.

A tela de abertura consulta o pacote próprio e trata ausência/acesso negado. O botão **Abrir pacote** chama a Callable e aguarda a confirmação antes do reveal. Somente a primeira entrada do resultado aparece inicialmente; **Próxima carta** avança, exibindo a posição e quantidade. Múltiplas cópias do mesmo ID usam uma entrada com `xN`, sem revelar a mesma carta N vezes. Depois da última, **Ver resumo** mostra a grade e links **Ver minha coleção** e **Voltar aos pacotes**.

A coleção já foi persistida quando começa a animação. O reveal não decide conteúdo, não escreve Firestore e não condiciona a concessão à conclusão visual. Refresh ou saída depois do sucesso permite reconstruir a apresentação a partir do pacote aberto e seu snapshot, sem chamar `openPack` novamente para conceder. A posição visual não é persistida; rever pode começar novamente pela primeira entrada.

CSS próprio usa cores/borda/brilho por raridade common/rare/epic/legendary e respeita `prefers-reduced-motion`. Não houve nova biblioteca de UI nem reprodução de outra franquia. Preview reutiliza `PlayerCardPreviewComponent` e `PublishedCardStorageService`, com PNG em `published-cards/{cardId}/preview.png`; não instancia Konva nem baixa assets privados. Object URLs são liberadas ao trocar entrada, falhar imagem ou destruir componente. Preview ausente/bloqueada mostra fallback/retry; nome/raridade/quantidade do snapshot continuam disponíveis no histórico.

Se a carta deixa de ser publicada depois da abertura, novos downloads da preview são negados pelas Storage Rules. O snapshot histórico permanece, e o PNG corrente não é uma imagem imutável da abertura. Bytes já baixados não podem ser revogados remotamente. Veja [imagens publicadas](colecao.md#imagem-publicada-e-assets-privados).

## Security Rules e autoridade

| Domínio | Member válido | Admin pelo SDK cliente |
| --- | --- | --- |
| `users/{uid}/packs/*` | Get/list somente próprios | Leitura de perfis existentes |
| Packs: create/update/delete | Negado | Negado |
| `players/{uid}` | Get próprio; writes negados | Get/list; writes negados |
| `packDefinitions/*` | Sem leitura/escrita | Get/list/create/update; delete negado |
| `versions/*` | Sem leitura/escrita | Get/list/create; update/delete negados |
| `collection/*` | Leitura própria; writes negados | Gestão manual preservada |

Anônimo/perfil inválido não acessam packs. Um cliente member não cria instâncias, altera estado/snapshot, escolhe conteúdo, adiciona propriedade, altera player, duplica starter ou abre a instância de outro UID. Backend valida esses limites mesmo usando Admin SDK, que ignora Rules.

Rules validam envelope/tamanho e reserva do nome das definições e versões, não todos os IDs/quantidades/status. `packDefinitions/starter` exige exatamente `name: 'StarterPack'`; outra definição não pode usar esse nome nem variantes com caixa, espaços, `_` ou `-`. A criação de versão exige definição existente após o commit (`existsAfter`), ID decimal correspondente e timestamp de servidor. Isso permite criar definição e primeira versão juntas. Todas as versões são imutáveis pelo SDK cliente, inclusive admin; definição pode trocar `active/currentVersion`, conservando `createdAt`. Console e Admin SDK ignoram essa proteção: editar/excluir manualmente uma versão histórica pode alterar/bloquear o conteúdo de instâncias ainda lacradas. O backend revalida, mas não mantém hash/cópia do conteúdo concedido. Preservar versões é obrigação operacional; veja [riscos](riscos-e-dividas-tecnicas.md).

## Administração de pacotes

`/admin/pacotes` é protegida pelos guards administrativos e pelas Rules. O menu e o dashboard oferecem o acesso, que permanece disponível mesmo se a preparação da área do jogador falhar. A lista mostra definições, ativação e versão atual; **Gerenciar** abre a configuração. **Criar pacote** cadastra outro pacote determinístico; **Configurar StarterPack** abre ou cria somente a definição dedicada `starter`.

A criação salva nome, descrição, ativação e conteúdo da versão 1 juntos. O ID técnico é permanente; para o inicial, ID `starter` e nome `StarterPack` são fixos. Outros nomes que normalizem para `starterpack` depois de ignorar caixa, espaços, `_` e `-` são recusados. O formulário permite escolher de 1 a 25 cartas distintas publicadas e quantidade inteira de 1 a 9999 por carta, sem canvas/assets duplicados.

A edição de informações preserva `createdAt` e não modifica conteúdo. A versão atual e o histórico são somente leitura. **Criar próxima versão** copia o conteúdo atual para um rascunho editável; o salvamento cria uma versão nova e avança o ponteiro em uma transação. Metadados carregados que mudaram em outra sessão não são sobrescritos; a criação exige que a versão de origem ainda seja a atual e verifica colisões dentro da transação. Se outra aba avançou antes, o rascunho antigo é recusado e exige recarregar. Definições não são excluídas; desativar impede novas concessões do inicial sem retirar instâncias anteriores. Não há botão de distribuir outros pacotes, loja ou economia: essas definições adicionais ficam como catálogo administrativo para evolução futura.

As operações ficam no serviço tipado `PackDefinitionService`, não nos componentes. Validação administrativa resolve cartas publicadas antes da escrita; Functions repetem suas próprias verificações antes de qualquer concessão. A UI não cria `players`, `users/{uid}/packs` ou propriedade. Não crie esses documentos pelo Console para simular a concessão.

## Configurar o starter

1. Pelo editor administrativo, salve cartas reais como **Publicada**, conferindo previews. Sem cartas publicadas, a tela de pacotes oferece acesso à administração de cartas e não permite criar conteúdo vazio. Nenhum ID fictício de produção é fornecido.
2. Abra `/admin/pacotes` e **Configurar StarterPack**. O nome e o ID já identificam o pacote inicial; preencha descrição, escolha as cartas e quantidades desejadas e marque a ativação.
3. Salve a configuração. A definição e sua primeira versão são gravadas juntas com datas de servidor. Se preferir preparar inativo, ative depois em **Gerenciar**, sem alterar o conteúdo existente.
4. No jogador, use **Tentar novamente** após configurar. A ausência do starter produz a mensagem **O pacote inicial ainda não foi configurado por um administrador.**; admin possui link **Configurar pacotes**. Outros erros continuam indicando retry/contato, sem liberar concessão parcial.
5. Para conteúdo novo, use **Criar próxima versão**. Novas versões afetam futuras concessões, sem dar outro pack a jogadores inicializados; packs antigos continuam com sua versão fixa. Nunca edite/exclua versões existentes, inclusive no Console.

Não foi criada configuração remota nem escolhido conteúdo real por esta implementação. Publicar infraestrutura não escolhe nem publica cartas automaticamente.

## Localhost isolado

Instale com `npm.cmd ci` e `npm.cmd --prefix functions ci`. Backend usa Node.js 22; emuladores usam Firebase CLI e Java compatíveis (Java 21 nesta máquina). Runtimes portáteis e resultados estão no [contexto operacional](contexto-operacional-para-ias.md).

Copie [o exemplo de emuladores](config/environment.emulators.example.ts) somente para `environment.development.ts`: `production: false`, `firebaseEmulators: true` e projeto `demo-cardgame`. Essa opção conecta os quatro serviços apenas em localhost/loopback. A proteção recusa produção, projeto real ou outro host; emuladores são desabilitados por padrão. Preserve environment de produção com configuração pública do Web App real e sem a opção habilitada.

```powershell
# Terminal 1: projeto isolado demo-cardgame
npm.cmd run emulators:start

# Terminal 2: aplicação development
npm.cmd start
```

Abra `http://localhost:4200`; Emulator UI fica em `http://127.0.0.1:4000`. Auth usa 9099, Firestore 8080, Storage 9199 e Functions 5001, todos em `127.0.0.1` no `firebase.json`.

1. Cadastre uma conta local; promova somente seu perfil no Emulator UI para `role: admin` e `roleId: admin`, preservando os demais campos.
2. Pelo painel local, crie/salve cartas publicadas e configure definição/versão conforme a seção anterior.
3. Cadastre outro member. Entre em `/game`, observe preparação e o destaque do Starter Pack. Verifique um player e exatamente `users/{uid}/packs/starter` lacrado; a coleção de uma conta nova permanece vazia.
4. Abra pela Home/listagem, confirme reveal manual e resumo. No Emulator UI, confira pack aberto, snapshot e coleção com as quantidades escolhidas.
5. Recarregue a rota, reveja resultado, saia/entre e repita chamadas. Confirme mesma instância/resultado e quantidades inalteradas. Duas abas também não duplicam concessão/abertura.

Scripts não importam/populam produção. Sem export/import explícito, reiniciar emuladores descarta os dados; fixtures antigas do bootstrap direto podem ser recriadas nesse ambiente isolado.

## Domínio Firebase

A configuração preservada aponta para projeto `cardgame-6fdcb`, bucket `cardgame-6fdcb.firebasestorage.app` e site Hosting `deckfall`, domínio **`https://deckfall.web.app`**. `.firebaserc` não existe neste repositório; comandos usam `--project` explícito. Não trocar por `heckfall.web.app` por suposição. `firebase.json` usa `dist/card-game/browser` e rewrite SPA `** → /index.html`, permitindo acesso direto às rotas novas.

Callables e provider Functions usam `southamerica-east1`. Firebase SDK resolve endpoints pela configuração/região; não há hostname de Function nem localhost de produção hardcoded. Assets/rotas são relativos. Consulta remota somente leitura em 13/10/2026 às 18h27 de São Paulo confirmou site/projeto, região e CORS GET para `http://localhost:4200` e `https://deckfall.web.app`, sem alteração (metageneration 3).

**Pendência externa verificada:** Authorized domains do Auth contém `localhost`, `cardgame-6fdcb.firebaseapp.com` e `cardgame-6fdcb.web.app`, mas não `deckfall.web.app`. O proprietário precisa autorizar/configurar esse hostname no Console antes do uso hospedado, conferindo também providers/redirect. Nenhum domínio Auth, CORS ou Storage Rules foi alterado nesta etapa. O recibo local ignorado é `.local-tools/packs-domain-preflight.json`. Essas leituras não equivalem a sessão Auth real no navegador; [CORS](configuracao-cors-storage.md) e [riscos](riscos-e-dividas-tecnicas.md) explicam limites.

## Publicação posterior

**Nenhum comando de deploy foi executado nesta tarefa.** Antes de autorizar publicação, configurar o starter real, adicionar `deckfall.web.app` aos Authorized domains do Auth no escopo autorizado, conferir faturamento/serviços Gen 2/IAM, validar o build e planejar teste autenticado posterior nos dois ambientes. O escopo necessário é Functions (`initializePlayer` e `openPack`), Firestore Rules e Hosting. Storage Rules ficaram inalteradas e não exigem publicação nesta entrega.

Após autorização explícita, os comandos previstos são:

```powershell
npm.cmd run build -- --configuration production
npm.cmd run build:functions
firebase deploy --only functions:initializePlayer,functions:openPack --project cardgame-6fdcb --non-interactive
firebase deploy --only firestore:rules --project cardgame-6fdcb --non-interactive
firebase deploy --only hosting --project cardgame-6fdcb --non-interactive
```

Somente se Storage Rules forem alteradas em outro trabalho autorizado, publicar também `firebase deploy --only storage --project cardgame-6fdcb --non-interactive`. Não há alteração de índices nesta etapa. Até publicação, o domínio permanece no build anterior; frontend novo apontado ao backend remoto sem Callables informa erro e bloqueia a preparação, sem fallback de concessão local.

## Validação e limites

```powershell
npm.cmd test -- --watch=false --browsers=ChromeHeadless
npm.cmd run build -- --configuration production
npm.cmd run test:rules
npm.cmd run build:functions
npm.cmd run test:functions
npm.cmd run test:functions:emulator
git diff --check
git status --short
```

Backend testa bootstrap sem coleção, abertura atômica, soma/datas/limites, versão fixa, retries, concorrência e retorno persistido. Integração usa Callable real nos emuladores de Auth/Firestore/Functions em `demo-cardgame`; Rules testam propriedade/leitura e negação de writes; frontend testa estados, navegação, reveal/revisão e URLs. Resultados efetivamente executados ficam no [contexto operacional](contexto-operacional-para-ias.md).

Listagem é integral e sob demanda, sem paginação/realtime. Abertura aceita somente o domínio starter atual. App Check, controles de abuso, monitoramento, distribuição de outros packs e reconciliação de previews ficam como pendências; idempotência não elimina custo de invocações. Nenhuma ação suportada apaga marcador, reseta/reconcede pack ou altera resultado aberto. Operações futuras de valor precisam preservar a mesma autoridade backend.

## StarterPack configurado — 14/10/2026

O proprietário escolheu **uma cópia de Nyra** (`46f5c359-0d1e-423e-911e-4ba592567405`). No projeto `cardgame-6fdcb`, a carta foi publicada e a definição `packDefinitions/starter` criada ativa, com `currentVersion: 1`; `versions/1` contém somente esse ID com `quantity: 1`. Os três documentos foram gravados no mesmo commit com precondições de versão/ausência e datas de servidor. A imagem publicada foi gerada do canvas atual, preservando a arte original, e seus bytes foram conferidos.

A configuração remove a ausência do starter que bloqueava `/game`. Use **Tentar novamente** na sessão que ainda conserva esse erro e abra o pacote pelo fluxo normal. A preparação continua concedendo uma instância lacrada; somente `openPack` concede a carta. Houve validação local de preparação, abertura e repetição sem duplicação, sem concessões diretas nem teste com uma sessão real em produção. Detalhes em [contexto operacional](contexto-operacional-para-ias.md#configuração-do-starterpack-com-nyra--14102026).
