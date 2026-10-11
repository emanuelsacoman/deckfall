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

Estado atual: editor Konva com modelo próprio, login/cadastro por e-mail/senha e Google, guards administrativos e Rules. Cadastro cria membro; primeiro admin é provisionado no Console. Não enfraqueça Rules nem use e-mail como autorização.

## Leia apenas o contexto necessário

- Contexto e comandos: [contexto operacional](docs/contexto-operacional-para-ias.md).
- Pastas, componentes e rotas: [arquitetura frontend](docs/arquitetura-frontend.md).
- Login, cadastro, Google, papéis e bootstrap: [autenticação e admin](docs/autenticacao-e-admin.md).
- Coleções e campos persistidos: [modelo Firestore](docs/modelo-dados-firestore.md).
- Gameplay, CRUD, arte e assets: [cartas](docs/cartas.md).
- Canvas, Konva, histórico, bindings, templates e exportação: [editor de cartas](docs/editor-de-cartas.md).
- Perfis de usuários e cargos: [usuários](docs/usuarios.md).
- Limitações e configuração externa: [riscos e dívidas](docs/riscos-e-dividas-tecnicas.md).
- Apresentação no GitHub: [regra do README](docs/apresentacao-readme.md).
- Índice: [docs/README.md](docs/README.md).

Atualize os documentos correspondentes no MESMO trabalho ao mudar arquitetura, rotas, autenticação, autorização, pastas, modelos de carta/canvas/template, coleções/campos persistidos, Storage, Rules, fluxo administrativo ou dependências importantes. Não registre suposições como fatos.

Sempre revise e atualize `README.md` no MESMO trabalho relevante: ele deve apresentar bem o projeto no GitHub e acompanhar mudanças de funcionalidades, configuração, arquitetura, estágio, comandos, documentação ou desenvolvimento. Siga [a regra de apresentação](docs/apresentacao-readme.md), mantenha detalhes longos em `docs/` e não invente capacidades nem faça alterações artificiais apenas de data.

Ao terminar uma tarefa relevante, informe: `Documentação impactada: sim/não`, `Documentos atualizados: ...`, `Motivo: ...`.

Use standalone, Firebase modular e serviços tipados. `view` apresenta/orquestra; persistência fica em `model/services`. Konva renderiza o estado próprio; nunca persistir `stage.toJSON()`, nós, listeners, histórico, Files ou Blob URLs no Firestore. Design e gameplay são separados, bindings são seguros e o editor permanece genérico. Guards protegem navegação; Rules protegem dados, sem prometer validação profunda de todo canvas no servidor.

Nunca adicione senhas, tokens, chaves privadas ou service accounts. Valide testes aplicáveis, build de produção, Rules, `git diff --check` e status antes de concluir.
