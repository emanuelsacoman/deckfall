# Memória operacional

O [README principal](../README.md) apresenta o Deckfall no GitHub. Para trabalhar no projeto, comece pelo [AGENTS.md](../AGENTS.md) e abra somente os documentos relacionados à tarefa.

| Documento | Conteúdo |
| --- | --- |
| [Apresentação e manutenção do README](apresentacao-readme.md) | Regra permanente de apresentação fiel ao código |
| [Contexto operacional](contexto-operacional-para-ias.md) | Produto, versões, comandos, ambiente e validação |
| [Arquitetura frontend](arquitetura-frontend.md) | Responsabilidades, componentes, serviços e rotas |
| [Autenticação e admin](autenticacao-e-admin.md) | Login, cadastro, vínculo Google/senha, recuperação, guards e bootstrap |
| [CORS do Storage](configuracao-cors-storage.md) | Diagnóstico de imagens bloqueadas, backup e ajuste da origem local |
| [Modelo Firestore](modelo-dados-firestore.md) | Contratos persistidos e limites das Rules |
| [Cartas](cartas.md) | Gameplay, arte, assets e CRUD com compensação |
| [Coleção do jogador](colecao.md) | Propriedade, gestão administrativa, PNG publicado, acesso e limites |
| [Player Bootstrap](player-bootstrap.md) | Callable autenticada, players, concessão única de Starter Pack lacrado e entrada em /game |
| [Pacotes](pacotes.md) | StarterPack reservado, administração de definições/versões, abertura atômica, reveal, emuladores e publicação |
| [Editor de cartas](editor-de-cartas.md) | Modelo próprio, Konva, painéis, histórico, bindings, templates e exportação |
| [Usuários](usuarios.md) | Perfis Firestore, vínculo por UID e edição de papéis |
| [Riscos e dívidas](riscos-e-dividas-tecnicas.md) | Pendências externas e limites da implementação |

A aplicação atual usa Firebase Authentication, guards de sessão para `/game` e guards administrativos para `/admin`. Cadastro por e-mail/senha ou Google prepara o perfil member; admin exige `role` e `roleId` iguais a `admin`. Ao entrar em `/game`, o cliente solicita `initializePlayer`; o backend concede uma única instância lacrada do Starter Pack e registra o estado em `players/{uid}`, sem conceder cartas. `openPack` soma a coleção e persiste estado/resultado atomicamente antes do reveal. A coleção conserva a gestão manual administrativa e a consulta pelo titular. O editor persiste dados e canvas próprios; o jogador baixa apenas a representação PNG publicada, sem acesso aos assets editáveis privados.

Consulte código, Rules e tipos quando houver divergência. Atualize documentos e README no mesmo trabalho. Functions, Firestore Rules e Hosting de pacotes/administração foram publicados e conferidos com autorização em 13/10/2026. O site continua `https://deckfall.web.app`, agora incluído nos Authorized domains do Auth preservando os anteriores. Em 14/10/2026, o proprietário escolheu uma cópia de Nyra: a carta foi publicada e o StarterPack versão 1 ativado, com configuração e imagem relidas e verificadas. A infraestrutura não escolhe conteúdo automaticamente. Testes locais e leituras administrativas não confirmam a sessão real do jogador. Siga os fatos e pendências em [pacotes](pacotes.md), [contexto operacional](contexto-operacional-para-ias.md#configuração-do-starterpack-com-nyra--14102026) e [riscos](riscos-e-dividas-tecnicas.md).
