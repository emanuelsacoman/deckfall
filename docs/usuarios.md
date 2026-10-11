# Gestão administrativa de usuários

## Escopo desta evolução

As telas e serviços usam perfis `users/{uid}` no Firestore, vinculados pelo UID a contas já existentes no Firebase Authentication. O modelo permite consultar, vincular e editar perfis e atribuir papéis `admin`/`member`.

A navegação está aberta nesta etapa, pois a autenticação foi adiada a pedido do proprietário. Não há usuário corrente, resolução de sessão ou verificação de administrador na UI. Os serviços continuam chamando o Firebase real; as Rules exigem administrador para listar, vincular e editar. Sem uma sessão autenticada, essas operações são rejeitadas pelo backend que aplica essas Rules. Não existe cadastro público nem exclusão de contas.

O SDK cliente não lista todas as contas Auth. Contas sem perfil Firestore não aparecem na lista; o administrador deve copiar o UID em Authentication → Users e vincular o perfil. Vincular um perfil não cria conta Auth e não confirma automaticamente que o UID existe no Auth. Uma integração futura com Admin SDK/backend seria necessária para listar/gerenciar contas e credenciais diretamente.

Referência oficial dessa distinção: [gerenciamento de usuários com Admin SDK](https://firebase.google.com/docs/auth/admin/manage-users).

## Contrato e acesso

`UserProfile` contém UID de leitura, `displayName`, `contactEmail`, `role`, `roleId`, `createdAt` e `updatedAt`. Nome e contato podem estar vazios, permitindo completar o bootstrap mínimo. Metadados/datas ausentes em documentos antigos são apresentados como não informados. `contactEmail` é contato administrativo; alterá-lo não muda o e-mail usado no login.

Papéis centralizados: `admin` e `member`, gravados sempre iguais em `role` e `roleId`. UID é imutável na edição. Cliente grava timestamps de servidor; createdAt existente não muda. Perfis mínimos antigos sem createdAt mantêm a ausência para não inventar data histórica.

Nas Rules preservadas, somente admin lista/vincula/edita perfis; um usuário autenticado pode ler o próprio perfil. Membros não escrevem perfis nem se promovem. Exclusão está bloqueada. As Rules também impedem que um administrador rebaixe a si mesmo. Nesta versão, o formulário e o serviço não identificam o usuário corrente; essa identidade e a proteção correspondente na interface dependem da futura autenticação.

Atribuições/mudanças de cargo pedem confirmação. Na futura operação autenticada, o bloqueio das Rules de próprio rebaixamento não representa uma garantia global de último administrador entre solicitações concorrentes de vários admins. Recuperação continua disponível ao proprietário pelo Firebase Console.

## Primeiro administrador

O primeiro administrador será provisionado no Firebase Console quando a autenticação for implementada. O UID deve ser copiado da conta Authentication e usado em `users/{UID}`, com strings `role = admin` e `roleId = admin`. `/login` não exibe UID autenticado nem observa alterações do perfil nesta versão. Consulte [autenticação e admin](autenticacao-e-admin.md) para separar o estado atual da preparação futura.

## Arquitetura

Contrato em `model/interfaces/Users/user-profile.ts`; validação em `model/services/tools/user-validation.ts`; persistência em `model/services/cruds/users/user.service.ts`. Telas standalone em `view/admin/admin-components/users/`, com lista e formulário compartilhado por vínculo/edição. Rotas `/admin/usuarios/lista`, `/admin/usuarios/criar` e `/admin/usuarios/editar/:uid`.

Edição usa transação e compara os dados/cargo e `updatedAt` da versão carregada; alterações feitas em outra sessão exigem recarregar. Vínculo recusa substituir um perfil existente. A lista inclui perfis mínimos sem nome/datas e ordena localmente por nome, contato ou UID; não há paginação nesta fase.

Não acessar Firestore diretamente nos componentes nem armazenar senhas, tokens, service accounts ou dados de credenciais nos perfis. Atualizar este documento, autenticação, modelo Firestore e README no mesmo trabalho ao alterar a gestão.
