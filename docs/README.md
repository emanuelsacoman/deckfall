# Memória operacional

O [README principal](../README.md) apresenta o Deckfall no GitHub. Para trabalhar no projeto, comece pelo [AGENTS.md](../AGENTS.md) e abra somente os documentos relacionados à tarefa.

| Documento | Conteúdo |
| --- | --- |
| [Apresentação e manutenção do README](apresentacao-readme.md) | Regra permanente de apresentação fiel ao código |
| [Contexto operacional](contexto-operacional-para-ias.md) | Produto, versões, comandos, ambiente e validação |
| [Arquitetura frontend](arquitetura-frontend.md) | Responsabilidades, componentes, serviços e rotas |
| [Autenticação e admin](autenticacao-e-admin.md) | Login, cadastro, Google, guards, papéis e bootstrap |
| [Modelo Firestore](modelo-dados-firestore.md) | Contratos persistidos e limites das Rules |
| [Cartas](cartas.md) | Gameplay, arte, assets e CRUD com compensação |
| [Editor de cartas](editor-de-cartas.md) | Modelo próprio, Konva, painéis, histórico, bindings, templates e exportação |
| [Usuários](usuarios.md) | Perfis Firestore, vínculo por UID e edição de papéis |
| [Riscos e dívidas](riscos-e-dividas-tecnicas.md) | Pendências externas e limites da implementação |

A aplicação atual usa Firebase Authentication e guards administrativos. Cadastro por e-mail/senha ou Google prepara somente um membro; admin exige `role` e `roleId` iguais a `admin`. O editor persiste dados e canvas próprios, com arquivos separados no Storage.

Consulte código, Rules e tipos quando houver divergência. Atualize documentos e README no mesmo trabalho. Testes locais não confirmam configuração remota nem publicação de Rules; nenhum deploy foi realizado nesta entrega.
