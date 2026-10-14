# Deckfall

Uma plataforma de cartas digitais de Emanuel Sacoman, com área do jogador, editor visual e administração em Angular/Firebase.

Cada carta combina dados estruturados de gameplay com um design editável. A imagem exportada apresenta a carta; dados e elementos continuam disponíveis para edição e futuras experiências de jogo.

## Estágio atual

A implementação reúne o catálogo/editor administrativo, configuração de pacotes, área do jogador, coleção persistida e pacote inicial único decidido pelo backend. **StarterPack** é o nome reservado desse pacote; o administrador escolhe suas cartas publicadas e quantidades em `/admin/pacotes`. O bootstrap concede um pacote lacrado; uma abertura autenticada e atômica concede as cartas antes do reveal visual. Login, cadastro por e-mail/senha e Google usam Firebase Authentication. Novas contas recebem o papel `member` e entram em `/game/home`; admins entram por padrão no painel e também podem navegar em `/game`. Somente perfis com `role` e `roleId` iguais a `admin` entram no painel.

**Functions, Firestore Rules e interface de pacotes foram publicados com autorização do proprietário em 13/10/2026.** O domínio preservado é `https://deckfall.web.app`, site `deckfall` no projeto `cardgame-6fdcb`, e foi acrescentado aos Authorized domains do Auth preservando os existentes. O build remoto e as Rules foram conferidos; as duas Callables estão ativas e recusam chamadas sem autenticação. **O administrador ainda precisa publicar suas cartas e criar/ativar o StarterPack em `/admin/pacotes`.** A publicação não escolheu cartas, configurou conteúdo ou concedeu propriedade. Decks, gameplay, PvP, partidas, loja, economia, trocas e marketplace continuam futuros.

O diagnóstico anterior à correção encontrou `openPack`, definição inicial e cartas publicadas ausentes. A infraestrutura foi publicada; a configuração do conteúdo continua sob escolha do administrador. O frontend local usa o mesmo projeto real por padrão. Até existir StarterPack ativo válido, o gate compartilhado mantém todas as rotas `/game` em preparação/erro com retry, sem concessão parcial. Para desenvolver isolado, use os emuladores; veja [o diagnóstico e a publicação verificada](docs/contexto-operacional-para-ias.md#diagnóstico-da-preparação-bloqueada--13102026).

O CORS do Storage permite `GET` em `http://localhost:4200` e `https://deckfall.web.app`. A resposta real de uma imagem foi conferida nas duas origens; o teste usou a identidade OAuth da CLI e não substitui a verificação da sessão no editor. Para outras origens ou diagnóstico de imagens, siga [a configuração do Storage](docs/configuracao-cors-storage.md), preservando as entradas existentes do bucket.

## Recursos implementados

- **Área do jogador:** layout próprio responsivo em `/game`, com Início, Coleção, Pacotes, Decks, Jogar e Perfil; identidade da conta, logout e acesso ao painel para admins. Decks e partidas permanecem em desenvolvimento.
- **Player Bootstrap:** ao entrar em `/game`, uma Callable autenticada valida a conta e concede exatamente um Starter Pack lacrado, mesmo entre abas. Preparação e erro com nova tentativa precedem o acesso às páginas do jogador; nenhuma carta é concedida nessa preparação.
- **Pacotes e reveal:** Home destaca o starter lacrado; `/game/pacotes` lista instâncias/histórico, e a abertura confirma o backend antes de revelar uma carta por vez. Versão fixa, resultado recuperável após refresh e abertura idempotente; CSS próprio com redução de movimento.
- **Administração de pacotes:** `/admin/pacotes` permite criar definições com conteúdo determinístico, editar informações/ativação e criar versões imutáveis. A configuração dedicada **StarterPack** tem nome fixo e concede somente o inicial pelo backend; outros pacotes ficam como catálogo administrativo, sem distribuição, loja ou economia.
- **Coleção persistida:** cartas somadas pela abertura no backend ou concessões manuais pelo admin, quantidades, busca local e filtro por raridade em `/game/colecao`; o membro consulta somente a própria coleção, sem writes. A carta inteira aparece em PNG publicado separado dos assets privados do editor.
- **Editor Konva:** texto, imagens, arte principal, formas, ícones, molduras, emblemas, atributos e barras; seleção, movimento, resize, rotação, bloqueio, visibilidade e camadas.
- **Ateliê de molduras:** seis temas, bordas ornamentais/rúnicas/simples, doze símbolos vetoriais e emblemas com medalhão, escudo ou sem suporte. Cores, detalhes, largura, cantos, relevo e semente são editáveis; criar uma composição pode ser desfeito.
- **PNG transparente:** imagens já sem fundo preservam a transparência no editor, no salvamento e na exportação PNG, mostrando as camadas da carta por baixo.
- **Personalização visual:** espelhar imagens, ajustar brilho/contraste/saturação/matiz e aplicar estilos Original, Vivo, Vintage ou Preto e branco; bordas contínuas/tracejadas/pontilhadas, decoração de texto e alinhamento à carta.
- **Design, Dados e Preview:** propriedades por tipo, bindings seguros, atributos com limites personalizados, grid, snap, zoom e visualização limpa.
- **Histórico e exportação:** desfazer/refazer, atalhos e PNG/JPEG em 1×, 2× ou 4×, respeitando dimensões reais e orçamento de pixels.
- **Cartas e templates:** salvar/reabrir o modelo próprio no Firestore, uploads organizados no Storage, composição ornamental inicial e Fantasy Basic editáveis, salvar/carregar templates e preparar cópias de cartas.
- **Catálogo em dois modos:** lista administrativa ou galeria de cartas inteiras, com a composição salva, proporção original e acesso à edição ao clicar.
- **Rascunho local:** salvamento manual de documento e imagens em IndexedDB; importação/exportação de JSON para o modelo estruturado.
- **Edição com imagens indisponíveis:** a carta abre sem esperar downloads; falhas têm nova tentativa manual e referências dos arquivos próprios podem ser conservadas ao salvar dados/design.
- **Usuários e coleção:** consultar, vincular por UID e editar perfis Firestore/papéis; na edição de um perfil existente, conceder cartas publicadas, definir quantidade total e remover propriedade com confirmação. Alterar contato não muda credenciais.
- **Minha conta:** vincular Google e e-mail/senha ao mesmo usuário, consultar métodos ativos e recuperar senha por e-mail.
- **Memória operacional:** arquitetura, contratos, fluxos, limites e configuração documentados para futuras sessões e agentes.

O acesso Google tenta popup e continua por redirecionamento quando o navegador o bloqueia. Em **Minha conta**, quem entrou por e-mail/senha pode vincular Google; quem entrou com Google pode adicionar uma senha após confirmar sua identidade. Os dois métodos preservam UID e perfil. **Esqueci minha senha** envia o link de recuperação pelo Firebase. Veja [o fluxo de autenticação](docs/autenticacao-e-admin.md).

O editor usa um modelo versionado próprio. Konva representa esse estado; `stage.toJSON()` não é o banco de dados. Design e gameplay permanecem separados, sem impor um único layout de carta.

Molduras e emblemas vetoriais combinam cores e formas sem depender de emojis. Para acabamentos ilustrados ou texturas detalhadas, combine arte e PNGs transparentes próprios em camadas. O editor não inclui geração de imagens por IA; as variações procedurais usam os estilos e símbolos disponíveis. Veja [o ateliê e seus limites](docs/editor-de-cartas.md#ateliê-de-molduras-e-emblemas).

### Permissões e contas

Guards distinguem a sessão autenticada com perfil válido (`member` ou `admin`) do acesso administrativo. Firestore e Storage Rules protegem os dados. Metadados de cartas `published` podem ser lidos publicamente; artes/assets editáveis e templates permanecem administrativos. Cadastro público cria apenas identidade/acesso em `users/{uid}`, sem autopromoção. `players/{uid}` guarda estado mínimo/marcador; `users/{uid}/packs/{id}` guarda instâncias, e `users/{uid}/collection/{cardId}` conserva somente quantidade e datas. Membros leem seus próprios dados e não escrevem coleção/player/packs; clientes admin também não escrevem player ou instância.

**Angular solicita; o servidor decide.** `initializePlayer` cria instância lacrada e marcador num commit único. `openPack` usa sua `definitionVersion`, valida cartas ainda publicadas e soma as quantidades no mesmo commit de estado/resultado da abertura, preservando a primeira aquisição. Repetições e concorrência não duplicam starter ou conteúdo. Admin SDK ignora Rules, portanto o backend repete suas próprias verificações. Definições ficam em `packDefinitions/{packId}`, com o nome **StarterPack** reservado a `starter`; a administração cria/avança versões atomicamente sem reescrever histórico ou conceder propriedade. O fluxo direto anterior foi removido, sem migração de produção ou reconcessão. A gestão manual administrativa continua disponível. Veja [bootstrap](docs/player-bootstrap.md) e [pacotes](docs/pacotes.md).

A imagem completa fica em `published-cards/{cardId}/preview.png`, acessível por download autenticado somente enquanto a carta está publicada. Salvar com status Publicada gera/atualiza o PNG; Rascunho/Arquivada tenta remover uma representação anterior. Falhas posteriores são avisadas sem desfazer o documento salvo. Cartas publicadas antigas precisam ser reabertas/salvas para gerar essa representação. Veja [coleção, gestão e imagens publicadas](docs/colecao.md).

Um destino interno válido em `returnUrl` tem prioridade após entrar: membros podem voltar às páginas de `/game`, e admins também às rotas de `/admin`. `/login` continua sendo Minha conta com sessão ativa; o Perfil do jogador aponta para essa experiência existente.

A gestão lista **perfis em `users/{uid}`**, não todas as contas Authentication. O primeiro admin é configurado no Console; outros papéis podem ser administrados pelo painel. Cada titular vincula seus métodos e solicita a recuperação da própria senha; o painel não altera credenciais de terceiros nem exclui contas. O backend Admin SDK atende ao bootstrap e abertura de pack, sem gestão de credenciais. Veja [autenticação e admin](docs/autenticacao-e-admin.md).

## Stack e organização

| Camada | Base atual |
| --- | --- |
| Frontend | Angular 18.2.14, TypeScript 5.5.4, standalone e CSS |
| Editor | Konva 10.7.1 diretamente, signals e modelo próprio |
| Firebase | AngularFire 18.0.1 e Firebase SDK 10.14.1, APIs modulares |
| Backend separado | Firebase Functions 7.4.0 Gen 2, Admin SDK 14.5.0, Node.js 22 e TypeScript 5.9.3 |
| Interface | Reactive Forms, RxJS e rotas carregadas sob demanda |
| Validação | Jasmine/Karma, backend com Node Test Runner e Security Rules/emuladores |

`view/` apresenta e orquestra; `model/interfaces/` define contratos; `model/services/` concentra estado, domínio, persistência e infraestrutura. As versões Angular/Firebase foram preservadas. Consulte [a arquitetura](docs/arquitetura-frontend.md) e [o editor](docs/editor-de-cartas.md).

## Começar localmente

```powershell
npm.cmd ci
npm.cmd --prefix functions ci
```

Copie [o exemplo de environment](docs/config/environment.example.ts) para `src/environments/environment.ts` e `src/environments/environment.development.ts`. Preencha os valores públicos do Web App Firebase e use `production: false` no desenvolvimento. Os environments reais são ignorados pelo Git; não adicione credenciais administrativas.

Habilite Email/Password e Google, confira os domínios autorizados e configure o primeiro admin conforme [o bootstrap](docs/autenticacao-e-admin.md). Depois execute:

```powershell
npm.cmd start
```

Abra `http://localhost:4200/`. Após registrar ou entrar como membro, navegue em `/game/home`. Como admin, acesse `/admin/cartas/criar`, `/admin/cartas/lista` ou `/admin/pacotes`; o painel também oferece um atalho para a área do jogador.

Antes do primeiro acesso ao novo `/game`, salve cartas como **Publicada** e use **Configurar StarterPack** em `/admin/pacotes` para escolher conteúdo e ativá-lo. Sem Function disponível ou starter ativo válido, a preparação mostra erro e oferece nova tentativa; a ausência da definição inicial tem mensagem específica e atalho de configuração para admin. Não há configuração remota criada automaticamente nem escolha de cartas pela publicação. Para executar cadastro → pack lacrado → reveal → coleção isolado em localhost, use [o environment exclusivo de emuladores](docs/config/environment.emulators.example.ts) e siga [os emuladores e a configuração do starter](docs/pacotes.md#localhost-isolado).

A gestão manual permanece em `/admin/usuarios/editar/:uid`: salve a carta como publicada e defina a quantidade total na seção Coleção de um perfil existente. A abertura do starter soma à quantidade já concedida, preservando a primeira data de aquisição.

O gerador inicial já foi executado. Não repita `npm run setup`: ele pode sobrescrever configurações auxiliares.

## Testar e compilar

```powershell
npm.cmd test -- --watch=false --browsers=ChromeHeadless
npm.cmd run build -- --configuration production
npm.cmd run test:rules
npm.cmd run build:functions
npm.cmd run test:functions
npm.cmd run test:functions:emulator
git diff --check
```

Os testes Angular precisam do Chrome. Backend usa Node.js 22; emuladores precisam da Firebase CLI e Java compatíveis. Nesta máquina, CLI 15.9.0 e Java 21 são usados para essa validação. `test:rules` executa Firestore/Storage em `demo-cardgame`; `test:functions:emulator` integra Auth/Firestore/Callable no mesmo projeto isolado.

Backend testa uma instância lacrada sem coleção no bootstrap, abertura única/atômica, versão histórica, soma com inventário prévio, limites e falhas sem gravação parcial. Frontend cobre administração/versionamento, preparação, sessão, pacotes, reveal/revisão e lifecycle de URLs; Rules preservam coleção read-only para member e isolam players/packs/configuração. A validação final passou com 506 testes Angular, 67 backend, 15 de integração e 53 de Rules, além dos builds/typechecks. Resultados, publicação conferida e limites ficam no [contexto operacional](docs/contexto-operacional-para-ias.md). Emuladores e verificações remotas sem autenticação não equivalem a starter configurado ou sessão Firebase real; [pacotes](docs/pacotes.md#publicação-posterior) registra publicação e configuração restante. Storage Rules não mudaram.

## Documentação e desenvolvimento

- [Índice da memória operacional](docs/README.md)
- [Editor visual, histórico e templates](docs/editor-de-cartas.md)
- [Cartas, assets e persistência](docs/cartas.md)
- [Coleção do jogador e imagens publicadas](docs/colecao.md)
- [Player Bootstrap, starter e Functions](docs/player-bootstrap.md)
- [Pacotes, abertura e reveal](docs/pacotes.md)
- [Modelo Firestore](docs/modelo-dados-firestore.md)
- [Arquitetura frontend](docs/arquitetura-frontend.md)
- [Autenticação e administração](docs/autenticacao-e-admin.md)
- [Usuários e cargos](docs/usuarios.md)
- [Riscos e configuração externa](docs/riscos-e-dividas-tecnicas.md)
- [Guia para agentes](AGENTS.md)

O README e os documentos de domínio acompanham cada trabalho relevante, conforme [a regra de apresentação](docs/apresentacao-readme.md).
