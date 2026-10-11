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

Telas usam `loadComponent`. Raiz e rota desconhecida redirecionam para `/login`, que oferece entrar, registrar e Google.

| Rota | Tela |
| --- | --- |
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

O shell administrativo possui guard no pai e nos filhos, observa revogação de acesso e oferece logout. O menu inclui Painel, Todas as cartas, Criar carta, Todos os usuários e Vincular perfil. Criação/edição de cartas usam wrappers pequenos; `cardEditorLeaveGuard` consulta alterações pendentes antes da saída. A raiz contém o router outlet; `app.config.ts` fornece App, Auth, Firestore e Storage.

## Editor compartilhado

`CardEditorComponent` orquestra carregamento, salvamento, assets, rascunhos, templates, importação e exportação. Estado/assets são fornecidos no próprio editor; outra instância não compartilha seleção ou histórico.

```text
cards/
  card-list/
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

## Arquivos relevantes

```text
model/interfaces/Auth/auth-session.ts
model/interfaces/Cards/{card,card-canvas,card-template}.ts
model/interfaces/Users/user-profile.ts
model/guards/{auth,card-editor-leave}.guard.ts
model/services/fire/{auth,card-storage}.service.ts
model/services/cruds/cards/{card,card-template}.service.ts
model/services/cruds/cards/card-persistence.ts
model/services/cruds/users/user.service.ts
model/services/tools/card-editor-state.service.ts
model/services/tools/card-editor-assets.service.ts
model/services/tools/card-local-draft.service.ts
model/services/tools/card-canvas-factory.ts
model/services/tools/card-canvas-validation.ts
model/services/tools/card-konva-renderer.ts
model/services/tools/card-konva-elements.ts
model/services/tools/card-export.service.ts
```

Listas carregam sob demanda e permitem retry, sem listener permanente da coleção inteira. Auth observa a conta e seu perfil. O dashboard não consulta dados apenas para preencher contadores. Leia [editor](editor-de-cartas.md), [cartas](cartas.md) e [autenticação](autenticacao-e-admin.md) antes de alterar esses fluxos.
