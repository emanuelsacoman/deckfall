# Deckfall

Uma plataforma de cartas digitais de Emanuel Sacoman, com área do jogador, editor visual e administração em Angular/Firebase.

Cada carta combina dados estruturados de gameplay com um design editável. A imagem exportada apresenta a carta; dados e elementos continuam disponíveis para edição e futuras experiências de jogo.

## Estágio atual

A implementação local reúne o catálogo/editor administrativo, a área do jogador e a primeira coleção persistida de cartas. Login, cadastro por e-mail/senha e Google usam Firebase Authentication. Novas contas recebem o papel `member` e entram em `/game/home`; admins entram por padrão no painel e também podem navegar em `/game`. Somente perfis com `role` e `roleId` iguais a `admin` entram no painel.

As Rules de Firestore/Storage e o build atual foram publicados com autorização do proprietário em `cardgame-6fdcb`/`deckfall`. O domínio serve a mesma versão validada localmente; localhost usa esse mesmo Firebase remoto. CORS GET para localhost e domínio e a integração Storage → Firestore foram conferidos, sem alterar cartas ou contas. Provedores Auth, domínios autorizados e índices continuam sujeitos à conferência do proprietário. A área do jogador oferece navegação, perfil e consulta da própria coleção; decks e modos de jogo continuam como placeholders. Concessão de cartas é manual por admin, sem Starter Pack ou aquisição pelo jogador. Gameplay, PvP, partidas, packs, economia, trocas e marketplace continuam para etapas futuras.

O CORS do Storage permite `GET` em `http://localhost:4200` e `https://deckfall.web.app`. A resposta real de uma imagem foi conferida nas duas origens; o teste usou a identidade OAuth da CLI e não substitui a verificação da sessão no editor. Para outras origens ou diagnóstico de imagens, siga [a configuração do Storage](docs/configuracao-cors-storage.md), preservando as entradas existentes do bucket.

## Recursos implementados

- **Área do jogador:** layout próprio responsivo em `/game`, com Início, Coleção, Decks, Jogar e Perfil; identidade da conta, logout e acesso ao painel para admins. Decks e partidas permanecem em desenvolvimento.
- **Coleção persistida:** cartas concedidas pelo admin, quantidades, busca local e filtro por raridade em `/game/colecao`; o membro consulta somente a própria coleção, sem writes. A carta inteira aparece em PNG publicado separado dos assets privados do editor.
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

Guards distinguem a sessão autenticada com perfil válido (`member` ou `admin`) do acesso administrativo. Firestore e Storage Rules protegem os dados. Metadados de cartas `published` podem ser lidos publicamente; artes/assets editáveis e templates permanecem administrativos. A coleção persiste somente quantidade e datas em `users/{uid}/collection/{cardId}`. Membros leem a própria coleção; somente admin altera propriedade. Cadastro público cria apenas o perfil de membro, sem cartas iniciais nem autopromoção.

A imagem completa fica em `published-cards/{cardId}/preview.png`, acessível por download autenticado somente enquanto a carta está publicada. Salvar com status Publicada gera/atualiza o PNG; Rascunho/Arquivada tenta remover uma representação anterior. Falhas posteriores são avisadas sem desfazer o documento salvo. Cartas publicadas antigas precisam ser reabertas/salvas para gerar essa representação. Veja [coleção, gestão e imagens publicadas](docs/colecao.md).

Um destino interno válido em `returnUrl` tem prioridade após entrar: membros podem voltar às páginas de `/game`, e admins também às rotas de `/admin`. `/login` continua sendo Minha conta com sessão ativa; o Perfil do jogador aponta para essa experiência existente.

A gestão lista **perfis em `users/{uid}`**, não todas as contas Authentication. O primeiro admin é configurado no Console; outros papéis podem ser administrados pelo painel. Cada titular vincula seus métodos e solicita a recuperação da própria senha; o painel não altera credenciais de terceiros nem exclui contas. Não há backend Admin SDK. Veja [autenticação e admin](docs/autenticacao-e-admin.md).

## Stack e organização

| Camada | Base atual |
| --- | --- |
| Frontend | Angular 18.2.14, TypeScript 5.5.4, standalone e CSS |
| Editor | Konva 10.7.1 diretamente, signals e modelo próprio |
| Firebase | AngularFire 18.0.1 e Firebase SDK 10.14.1, APIs modulares |
| Interface | Reactive Forms, RxJS e rotas carregadas sob demanda |
| Validação | Jasmine/Karma e Security Rules em emuladores |

`view/` apresenta e orquestra; `model/interfaces/` define contratos; `model/services/` concentra estado, domínio, persistência e infraestrutura. As versões Angular/Firebase foram preservadas. Consulte [a arquitetura](docs/arquitetura-frontend.md) e [o editor](docs/editor-de-cartas.md).

## Começar localmente

```powershell
npm.cmd ci
```

Copie [o exemplo de environment](docs/config/environment.example.ts) para `src/environments/environment.ts` e `src/environments/environment.development.ts`. Preencha os valores públicos do Web App Firebase e use `production: false` no desenvolvimento. Os environments reais são ignorados pelo Git; não adicione credenciais administrativas.

Habilite Email/Password e Google, confira os domínios autorizados e configure o primeiro admin conforme [o bootstrap](docs/autenticacao-e-admin.md). Depois execute:

```powershell
npm.cmd start
```

Abra `http://localhost:4200/`. Após registrar ou entrar como membro, navegue em `/game/home`. Como admin, acesse `/admin/cartas/criar` ou `/admin/cartas/lista`; o painel também oferece um atalho para a área do jogador.

Para popular uma coleção, salve uma carta como publicada, abra `/admin/usuarios/editar/:uid` de um perfil existente e defina a quantidade total na seção Coleção. Entre com esse usuário e consulte `/game/colecao`; sem concessões, a coleção permanece vazia.

O gerador inicial já foi executado. Não repita `npm run setup`: ele pode sobrescrever configurações auxiliares.

## Testar e compilar

```powershell
npm.cmd test -- --watch=false --browsers=ChromeHeadless
npm.cmd run build -- --configuration production
npm.cmd run test:rules
git diff --check
```

Os testes Angular precisam do Chrome. Os testes de Rules precisam da Firebase CLI e Java compatíveis; nesta máquina, CLI 15.9.0 e Java 21 são usados para essa validação. `test:rules` executa Firestore/Storage no projeto isolado `demo-cardgame`.

Resultados finais e detalhes do ambiente ficam no [contexto operacional](docs/contexto-operacional-para-ias.md). Verificações locais não confirmam a configuração nem a publicação do backend remoto.

Validação local: **373 testes Angular, 30 cenários de Security Rules e build de produção aprovados**, incluindo coleção, quantidades, concorrência, busca/raridade, gestão administrativa, imagem publicada, avisos de permissão/limpeza e regressões de autenticação, catálogo e editor. O fluxo de salvamento → PNG real → concessão de duas cópias → consulta pelo membro foi exercitado com clientes de persistência substituídos; as permissões foram verificadas nos emuladores. Coleção e gestão administrativa foram conferidas com dados/PNGs sintéticos em larguras de 320, 390, 768 e 1440 pixels, sem overflow horizontal da página. Após a publicação, Rules remotas, HTML e todos os 30 JavaScripts servidos coincidiram com os arquivos locais; CORS/IAM necessários foram conferidos. Sessão Firebase real/OAuth não foram exercitados nessa verificação.

## Documentação e desenvolvimento

- [Índice da memória operacional](docs/README.md)
- [Editor visual, histórico e templates](docs/editor-de-cartas.md)
- [Cartas, assets e persistência](docs/cartas.md)
- [Coleção do jogador e imagens publicadas](docs/colecao.md)
- [Modelo Firestore](docs/modelo-dados-firestore.md)
- [Arquitetura frontend](docs/arquitetura-frontend.md)
- [Autenticação e administração](docs/autenticacao-e-admin.md)
- [Usuários e cargos](docs/usuarios.md)
- [Riscos e configuração externa](docs/riscos-e-dividas-tecnicas.md)
- [Guia para agentes](AGENTS.md)

O README e os documentos de domínio acompanham cada trabalho relevante, conforme [a regra de apresentação](docs/apresentacao-readme.md).
