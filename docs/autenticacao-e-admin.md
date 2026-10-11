# Autenticação e administrador

## Estado atual: autenticação adiada

A pedido do proprietário, a aplicação não implementa autenticação nesta etapa. `/login` é apenas um placeholder com uma mensagem e um link para o painel. Não há formulário de login, inputs de credenciais, `AuthService`, estado de sessão, logout, guards ou `provideAuth`.

A raiz e `/admin` abrem `/admin/dashboard`. As rotas de cartas e usuários podem ser visitadas diretamente. O shell não identifica um usuário corrente nem observa alterações de papel. Essa navegação aberta serve ao desenvolvimento da interface; não representa autorização para acessar os dados.

`app.config.ts` continua fornecendo Firebase App, Firestore e Storage. Os serviços de cartas, arte e perfis mantêm as chamadas reais ao Firebase. Não foi acrescentado login anônimo, sessão sintética ou desvio das permissões do backend.

## Permissões de dados preservadas

As Rules deste repositório continuam exigindo um usuário autenticado com documento `users/{uid}` contendo **ambos** `role: "admin"` e `roleId: "admin"` para operações administrativas. E-mail não concede permissão. Os papéis do modelo são `admin` e `member`.

Com essas Rules aplicadas no backend:

- Listagem administrativa e gravação de cartas exigem admin.
- Leitura pública de metadados de cartas é limitada a `published`; drafts e archived não são públicos.
- A arte no Storage exige admin para leitura e gravação.
- Listagem, vínculo e edição de perfis exigem admin; um autenticado pode ler o próprio perfil.
- Membros não se promovem, perfis não podem ser excluídos e o próprio rebaixamento administrativo é negado.

Como a aplicação não cria uma sessão autenticada, as operações protegidas são rejeitadas pelo backend que aplica essas Rules. Não enfraquecer as Rules para tornar o CRUD disponível sem sessão. O estado das Rules remotas não foi consultado nem alterado; não houve publicação ou deploy nesta mudança.

## Preparação para autenticação futura

Quando o login for implementado, usar Firebase Authentication, resolução explícita da sessão/perfil e guards no shell e nas rotas administrativas. Guards protegem a navegação; Firestore e Storage Rules continuam sendo a barreira real dos dados. Não anunciar acesso seguro à UI antes dessa implementação e validação.

O bootstrap abaixo é uma preparação futura e não habilita login nesta versão:

1. Confirme o projeto `cardgame-6fdcb` nos environments e no Firebase Console.
2. Em Authentication → Sign-in method, habilite Email/Password quando esse fluxo for implementado.
3. Em Authentication → Users, crie o proprietário com e-mail/senha e copie seu UID. Não coloque a senha em arquivos ou commits.
4. Confirme o banco Firestore padrão e sua região.
5. Crie `users/{UID_EXATO}` com campos string `role = admin` e `roleId = admin`.
6. Confirme Storage, bucket configurado e integração de Rules Storage → Firestore quando o Console solicitar a permissão necessária.
7. Em uma ação futura autorizada, publique as Rules revisadas. Esta entrega local não publica Rules nem Hosting.
8. Confira domínios autorizados do Auth e valide login, autorização e revogação quando a implementação existir.

Criar uma conta Auth ou um perfil admin no Console não acrescenta um formulário de login à aplicação. O primeiro administrador é provisionado pelo proprietário; a interface não oferece autopromoção.

## Perfis de usuários

As telas `/admin/usuarios/lista`, `/admin/usuarios/criar` e `/admin/usuarios/editar/:uid` administram o modelo de perfis Firestore. Vincular um perfil por UID não cria nem verifica a existência de uma conta Auth. `displayName` e `contactEmail` não alteram credenciais ou o e-mail de login da conta. As gravações permanecem sujeitas às Rules, apesar da navegação aberta. Consulte [gestão de usuários](usuarios.md).

## Configuração local e imagens

Em um clone novo, copie [environment.example.ts](config/environment.example.ts) para os dois arquivos em `src/environments/` e preencha os valores públicos do seu Web App. Use `production:false` no development. Não copie service accounts nem senhas. Os environments reais continuam ignorados conforme a estratégia existente.

Downloads via `getBlob` podem exigir CORS no bucket. [storage.cors.example.json](config/storage.cors.example.json) permite somente GET a partir de `http://localhost:4200`; revise a lista de origens antes de uma configuração externa futura. CORS não é configurável pelo formulário do Firebase Console: o proprietário pode aplicar o arquivo usando Google Cloud CLI/Cloud Shell (`gcloud storage buckets update gs://SEU_BUCKET --cors-file=docs/config/storage.cors.example.json`), depois de conferir o bucket. Esse comando **não foi executado** nesta tarefa. CORS não substitui as Rules. Referência: [downloads diretos Firebase](https://firebase.google.com/docs/storage/web/download-files).
