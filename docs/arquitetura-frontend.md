# Arquitetura frontend

Esta fundação usa Angular 18 standalone, `inject()`, Reactive Forms e signals para estado visual. Firebase modular, sem compat. A autenticação foi adiada a pedido do proprietário: não há serviço de sessão nem guards ativos nesta versão.

```text
view = apresentação/orquestração
model/interfaces = contratos
model/services/cruds = domínio/persistência
model/services/fire = infraestrutura Firebase/Storage
model/services/tools = utilitários reutilizáveis
```

Componentes não acessam Firestore diretamente. Persistência e compensação de cartas são responsabilidade de `CardService`; arquivos de `CardStorageService`; perfis de `UserService`. `model/guards` e infraestrutura Auth poderão ser acrescentados quando a autenticação for implementada.

## Rotas e layout

`/admin` redireciona para `/admin/dashboard`; `/admin/cartas` redireciona para `/admin/cartas/lista`; `/admin/cartas/criar`; `/admin/cartas/editar/:id`. Usuários: `/admin/usuarios` redireciona para `/admin/usuarios/lista`; `/admin/usuarios/criar` vincula perfil; `/admin/usuarios/editar/:uid` consulta/edita. Telas usam `loadComponent` e shell próprio sem guards. A raiz abre `/admin/dashboard`.

`/login` é somente um placeholder com mensagem e link para o painel. Não contém formulário, inputs, chamadas Auth, estado de sessão, login ou logout. A navegação administrativa está aberta; as permissões de dados continuam sendo responsabilidade das Rules, que exigem administrador nas operações protegidas.

O menu contém Painel, Todas as cartas, Criar carta, Todos os usuários e Vincular perfil. Novas áreas serão acrescentadas quando implementadas. Criação e edição de cada domínio compartilham seu formulário; wrappers de rota apenas escolhem modo/id. Listas tratam carregamento, vazio e falha. Cartas pedem confirmação de exclusão; usuários pedem confirmação ao atribuir/mudar cargo.

```text
src/app/model/
  interfaces/Cards/card.ts
  interfaces/Users/user-profile.ts
  services/fire/card-storage.service.ts
  services/cruds/cards/card.service.ts
  services/cruds/users/user.service.ts
  services/tools/card-validation.ts
  services/tools/user-validation.ts
src/app/view/
  auth/login/
  admin/layout/
  admin/admin-components/dashboard/
  admin/admin-components/cards/{card-list,card-create,card-edit,card-form}/
  admin/admin-components/users/{user-list,user-create,user-edit,user-form}/
```

O componente raiz contém apenas o router outlet. `app.config.ts` fornece Firebase App/Firestore/Storage, sem `provideAuth`. Não há chamadas de rede no painel só para mostrar contadores; ele apresenta atalhos reais. As listas são carregadas sob demanda e podem ser recarregadas, sem listener permanente de toda a coleção. Sem autenticação no frontend, um backend que aplique as Rules deste repositório rejeita a listagem administrativa, gravações e acesso privado às artes.
