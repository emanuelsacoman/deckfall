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
| [Player Bootstrap](player-bootstrap.md) | Callable autenticada, players, starter declarativo, transação única e ambiente local |
| [Editor de cartas](editor-de-cartas.md) | Modelo próprio, Konva, painéis, histórico, bindings, templates e exportação |
| [Usuários](usuarios.md) | Perfis Firestore, vínculo por UID e edição de papéis |
| [Riscos e dívidas](riscos-e-dividas-tecnicas.md) | Pendências externas e limites da implementação |

A aplicação atual usa Firebase Authentication, guards de sessão para `/game` e guards administrativos para `/admin`. Cadastro por e-mail/senha ou Google prepara o perfil member; admin exige `role` e `roleId` iguais a `admin`. Ao entrar em `/game`, o cliente solicita `initializePlayer`; o backend valida a conta e soma uma única vez o starter configurado, criando o estado separado em `players/{uid}`. A coleção conserva a gestão manual administrativa e a consulta pelo titular. O editor persiste dados e canvas próprios; o jogador baixa apenas a representação PNG publicada, sem acesso aos assets editáveis privados.

Consulte código, Rules e tipos quando houver divergência. Atualize documentos e README no mesmo trabalho. Rules/Hosting da coleção foram publicados em uma etapa anterior autorizada; Functions, bootstrap e novas Rules desta etapa não foram publicados. Testes locais não confirmam configuração remota. Antes de usar o novo fluxo no Firebase real, há pendências em [Player Bootstrap](player-bootstrap.md) e [riscos](riscos-e-dividas-tecnicas.md).
