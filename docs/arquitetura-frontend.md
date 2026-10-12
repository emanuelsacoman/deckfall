# Arquitetura frontend

Angular 18 standalone, `inject()`, Reactive Forms, signals e RxJS quando necessário. Firebase modular, sem compat. O projeto mantém CSS; o editor não reorganiza a base nem migra frameworks.

```text
view = apresentação/orquestração
model/interfaces = contratos
model/services/cruds = domínio/persistência
model/services/fire = infraestrutura Firebase/Auth/Storage
model/services/tools = estado, validação e utilitários reutilizáveis
model/guards = autorização de navegação e proteção de saída
```

Componentes não acessam Firestore diretamente. `AuthService` resolve sessão/perfil; `CardService`, `CardTemplateService` e `UserService` persistem seus domínios. `CardStorageService` organiza arquivos e materializa uploads/cópias. Guard não substitui Rules.

## Rotas e layout

Telas usam `loadComponent`. Raiz e rota desconhecida redirecionam para `/login`, que oferece entrar, registrar, Google e recuperação de senha. Com sessão ativa, a mesma rota apresenta Minha conta, métodos vinculados e adição de Google/senha ao mesmo UID.

| Rota | Tela |
| --- | --- |
| `/game` | Redireciona para `/game/home` |
| `/game/home` | Início e atalhos do jogador |
| `/game/colecao` | Minha coleção, com controles visuais e placeholder |
| `/game/decks` | Meus decks, com placeholder |
| `/game/jogar` | Modos de jogo em desenvolvimento |
| `/game/perfil` | Nome, contato e papel já existentes; atalho para Minha conta |
| `/admin` | Redireciona para `/admin/dashboard` |
| `/admin/dashboard` | Atalhos administrativos |
| `/admin/cartas` | Redireciona para `/admin/cartas/lista` |
| `/admin/cartas/lista` | Catálogo e ações |
| `/admin/cartas/criar` | Editor de nova carta |
| `/admin/cartas/editar/:id` | Editor com documento carregado |
| `/admin/usuarios` | Redireciona para `/admin/usuarios/lista` |
| `/admin/usuarios/lista` | Perfis Firestore |
| `/admin/usuarios/criar` | Vínculo por UID de conta existente |
| `/admin/usuarios/editar/:uid` | Consulta e edição do perfil |

O shell administrativo possui `adminGuard` no pai e `adminChildGuard` nos filhos, observa revogação de acesso e oferece logout. O menu inclui Painel, Todas as cartas, Criar carta, Todos os usuários, Vincular perfil e os atalhos Minha conta e Área do jogador. Criação/edição de cartas usam wrappers pequenos; `cardEditorLeaveGuard` consulta alterações pendentes antes da saída. A raiz contém o router outlet; `app.config.ts` fornece App, Auth, Firestore e Storage.

## Área do jogador

`view/game/` reúne `layout`, `home`, `collection`, `decks`, `play` e `profile`. O layout é separado do administrativo, com identidade Deckfall, navegação Início/Coleção/Decks/Jogar/Perfil, indicação da conta e logout. Admins veem também Painel administrativo. As telas usam standalone, `loadComponent` e CSS próprio, sem nova biblioteca de UI.

`GameLayoutComponent` contém o outlet das páginas e acompanha revogação de sessão/perfil. Sua sidebar no desktop se adapta a cabeçalho e navegação horizontal em telas menores; o CSS do tema fica no layout e os estilos comuns das páginas em `game-page.css`, sem substituir o tema administrativo.

`authenticatedGuard` e `authenticatedChildGuard` aguardam a sessão e aceitam um UID com `role`/`roleId` consistentes em `member` ou `admin`. Perfil ausente, inválido ou não resolvido não libera `/game`; o destino solicitado segue em `returnUrl` para `/login`. Guards protegem navegação, sem ampliar permissões de Firestore/Storage.

Início oferece saudação e atalhos. Coleção, decks e jogar são estruturas visuais com estados em desenvolvimento, sem consultas ao catálogo, downloads de arte, persistência, contadores fictícios ou infraestrutura de gameplay. Perfil consome a sessão de `AuthService` e encaminha gerenciamento de credenciais para `/login`. Não há acesso direto ao Firestore pelas páginas nem novos serviços de coleção/decks/partidas. Veja [autenticação](autenticacao-e-admin.md) para os destinos após login e [riscos](riscos-e-dividas-tecnicas.md) para o limite dos assets administrativos.

## Editor compartilhado

`CardEditorComponent` orquestra carregamento, salvamento, assets, rascunhos, templates, importação e exportação. Estado/assets são fornecidos no próprio editor; outra instância não compartilha seleção ou histórico.

```text
cards/
  card-list/
  card-preview/
  card-create/
  card-edit/
  card-editor/
    card-editor.component
    card-canvas/
    card-toolbar/
    element-library/
    card-layers/
    card-properties/
    card-data/
```

Os cinco painéis usam `CardEditorStateService` e emitem intenções de ação, arquivo ou validade. Eles não persistem nem manipulam nós Konva. `CardDataComponent` permanece montado ao trocar de modo, preservando campos ainda inválidos; o estado recebe os últimos dados válidos.

`CardCanvasComponent` conecta o estado ao `CardKonvaRenderer`. O renderer mantém Stage, conteúdo, overlays e grupos por ID; `card-konva-elements.ts` desenha os tipos. Konva representa `CardCanvasData`, sem se tornar a fonte persistida. Estado, nós, arquivos e Firebase permanecem separados.

`card-filter-cache.ts` compartilha limites e recorte de caches de efeitos entre renderer e exportação. A moldura usada pelo cache acompanha clones como atributo Konva somente de runtime; não entra em `CardCanvasData`. Alinhamento e presets alteram o documento pelo serviço de estado, sem writes Firebase por interação.

`card-ornament-presets.ts` define seis temas e constrói composições de camadas tipadas, conservando dados/assets ao recriar um layout. `card-ornament-renderer.ts` desenha molduras e emblemas vetoriais a partir dos parâmetros persistidos; `card-konva-elements.ts` encaminha os tipos `frame`/`emblem` para ele. Biblioteca e Propriedades operam pelo serviço de estado, com histórico e bloqueios, sem novas dependências ou serviço de IA.

## Arquivos relevantes

```text
model/interfaces/Auth/auth-session.ts
model/interfaces/Cards/{card,card-canvas,card-template}.ts
model/interfaces/Users/user-profile.ts
model/guards/{auth,card-editor-leave}.guard.ts
model/services/fire/{auth,card-storage}.service.ts
model/services/fire/{google-auth-flow,password-auth-flow}.ts
model/services/cruds/cards/{card,card-template}.service.ts
model/services/cruds/cards/card-persistence.ts
model/services/cruds/users/user.service.ts
model/services/tools/card-editor-state.service.ts
model/services/tools/card-editor-assets.service.ts
model/services/tools/card-local-draft.service.ts
model/services/tools/card-canvas-factory.ts
model/services/tools/card-ornament-presets.ts
model/services/tools/card-ornament-renderer.ts
model/services/tools/card-canvas-validation.ts
model/services/tools/card-konva-renderer.ts
model/services/tools/card-konva-elements.ts
model/services/tools/card-filter-cache.ts
model/services/tools/card-export.service.ts
model/services/tools/card-preview.service.ts
model/services/tools/card-saved-document.ts
```

Listas carregam sob demanda e permitem retry, sem listener permanente da coleção inteira. Auth observa a conta e seu perfil. O dashboard não consulta dados apenas para preencher contadores. Leia [editor](editor-de-cartas.md), [cartas](cartas.md) e [autenticação](autenticacao-e-admin.md) antes de alterar esses fluxos.

O catálogo possui modo de tabela e galeria. `CardPreviewComponent` gerencia visibilidade, cancelamento e a URL final da imagem; `CardPreviewService` limita renderizações a dois jobs, baixa assets autenticados e gera PNG pelo renderer existente. Não há editor interativo nem Stage permanente em cada item. `savedCardDocument` adapta o modelo salvo/legado para uso tanto no editor como na galeria, mantendo uma fonte para essa compatibilidade.
