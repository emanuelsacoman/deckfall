# Autenticação e administrador

## Fluxos implementados

`/login` oferece entrar por e-mail/senha, registrar e entrar com Google via popup. Cadastro por e-mail usa senha mínima local de seis caracteres e nome opcional até 120. Não persistir senhas em Firestore nem arquivos. `app.config.ts` fornece Firebase App, Auth, Firestore e Storage.

`AuthService` observa Authentication, prepara um perfil mínimo se ainda não existe e acompanha `users/{uid}` em tempo real. Novos perfis recebem displayName/contactEmail da identidade, `role:member`, `roleId:member` e timestamps de servidor. Perfil existente não é sobrescrito pelo login ou Google. Cadastro nunca concede admin.

Estado da sessão usa undefined durante resolução, null sem sessão e AuthSession após identificar conta/perfil. A resolução possui timeout de 15 segundos, nega admin em falhas e ignora callbacks de sessões antigas. Uma conta autenticada com falha no perfil pode aparecer com papéis null e mensagem para conferir Rules; não recebe acesso administrativo.

Login e cadastro são operações de Auth separadas do Firestore. Se a conta foi criada e a preparação do perfil falhou, use Entrar para tentar novamente; não presumir que a conta foi desfeita. Popup bloqueado/cancelado, conta desativada, credencial inválida e método de acesso diferente recebem mensagens específicas. A UI limpa a senha após autenticar/trocar de modo.

## Admin, guard e Rules

Administrador exige **ambos** `role == admin` e `roleId == admin`. E-mail não concede autorização. Guards aguardam sessão/perfil no shell e nos filhos de `/admin`; destino interno pode ser conservado em returnUrl. O layout observa perda de sessão/papel e volta ao login. Logout limpa o estado local e chama Firebase; eventual falha no servidor é informada.

Rules são a barreira dos dados. Cadastro autenticado pode criar somente o próprio perfil member, com contactEmail igual ao e-mail do token. Membros leem o próprio perfil e não fazem update ou autopromoção. Admin gerencia cards, templates e perfis; exclusão de perfil e próprio rebaixamento são bloqueados.

A tela de usuários atual não identifica o próprio perfil para bloquear o rebaixamento localmente; a tentativa continua sendo recusada pelas Rules. Alterações de papel pedem confirmação. Não há garantia global de último administrador entre várias sessões; recuperação cabe ao proprietário no Console.

## Bootstrap do primeiro administrador

Nenhum botão da aplicação promove a primeira conta. Conferência/publicação remota é uma ação externa futura; não foi realizada nesta entrega.

1. Confirme o projeto do Web App nos environments e no Firebase Console. A configuração local existente aponta para `cardgame-6fdcb`; não invente outro projeto/bucket.
2. Em Authentication → Sign-in method, habilite Email/Password e Google, incluindo a configuração exigida pelo Console para o provedor Google.
3. Confira Authorized domains para localhost e o domínio final. Permita o popup do Google no navegador quando necessário.
4. Crie a conta do proprietário em Authentication ou cadastre-a pela aplicação depois de configurar as Rules. Copie o UID; a tela da conta sem acesso também mostra esse identificador.
5. Confirme o Firestore padrão e sua região. Crie/edite `users/{UID_EXATO}` com strings `role = admin` e `roleId = admin`. Nome/contato/datas podem ser completados depois; o perfil mínimo é compatível.
6. Confirme Storage, bucket e integração IAM de Rules Storage → Firestore quando solicitada.
7. Em uma ação futura autorizada, publique as Rules/índices revisados. Não executar deploy nesta fase.
8. Entre novamente se o perfil anterior falhou; confira acesso às rotas, operações de dados e logout. O listener reconhece alterações de papel em uma sessão com perfil observado.

Criar a conta Auth, conhecer seu e-mail ou vincular um perfil não concede admin. Depois do bootstrap, administradores podem atribuir papéis a outros perfis pelo painel, sujeitos às Rules.

## Perfis e credenciais

`/admin/usuarios/lista` trabalha com perfis Firestore. Vincular por UID não cria nem verifica contas Auth de terceiros; copie o UID exato no Console. `contactEmail` é contato administrativo, separado do e-mail de login. Editá-lo não altera senha, e-mail Auth ou métodos de acesso. Não há backend Admin SDK nem gestão de credenciais nesta fase.

## Configuração local e imagens

Copie [environment.example.ts](config/environment.example.ts) para os dois environments e preencha somente valores públicos do SDK. Use production false no development. Arquivos reais continuam ignorados; nunca adicionar service accounts, chaves privadas, tokens ou senhas.

`getBlob` pode exigir CORS do bucket, além das Rules. [storage.cors.example.json](config/storage.cors.example.json) permite GET de localhost:4200; revise as origens antes de aplicar externamente. O proprietário pode usar Google Cloud CLI/Cloud Shell depois de conferir o bucket:

```text
gcloud storage buckets update gs://SEU_BUCKET --cors-file=docs/config/storage.cors.example.json
```

Esse comando não foi executado nesta tarefa. CORS não concede autorização Firebase. Provedores, domínios, IAM, CORS, banco/bucket e Rules remotas não foram verificados no Console; consulte [riscos](riscos-e-dividas-tecnicas.md).
