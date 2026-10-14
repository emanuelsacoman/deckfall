# Player Bootstrap e Starter Pack

`initializePlayer` prepara o jogador e concede exatamente **um Starter Pack lacrado**. Não lê nem escreve a coleção. A concessão das cartas pertence à operação separada `openPack`, descrita em [pacotes](pacotes.md).

```text
Authentication → users/{uid} → initializePlayer
                                     ↓ commit único
                     players/{uid} + users/{uid}/packs/starter
                                     ↓ sealed
                     Home → abrir pacote → openPack
                                     ↓ commit único
                     coleção + pacote opened + resultado
                                     ↓
                     reveal visual carta por carta
```

`users/{uid}` conserva identidade e autorização. `players/{uid}` conserva estado mínimo e auditoria da concessão. Nenhum desses contratos inclui moedas, XP, nível, placar ou deck selecionado. O frontend solicita; o servidor decide; Firestore persiste; Rules protegem.

## Contrato da Callable

O Angular chama `initializePlayer` com `{}`. A identidade vem exclusivamente de `request.auth.uid`; campos adicionais, UID e escolha de conteúdo são recusados. O perfil deve existir com `role == roleId` em `member` ou `admin`. E-mail não é autorização.

Primeira resposta:

```ts
{
  initialized: true,
  alreadyInitialized: false,
  starterPackGranted: true,
  starterPackInstanceId: 'starter'
}
```

Uma repetição retorna `alreadyInitialized: true`, `starterPackGranted: false` e o mesmo `starterPackInstanceId`. Não há `cardsGranted` nem cartas no retorno.

O ID constante `starter` pertence ao caminho do usuário: `users/{uid}/packs/starter`. Contas diferentes têm instâncias diferentes, e uma nova versão da definição não cria outro ID para o mesmo titular.

## Validação e commit

A transação lê perfil, player e instância. Player existente exige campos exatos, `createdAt <= updatedAt <= relógio confiável do backend` e marcador consistente. Sem concessão, `starterGrantedAt` é null e os campos de versão/instância estão ausentes. Depois da concessão, `starterVersion` e `starterPackInstanceId` são obrigatórios, com `createdAt <= starterGrantedAt <= updatedAt`.

Se o marcador válido já existe, a operação verifica a instância registrada e sua auditoria, retornando sem writes nem consulta à definição atual. Instância ausente/inconsistente não produz reconcessão automática. Pacote órfão sem marcador também é recusado.

Na primeira concessão, lê `packDefinitions/starter`, exige `active: true`, lê `versions/{currentVersion}` e valida todos os IDs/quantidades e cartas publicadas. Nome/raridade usados pela futura abertura também precisam ser válidos. Configuração inexistente/inativa/vazia, carta draft/archived/ausente ou datas inválidas impedem toda a operação.

Somente após validar tudo, grava no mesmo commit:

- instância com `packId: 'starter'`, `definitionVersion`, `source: 'starter'`, `state: 'sealed'`, `acquiredAt` de servidor e `openedAt: null`, sem `revealedCards`;
- player com datas de servidor, `starterGrantedAt`, `starterVersion` e `starterPackInstanceId: 'starter'`, preservando `createdAt` anterior válido.

Nenhuma carta entra na coleção nessa etapa, mesmo se ela já contém concessões administrativas. Duas abas concorrentes disputam a mesma transação/caminhos; o Firestore repete a transação em conflito e ela observa a concessão concluída. Cache Angular melhora a experiência, mas a garantia de uma instância é do backend.

## Configuração única e dados antigos

A configuração ativa é `packDefinitions/starter` com nome reservado `StarterPack` e sua subcoleção `versions`. `starterCollections/default` foi removida do fluxo e não possui permissões nas Rules atuais. Não existem dois sistemas concorrentes de starter nem leitura de fallback. A gestão é pela página administrativa `/admin/pacotes`; contratos, limites e sequência segura de versionamento estão em [pacotes](pacotes.md#configurar-o-starter).

O diagnóstico de 13/10/2026 às 18h43 de São Paulo encontrou `initializePlayer` ativa remotamente, mas não `openPack`, configuração do starter ou players. Depois, o proprietário autorizou a correção: as duas Functions, Firestore Rules e Hosting foram publicados e conferidos. A configuração de cartas/conteúdo permanece decisão do administrador em `/admin/pacotes`. Não há migração de produção, reset ou regrant automático. **Dados locais gerados pelo bootstrap anterior podem ser descartados/recriados nos emuladores.** Seu player antigo sem `starterPackInstanceId` é inválido no contrato novo; a mensagem orienta recriar o ambiente local. Não apagar marcadores em produção para tentar obter outro starter.

## Entrada em /game

`GameLayoutComponent` solicita `initializePlayer` pelo `PlayerInitializationService` quando reconhece uma sessão válida, inclusive para contas antigas/admins que entram no jogo. Não depende somente do cadastro.

O serviço expõe `idle`, `preparing`, `ready` e `error`, compartilha chamadas locais pendentes do mesmo UID e reutiliza sucesso enquanto a sessão permanecer ativa. Logout/perfil inválido/troca de UID limpa o resultado; callbacks antigos não liberam outra conta. O timeout do SDK é de 30 segundos.

Durante a preparação, o layout mostra **Preparando sua jornada...**. Erro crítico mantém o outlet fechado e oferece **Tentar novamente**. Quando a definição inicial está ausente, a Function retorna o motivo seguro `starter-not-configured` e o frontend informa **O pacote inicial ainda não foi configurado por um administrador.** Admin também recebe **Configurar pacotes**, apontando para `/admin/pacotes`. Login, Minha conta, logout e administração continuam disponíveis. Não há sucesso sem resposta backend válida.

Depois do commit, a Home consulta a instância própria: enquanto lacrada, mostra **Seu Starter Pack chegou!** e um link para `/game/pacotes/abrir/starter`. Não abre automaticamente, e um pacote já aberto não reaparece como novo por causa do resultado cached do bootstrap. `/game/colecao` pode estar vazia até a abertura; a gestão administrativa anterior continua preservada.

Timeout, logout ou perda da resposta não cancelam uma transação já aceita pelo servidor. Retry recupera o estado sem conceder outra instância. A abertura também é idempotente, com resultado persistido recuperável.

## Acesso e região

| Domínio | Member válido | Admin pelo SDK cliente |
| --- | --- | --- |
| players | Get próprio; sem writes | Get/list; sem writes |
| packs | Get/list próprios; sem writes | Leitura de perfis existentes; sem writes |
| packDefinitions e versions | Sem acesso | Ler/criar/editar definição; criar versões imutáveis |
| collection | Get/list própria; sem writes | Gestão manual existente |

Anônimos e perfis inválidos não acessam esses dados. Admin SDK ignora Rules, por isso a Function verifica autenticação, autorização e invariantes antes do commit. Assets editáveis permanecem privados; somente PNG publicado pode ser baixado pelo jogador autenticado.

Functions Gen 2 `initializePlayer` e `openPack` e o provider Angular usam `southamerica-east1`, igual à localização Firestore `(default)` confirmada por consulta somente leitura em `cardgame-6fdcb`. Backend mantém Node.js 22, TypeScript 5.9.3, Firebase Functions 7.4.0 e Admin SDK 14.5.0 em package/lock separados. Angular/Firebase Web SDK/Konva foram preservados; não há service account versionada.

## Localhost e publicação posterior

Use [o guia de pacotes](pacotes.md#localhost-isolado) para Auth/Firestore/Storage/Functions isolados em `demo-cardgame`, configuração do Starter Pack e o fluxo completo cadastro → lacrado → abertura → coleção. A proteção do environment continua recusando emuladores em produção, projeto real ou host fora de loopback.

**Publicação autorizada conferida em 13/10/2026:** `initializePlayer` e `openPack` estão ACTIVE em Node.js 22, Rules remotas coincidem com o arquivo local e `deckfall.web.app` entrega o build com administração de pacotes. Esse domínio foi adicionado ao Auth preservando os anteriores; CORS Storage não precisou de alteração. Nenhuma carta, configuração StarterPack ou concessão foi criada por essa publicação. Até o administrador publicar suas cartas e criar/ativar o inicial, o gate continua fechado com orientação e retry. [Pacotes](pacotes.md#publicação-posterior) registra o escopo verificado; [riscos](riscos-e-dividas-tecnicas.md) distingue configuração restante, sessão real, App Check e abuso.
