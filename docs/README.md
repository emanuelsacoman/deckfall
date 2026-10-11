# Memória operacional

O [README principal](../README.md) apresenta o Deckfall para quem chega pelo GitHub. Para trabalhar no projeto, comece pelo [AGENTS.md](../AGENTS.md) e abra somente os documentos ligados à tarefa.

| Documento | Conteúdo |
| --- | --- |
| [Apresentação e manutenção do README](apresentacao-readme.md) | Regra permanente para apresentar o projeto no GitHub e acompanhar mudanças |
| [Contexto operacional](contexto-operacional-para-ias.md) | Produto, reconhecimento, versões, comandos e limites |
| [Arquitetura frontend](arquitetura-frontend.md) | Responsabilidades, estrutura e rotas |
| [Autenticação e admin](autenticacao-e-admin.md) | Placeholder atual, permissões das Rules e preparação futura do primeiro administrador |
| [Modelo Firestore](modelo-dados-firestore.md) | Contratos e campos persistidos |
| [Cartas](cartas.md) | Formulário, CRUD e Storage |
| [Usuários](usuarios.md) | Telas/perfis, vínculo por UID, edição de dados e cargos sujeitos às Rules |
| [Riscos e dívidas](riscos-e-dividas-tecnicas.md) | Pendências verificadas e limitações |

Os documentos foram iniciados após reconhecimento em 11/10/2026 e descrevem esta fundação. Consulte o código quando houver divergência; os resultados de validação ficam no contexto operacional.

Estado atual: admin acessível sem login e `/login` somente placeholder. Autenticação, sessão e guards foram adiados a pedido do proprietário. Os serviços continuam usando Firebase real e as Rules de administrador foram preservadas; abrir a interface não libera as operações protegidas.
