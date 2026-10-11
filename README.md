# Deckfall

Uma plataforma de cartas digitais de Emanuel Sacoman, construída para crescer a partir de um catálogo bem organizado.

O Deckfall começa pela administração: cada carta possui dados estruturados, atributos e uma arte associada. A imagem é uma representação visual; os dados da carta são a fonte de verdade para futuras experiências de jogo.

## Estágio atual

A fundação administrativa está em desenvolvimento. O painel e os formulários de cartas e perfis podem ser acessados diretamente; a autenticação foi adiada por decisão do proprietário. `/login` é apenas uma página de apresentação com link para o painel, sem formulário ou autenticação.

Os serviços continuam usando Firestore e Storage reais. As Rules deste repositório exigem um administrador autenticado para as operações administrativas; sem sessão, essas operações são rejeitadas pelo backend que aplica essas Rules. Abrir o painel não concede acesso aos dados nem torna o CRUD livre.

O jogo, decks, packs, batalhas, inventário, trocas e marketplace ficam para etapas futuras.

O backend remoto ainda depende da conferência e configuração do proprietário no Firebase Console, incluindo a publicação das Rules atualizadas. Não houve deploy nesta entrega.

## O que já está preparado

- **Painel aberto:** navegação direta para cartas e usuários, com rotas carregadas sob demanda.
- **Cartas:** telas e serviços para listar, criar, editar e excluir com confirmação; nome, descrição, raridade, status e atributos extensíveis de 0 a 100.
- **Arte:** suporte a PNG, JPEG ou WebP no Firebase Storage, com metadados no Firestore e tratamento de falhas parciais.
- **Usuários:** telas e serviços para consultar, vincular por UID e editar perfis e papéis, com confirmação de alterações de cargo.
- **Rules preservadas:** operações administrativas exigem perfil com `role` e `roleId` iguais a `admin`. Metadados de cartas `published` podem ser lidos publicamente no Firestore; a arte continua restrita ao administrador.
- **Memória operacional:** documentação de arquitetura, autenticação, dados e fluxos para orientar o desenvolvimento contínuo.

### Gestão de usuários

As telas de usuários trabalham com **perfis Firestore** em `users/{uid}`, associados pelo UID a uma conta Authentication já existente. O modelo inclui os papéis `admin` e `member`. A persistência continua sujeita às Rules de administrador, embora a navegação esteja aberta nesta etapa.

O bootstrap do primeiro administrador no Firebase Console está documentado para a futura autenticação; ele não habilita login nesta versão. `contactEmail` é um dado de contato, separado do e-mail da conta Auth. Vincular um perfil não cria nem verifica uma conta Auth. Não há cadastro público, listagem de todas as contas Authentication, exclusão de contas, alteração de senhas ou backend Admin SDK.

## Stack e organização

| Camada | Base atual |
| --- | --- |
| Frontend | Angular 18.2.14, TypeScript 5.5.4 e componentes standalone |
| Firebase | AngularFire 18.0.1 e Firebase SDK 10.14.1 |
| Interface e estado | Reactive Forms, signals, RxJS e rotas com lazy loading |
| Dados e arquivos | Firestore e Firebase Storage com APIs modulares |
| Validação | Jasmine/Karma e testes de Security Rules em emuladores |

`view/` cuida da apresentação e orquestração; `model/interfaces/` define contratos; `model/services/` concentra domínio, persistência e infraestrutura. Veja [a arquitetura](docs/arquitetura-frontend.md) para os detalhes. As versões instaladas foram preservadas.

## Começar localmente

```powershell
npm.cmd ci
```

Em um clone novo, copie [o exemplo de environment](docs/config/environment.example.ts) para `src/environments/environment.ts` e `src/environments/environment.development.ts`. Preencha a configuração pública do Web App Firebase e use `production: false` no arquivo de desenvolvimento. Os environments locais são ignorados pelo Git; não adicione credenciais administrativas.

Consulte [o estado da autenticação e do admin](docs/autenticacao-e-admin.md) para entender as permissões do backend e a configuração futura. Depois execute:

```powershell
npm.cmd start
```

Abra `http://localhost:4200/` ou `/admin/dashboard`. `/login` contém apenas uma mensagem e um link para o painel. É possível navegar pela interface; não há sessão autenticada criada pela aplicação para executar operações administrativas no Firebase.

O gerador inicial já foi executado. Não repita `npm run setup` nesta base: ele pode sobrescrever arquivos de configuração auxiliares.

## Testar e compilar

```powershell
npm.cmd test -- --watch=false --browsers=ChromeHeadless
npm.cmd run build -- --configuration production
npm.cmd run test:rules
git diff --check
```

Os testes Angular precisam do Chrome. Os testes de Rules precisam da Firebase CLI e Java compatíveis; nesta máquina, a CLI 15.9.0 foi validada com Java 21. `test:rules` usa somente os emuladores Firestore/Storage e o projeto isolado `demo-cardgame`.

Os resultados e as instruções detalhadas estão no [contexto operacional](docs/contexto-operacional-para-ias.md). Consulte [riscos e pendências](docs/riscos-e-dividas-tecnicas.md) antes de depender do backend remoto.

A versão simplificada passou em **41 testes Angular, 13 cenários de Rules e build de produção**. As verificações são locais; a autenticação do frontend permanece para uma etapa futura.

## Documentação e desenvolvimento

- [Índice da memória operacional](docs/README.md)
- [Arquitetura frontend](docs/arquitetura-frontend.md)
- [Autenticação e administração](docs/autenticacao-e-admin.md)
- [Gestão de usuários e cargos](docs/usuarios.md)
- [Cartas, arte e fluxos de edição](docs/cartas.md)
- [Modelo de dados Firestore](docs/modelo-dados-firestore.md)
- [Guia para agentes](AGENTS.md)

O README e os documentos de domínio acompanham cada trabalho relevante. A [regra de apresentação do README](docs/apresentacao-readme.md) mantém esta página fiel às capacidades, ao estágio e às condições reais do projeto.
