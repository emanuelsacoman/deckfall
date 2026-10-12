# Autenticação e administrador

## Fluxos implementados

`/login` oferece entrar por e-mail/senha, registrar, recuperar senha e entrar com Google via popup, com fallback por redirecionamento quando o popup está bloqueado ou o ambiente não suporta essa operação. Com sessão ativa, apresenta **Minha conta** e os métodos de acesso. Cadastro por e-mail usa senha mínima local de seis caracteres e nome opcional até 120. Não persistir senhas em Firestore nem arquivos. `app.config.ts` fornece Firebase App, Auth, Firestore e Storage.

`AuthService` observa Authentication, prepara um perfil mínimo se ainda não existe e acompanha `users/{uid}` em tempo real. Novos perfis recebem displayName/contactEmail da identidade, `role:member`, `roleId:member` e timestamps de servidor. Perfil existente não é sobrescrito pelo login ou Google. Cadastro nunca concede admin.

Estado da sessão usa undefined durante resolução, null sem sessão e AuthSession após identificar conta/perfil. A resolução possui timeout de 15 segundos, nega acesso protegido em falhas e ignora callbacks de sessões antigas. Uma conta autenticada com falha no perfil pode aparecer com papéis null e mensagem para conferir Rules; não recebe acesso a `/game` nem `/admin`.

`AuthSession` expõe os papéis e os dados de apresentação já existentes no perfil: `displayName` prefere o nome do perfil quando disponível, com fallback para a identidade Auth, e `contactEmail` vem do perfil. `email` e métodos de acesso continuam vindo de Firebase Authentication. Essa projeção não acrescenta campos persistidos nem sincroniza contato com credenciais.

Login e cadastro são operações de Auth separadas do Firestore. Se a conta foi criada e a preparação do perfil falhou, use Entrar para tentar novamente; não presumir que a conta foi desfeita. Conta desativada, credencial inválida e método de acesso diferente recebem mensagens específicas. A UI limpa a senha após autenticar/trocar de modo.

## Google, vinculação e fallback

Sem sessão, Google usa `signInWithPopup`. Se a conta já está autenticada por e-mail/senha, o botão **Vincular Google a esta conta** usa `linkWithPopup`, preservando o UID e o perfil Firestore existente. O botão está disponível para membros e administradores. Se Google já está vinculado, **Confirmar acesso com Google** usa reautenticação da mesma conta; não troca silenciosamente para outro UID. Novos perfis continuam sendo member, independentemente do provedor.

Somente `auth/popup-blocked` e `auth/operation-not-supported-in-this-environment` iniciam o fallback correspondente: `signInWithRedirect`, `linkWithRedirect` ou `reauthenticateWithRedirect`. A navegação por redirect ocorre na mesma aba e retorna à aplicação; o popup é a janela separada. Cancelamento do popup pelo usuário, falha de rede e conflito de contas não iniciam redirecionamento automático. Um erro do próprio redirect é propagado, sem apresentar sucesso fictício.

Na inicialização, `getRedirectResult` recupera o resultado e passa pela mesma preparação de perfil, somente se ausente, e resolução de permissões. O listener Auth e a recuperação de redirect compartilham a resolução do UID para evitar preparação duplicada. Falha ao vincular ou cancelamento conserva a sessão existente e seu listener de permissões; mudanças de papel continuam sendo observadas.

O resultado de redirect conserva `operationType` apenas em runtime. `completedSignInRedirect` sinaliza à tela de login que um `signIn` terminou; ela consome o sinal com `clearSignInRedirect` e aplica o mesmo destino por papel/`returnUrl` de um login por popup ou senha. Resultados `link` e `reauthenticate` não acionam essa navegação, preservando Minha conta e o formulário de adição de senha. Nenhum estado OAuth novo é persistido.

Se Firebase retornar `auth/account-exists-with-different-credential`, a interface orienta entrar pelo método existente. Uma credencial Google pendente pode ficar apenas em memória e ser vinculada depois de login por senha na conta com o mesmo e-mail. Ela é descartada após o uso, ao entrar em outra conta, ao iniciar outra tentativa Google ou ao sair. Não persistir credenciais OAuth, imprimir tokens ou tentar mesclar/excluir contas automaticamente. `auth/credential-already-in-use` exige resolver a conta existente; a aplicação não faz merge. Não diagnosticar esses códigos como a causa de um problema sem recebê-los do SDK.

Esse fluxo adapta a combinação popup/redirect da referência [Café Sacoman](https://github.com/emanuelsacoman/ecommercecoffee/blob/ec3ebf61218848767cea5572154f2c0e1eac3bcc/src/app/view/auth/login/login.component.ts), usando APIs modulares e vinculação segura do UID atual. Referências: [Google sign-in](https://firebase.google.com/docs/auth/web/google-signin) e [vinculação de provedores](https://firebase.google.com/docs/auth/web/account-linking).

## Minha conta e acesso por senha

Todos os titulares autenticados, membros ou admins, gerenciam os próprios métodos em `/login`. O shell admin tem o atalho **Minha conta**; `/game/perfil` oferece **Gerenciar minha conta** para a mesma tela. A tela mostra Google e e-mail/senha a partir de `providerData` do Firebase Auth, sem espelhá-los no Firestore. Ações de vínculo permanecem na tela da conta, sem redirecionar para a área do jogador ou painel.

Campos de senha e confirmação são limpos quando o UID muda ou a sessão é encerrada, incluindo alterações reconhecidas pelo listener a partir de outra aba.

Uma conta com Google e sem o provedor `password` pode usar **Adicionar acesso com e-mail e senha**. O formulário exige senha de pelo menos seis caracteres e confirmação igual; o Firebase também aplica a política configurada no projeto. `AuthService.addPassword` usa exclusivamente o e-mail atual do Auth, confirma identidade com `reauthenticateWithPopup` e vincula `EmailAuthProvider.credential` via `linkWithCredential`. Não chama cadastro, não altera a senha de um provedor já vinculado e não escreve o perfil. UID, papéis e listener de permissões são preservados, inclusive em falhas.

Popup bloqueado usa `reauthenticateWithRedirect`. Os campos são limpos antes da operação e a senha não é armazenada para sobreviver à navegação. Ao retornar, informe a senha novamente: um resultado de reautenticação Google com o mesmo UID e `authTime` recente permite concluir o vínculo sem repetir o popup bloqueado. A comprovação existe apenas em memória, expira em cinco minutos e é consumida uma vez ou descartada ao sair/iniciar outra operação Google. Mudança de UID/e-mail durante a operação interrompe o vínculo. Cancelamento, credencial em outra conta e falhas do SDK são informados; não há merge automático.

## Esqueci minha senha

Na tela de entrada, **Esqueci minha senha** abre um formulário somente de e-mail, preservando o endereço já digitado. `AuthService.sendPasswordReset` valida/normaliza o endereço e chama `sendPasswordResetEmail`; não autentica, não muda a sessão e não consulta ou escreve perfis. Contas com senha vinculada também têm **Redefinir minha senha por e-mail** em Minha conta.

O pedido apresenta uma resposta neutra: se houver uma conta, o usuário receberá um link. `auth/user-not-found` também produz essa resposta, sem expor a existência de contas. Rede, limite de tentativas e configuração incorreta continuam sendo erros. O SDK solicita português (`pt-BR`); remetente, entrega e templates dependem do Firebase Console. O link conclui a redefinição na página hospedada padrão do Firebase; não há senha ou token de recuperação na aplicação. Referência: [gerenciamento e recuperação de senha](https://firebase.google.com/docs/auth/web/manage-users).

## Área do jogador, admin e Rules

`isAuthenticatedSession` exige UID não vazio e **ambos** os campos de papel iguais a `member` ou a `admin`. Perfis mínimos antigos com somente `role`/`roleId` continuam aceitos; nome e contato não são requisitos de autorização. `authenticatedGuard` e `authenticatedChildGuard` protegem o shell e os filhos de `/game` para membros e admins. Sem sessão/perfil válido, a navegação segue para `/login?returnUrl=...`.

Administrador continua exigindo **ambos** `role == admin` e `roleId == admin`. `adminGuard` e `adminChildGuard` protegem `/admin`; member não recebe acesso administrativo. E-mail não concede autorização. Os layouts observam perda de sessão/papel permitido e voltam ao login. Logout limpa o estado local e chama Firebase; eventual falha no servidor é informada.

Ao entrar ou registrar sem destino válido, member segue para `/game/home` e admin para `/admin/dashboard`. `returnUrl` tem prioridade quando corresponde a uma rota interna existente autorizada para o papel: `/game` e suas páginas são permitidas para ambos, `/admin` e suas rotas somente para admin. Destinos externos, rotas desconhecidas e rotas administrativas solicitadas por member usam o destino padrão. Abrir `/login` autenticado continua mostrando Minha conta.

Rules são a barreira dos dados. Cadastro autenticado pode criar somente o próprio perfil member, com contactEmail igual ao e-mail do token. Membros leem o próprio perfil e não fazem update ou autopromoção. Admin gerencia cards, templates e perfis; exclusão de perfil e próprio rebaixamento são bloqueados.

A área do jogador não cria coleções, documentos iniciais de gameplay ou permissões novas. Coleção, decks e jogar usam placeholders locais; artes/assets do Storage e templates continuam administrativos. O acesso de member a `/game` não concede acesso ao catálogo administrativo nem à leitura de imagens privadas.

A tela de usuários atual não identifica o próprio perfil para bloquear o rebaixamento localmente; a tentativa continua sendo recusada pelas Rules. Alterações de papel pedem confirmação. Não há garantia global de último administrador entre várias sessões; recuperação cabe ao proprietário no Console.

## Bootstrap do primeiro administrador

Nenhum botão da aplicação promove a primeira conta. Conferência/publicação remota é uma ação externa futura; não foi realizada nesta entrega.

1. Confirme o projeto do Web App nos environments e no Firebase Console. A configuração local existente aponta para `cardgame-6fdcb`; não invente outro projeto/bucket.
2. Em Authentication → Sign-in method, habilite Email/Password e Google, incluindo a configuração exigida pelo Console para o provedor Google.
3. Confira Authorized domains para localhost e o domínio final. Confira também o domínio Auth do SDK e os URIs OAuth exigidos para o redirect; não invente nem altere environments automaticamente para tentar corrigir um erro.
4. Crie a conta do proprietário em Authentication ou cadastre-a pela aplicação depois de configurar as Rules. Copie o UID; a tela da conta sem acesso também mostra esse identificador.
5. Confirme o Firestore padrão e sua região. Crie/edite `users/{UID_EXATO}` com strings `role = admin` e `roleId = admin`. Nome/contato/datas podem ser completados depois; o perfil mínimo é compatível.
6. Confirme Storage, bucket e integração IAM de Rules Storage → Firestore quando solicitada.
7. Em uma ação futura autorizada, publique as Rules/índices revisados. Não executar deploy nesta fase.
8. Entre novamente se o perfil anterior falhou; confira acesso às rotas, operações de dados e logout. O listener reconhece alterações de papel em uma sessão com perfil observado.

Criar a conta Auth, conhecer seu e-mail ou vincular um perfil não concede admin. Depois do bootstrap, administradores podem atribuir papéis a outros perfis pelo painel, sujeitos às Rules.

O redirect depende da configuração de `authDomain` e das políticas de armazenamento do navegador. Firebase documenta configurações específicas para domínios customizados e `web.app`, incluindo o handler `/__/auth/handler`. Consulte [boas práticas de redirect](https://firebase.google.com/docs/auth/web/redirect-best-practices) antes de configurar o domínio real; o fallback no código não substitui essa configuração. Nenhum domínio, URI OAuth ou serviço remoto foi alterado neste trabalho.

## Perfis e credenciais

`/admin/usuarios/lista` trabalha com perfis Firestore. Vincular por UID não cria nem verifica contas Auth de terceiros; copie o UID exato no Console. `contactEmail` é contato administrativo, separado do e-mail de login. Editá-lo não altera senha, e-mail Auth ou métodos de acesso. O próprio titular vincula métodos em Minha conta; administradores não vinculam Google nem definem senhas de terceiros pelo painel. Não há backend Admin SDK nesta fase.

## Configuração local e imagens

Copie [environment.example.ts](config/environment.example.ts) para os dois environments e preencha somente valores públicos do SDK. Use production false no development. Arquivos reais continuam ignorados; nunca adicionar service accounts, chaves privadas, tokens ou senhas.

`getBlob` exige CORS do bucket para download direto no navegador, além das Rules. A captura mostrou ausência de `Access-Control-Allow-Origin` para `http://localhost:4200`. No bucket configurado `cardgame-6fdcb.firebasestorage.app`, a consulta inicial confirmou CORS vazio; após autorização explícita, GET para essa origem foi adicionado e confirmado em 11/10/2026. Siga [o guia de CORS](configuracao-cors-storage.md) para estado verificado, backups e futuras alterações. Não substituir uma lista desconhecida pelo [exemplo mínimo](config/storage.cors.example.json), pois isso removeria origens existentes.

CORS não concede autorização Firebase. O editor agora abre os dados antes dos downloads e oferece tentativa manual em falhas; imagens/exportação dependem de acesso aos arquivos. Alterações remotas continuam sendo uma etapa explícita do proprietário conforme o guia. Provedores, domínios, IAM e Rules remotas não foram verificados no Console; consulte [riscos](riscos-e-dividas-tecnicas.md).
