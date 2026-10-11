# Guia de agentes — CardGame / Deckfall

Antes de editar, execute `git status --short`, inspecione a estrutura e leia as configurações relacionadas. Preserve alterações locais. Não execute novamente o gerador de estrutura nem atualize frameworks sem necessidade. Não faça deploy nem altere produção nesta fase.

## Fontes de verdade

1. Código executável.
2. Firebase Rules e configurações.
3. Interfaces e tipos.
4. Testes.
5. Documentação.
6. Comentários e histórico.

Se houver divergência, use o código atual, não invente comportamento, corrija a documentação e registre a dívida/incerteza em `docs/riscos-e-dividas-tecnicas.md`. Separe fatos verificados de decisões e pendências externas.

Estado atual solicitado pelo proprietário: autenticação adiada, `/login` apenas placeholder e admin acessível sem sessão/guards. Os serviços Firebase reais e suas Rules permanecem; navegar não autoriza operações protegidas. Não restabeleça login nem enfraqueça Rules sem uma tarefa que solicite essa mudança.

## Leia apenas o contexto necessário

- Contexto e comandos: [contexto operacional](docs/contexto-operacional-para-ias.md).
- Pastas, componentes e rotas: [arquitetura frontend](docs/arquitetura-frontend.md).
- Placeholder de login, permissões de dados e autenticação futura: [autenticação e admin](docs/autenticacao-e-admin.md).
- Coleções e campos persistidos: [modelo Firestore](docs/modelo-dados-firestore.md).
- CRUD, formulário e arte: [cartas](docs/cartas.md).
- Perfis de usuários e atribuição de cargos: [usuários](docs/usuarios.md).
- Limitações e configuração externa: [riscos e dívidas](docs/riscos-e-dividas-tecnicas.md).
- Apresentação no GitHub e manutenção do README: [regra do README](docs/apresentacao-readme.md).
- Índice: [docs/README.md](docs/README.md).

Atualize os documentos correspondentes no MESMO trabalho ao mudar arquitetura, rotas, autenticação, autorização, pastas, modelo de carta, coleções/campos persistidos, Storage, Rules, fluxo administrativo ou dependências importantes. Não registre suposições como fatos.

Sempre revise e atualize `README.md` no MESMO trabalho relevante: ele deve apresentar bem o projeto no GitHub e acompanhar mudanças de funcionalidades, configuração, arquitetura, estágio, comandos, documentação ou desenvolvimento. Siga [a regra de apresentação](docs/apresentacao-readme.md), mantenha detalhes longos em `docs/` e não invente capacidades nem faça alterações artificiais apenas de data.

Ao terminar uma tarefa relevante, informe: `Documentação impactada: sim/não`, `Documentos atualizados: ...`, `Motivo: ...`.

Use standalone, APIs Firebase modulares e serviços tipados. `view` apresenta/orquestra; persistência fica em `model/services`. Rules controlam dados; na futura autenticação, guards deverão proteger também a navegação e nunca substituir Rules. Nunca adicione senhas, tokens, chaves privadas ou service accounts. Valide testes aplicáveis, build de produção, Rules, `git diff --check` e status antes de concluir.
