# Gestão administrativa de usuários

## Escopo desta evolução

As telas e serviços usam perfis `users/{uid}` no Firestore, vinculados pelo UID a contas já existentes no Firebase Authentication. O modelo permite consultar, vincular e editar perfis e atribuir papéis `admin`/`member`. A edição de um perfil encontrado também permite gerir sua coleção, em uma seção e domínio separados. O estado mínimo de jogador fica em `players/{uid}`, criado pelo backend ao entrar em `/game`, sem ampliar o formulário de identidade/acesso.

A autenticação oferece cadastro por e-mail/senha e Google. Os guards aguardam sessão/perfil e liberam o admin somente com `role` e `roleId` iguais a `admin`. Rules exigem admin para listar, vincular e editar perfis. Novas contas podem criar apenas o próprio perfil `member`, com e-mail igual ao token autenticado. A concessão inicial ocorre depois, via `initializePlayer` ao entrar em `/game`; não é uma gravação do cadastro. Não há exclusão de contas pelo painel.

O SDK cliente não lista todas as contas Auth. O fluxo de autenticação provisiona um perfil member apenas quando não há documento; perfis existentes, inclusive admins, são preservados. Contas sem perfil Firestore ainda podem ser vinculadas manualmente pelo admin com o UID copiado no Console. Vincular um perfil não cria conta Auth e não confirma automaticamente que o UID existe. O Admin SDK atual executa somente Player Bootstrap; listar/gerenciar todas as contas e credenciais exigiria operação backend adicional com autorização própria.

Referência oficial dessa distinção: [gerenciamento de usuários com Admin SDK](https://firebase.google.com/docs/auth/admin/manage-users).

## Métodos de acesso do titular

Cada usuário autenticado pode abrir `/login` como **Minha conta** para consultar seus provedores Auth e vincular Google a uma conta com senha, ou adicionar senha a uma conta Google após reautenticação. Ambos usam o mesmo UID e perfil; não há cadastro duplicado ou alteração de cargo. O menu admin possui um atalho para essa tela. **Esqueci minha senha** permite recuperação por e-mail sem estar autenticado.

Os provedores exibidos vêm da identidade Auth corrente, não do perfil Firestore. O administrador gerencia perfil/contato/cargo e propriedade de cartas dos outros usuários. Vincular credenciais é uma ação do titular, sem armazenar senhas/tokens no documento. Consulte [autenticação](autenticacao-e-admin.md) para fallback, reautenticação e recuperação.

## Contrato e acesso

`UserProfile` contém UID de leitura, `displayName`, `contactEmail`, `role`, `roleId`, `createdAt` e `updatedAt`. Nome e contato podem estar vazios, permitindo completar o bootstrap mínimo. Metadados/datas ausentes em documentos antigos são apresentados como não informados. `contactEmail` é contato administrativo; alterá-lo não muda o e-mail usado no login.

Papéis centralizados: `admin` e `member`, gravados sempre iguais em `role` e `roleId`. UID é imutável na edição. Cliente grava timestamps de servidor; createdAt existente não muda. Perfis mínimos antigos sem createdAt mantêm a ausência para não inventar data histórica.

Nas Rules, admin lista/vincula/edita perfis; autenticado lê o próprio. A única criação permitida a não admins é seu perfil inicial member; membros não alteram perfis nem se promovem. Exclusão e próprio rebaixamento são bloqueados pelas Rules. O formulário confirma mudanças de cargo; segurança e proteção do próprio admin são garantidas no backend, inclusive se o SDK for usado fora da interface.

Atribuições/mudanças de cargo pedem confirmação. O bloqueio das Rules de próprio rebaixamento não representa uma garantia global de último administrador entre solicitações concorrentes de vários admins. Recuperação continua disponível ao proprietário pelo Firebase Console.

## Primeiro administrador

O proprietário pode registrar/entrar em `/login` e copiar o UID exibido para uma conta sem acesso. No Console, completar seu documento `users/{UID}` com strings `role = admin` e `roleId = admin`. O listener acompanha a alteração; não há botão de autopromoção. Consulte [autenticação e admin](autenticacao-e-admin.md) para habilitar provedores e publicar as Rules em uma ação futura autorizada.

## Arquitetura

`UserEditComponent` mantém `UserFormComponent` para perfil e `UserCollectionComponent` para coleção. O formulário emite `profileLoaded`; o wrapper só monta a gestão quando o perfil encontrado corresponde ao UID da rota. Falha, ausência ou troca do perfil não cria coleção órfã nem reutiliza dados do usuário anterior.

Contrato em `model/interfaces/Users/user-profile.ts`; validação em `model/services/tools/user-validation.ts`; persistência em `model/services/cruds/users/user.service.ts`. Telas standalone em `view/admin/admin-components/users/`, com lista e formulário compartilhado por vínculo/edição. Rotas `/admin/usuarios/lista`, `/admin/usuarios/criar` e `/admin/usuarios/editar/:uid`.

Edição usa transação e compara os dados/cargo e `updatedAt` da versão carregada; alterações feitas em outra sessão exigem recarregar. Vínculo recusa substituir um perfil existente. A lista inclui perfis mínimos sem nome/datas e ordena localmente por nome, contato ou UID; não há paginação nesta fase.

Não acessar Firestore diretamente nos componentes nem armazenar senhas, tokens, service accounts ou dados de credenciais nos perfis. Atualizar este documento, autenticação, modelo Firestore e README no mesmo trabalho ao alterar a gestão.

## Gestão da coleção

Em `/admin/usuarios/editar/:uid`, a seção Coleção carrega a propriedade e oferece cartas de `CardService.list()` filtradas por `published`. Conceder/alterar define o total absoluto entre 1 e 9999, limite técnico sem relação com decks. Uma carta já presente reutiliza seu documento; não soma a quantidade informada ao valor anterior.

Remover, inclusive ao definir zero, exige confirmação de remoção de todas as cópias e exclui somente `users/{uid}/collection/{cardId}`. Carta indisponível pode ser removida, mas somente publicadas recebem uma quantidade positiva. `PlayerCollectionService` executa transações e compara quantidade/datas carregadas; alteração concorrente pede recarregar. A UI não altera dados de cartas nem credenciais nessa seção.

Membro consulta apenas sua coleção em `/game/colecao` e não concede, altera ou remove propriedade. O backend soma o starter uma única vez na entrada em `/game`, inclusive para perfis antigos/admins com coleção existente. Não há reset/regrant ou aquisição arbitrária pelo jogador. A visualização administrativa somente leitura de inicialização fica como melhoria posterior; as Rules já permitem leitura de players por admin. Modelo, imagens e limitações ficam em [coleção do jogador](colecao.md) e [Player Bootstrap](player-bootstrap.md).
