# Deckfall

Uma plataforma de cartas digitais de Emanuel Sacoman, com área do jogador, editor visual e administração em Angular/Firebase.

Cada carta combina dados estruturados de gameplay com um design editável. A imagem exportada apresenta a carta; dados e elementos continuam disponíveis para edição e futuras experiências de jogo.

## Estágio atual

A implementação local reúne o catálogo/editor administrativo, a área do jogador, coleção persistida e Player Bootstrap com Starter Collection única no backend. Login, cadastro por e-mail/senha e Google usam Firebase Authentication. Novas contas recebem o papel `member` e entram em `/game/home`; admins entram por padrão no painel e também podem navegar em `/game`. Somente perfis com `role` e `roleId` iguais a `admin` entram no painel.

Rules e Hosting da coleção/preview foram publicados em uma etapa anterior autorizada. **O novo bootstrap, Functions e alterações de Rules desta etapa permanecem locais, sem deploy.** O domínio continua na versão anteriormente publicada. O fluxo completo pode ser exercitado em emuladores; no Firebase real, exige configuração do starter e publicação autorizada do backend. CORS GET para localhost/domínio e a integração Storage → Firestore foram conferidos anteriormente. Provedores Auth, domínios autorizados e índices continuam sujeitos à conferência do proprietário. Decks, gameplay, PvP, partidas, packs, economia, trocas e marketplace continuam para etapas futuras.

O CORS do Storage permite `GET` em `http://localhost:4200` e `https://deckfall.web.app`. A resposta real de uma imagem foi conferida nas duas origens; o teste usou a identidade OAuth da CLI e não substitui a verificação da sessão no editor. Para outras origens ou diagnóstico de imagens, siga [a configuração do Storage](docs/configuracao-cors-storage.md), preservando as entradas existentes do bucket.

## Recursos implementados

- **Área do jogador:** layout próprio responsivo em `/game`, com Início, Coleção, Decks, Jogar e Perfil; identidade da conta, logout e acesso ao painel para admins. Decks e partidas permanecem em desenvolvimento.
- **Player Bootstrap:** ao entrar em `/game`, uma Callable autenticada valida a conta e concede a Starter Collection default uma única vez, mesmo entre abas. Preparação e erro com nova tentativa precedem o acesso às páginas do jogador.
- **Coleção persistida:** starter somado pelo backend ou concessões manuais pelo admin, quantidades, busca local e filtro por raridade em `/game/colecao`; o membro consulta somente a própria coleção, sem writes. A carta inteira aparece em PNG publicado separado dos assets privados do editor.
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

Guards distinguem a sessão autenticada com perfil válido (`member` ou `admin`) do acesso administrativo. Firestore e Storage Rules protegem os dados. Metadados de cartas `published` podem ser lidos publicamente; artes/assets editáveis e templates permanecem administrativos. Cadastro público cria apenas identidade/acesso em `users/{uid}`, sem autopromoção. A entrada em `/game` solicita o bootstrap: `players/{uid}` guarda estado mínimo/marcador, e `users/{uid}/collection/{cardId}` conserva somente quantidade e datas. Membros leem os próprios dados, sem writes de coleção/player.

**Angular solicita; o servidor decide.** `initializePlayer` usa o UID autenticado e valida perfil, starter, cartas publicadas, limites e datas existentes dentro de uma transação. Soma quantidades, preserva a primeira aquisição e grava o marcador no mesmo commit. Admin SDK ignora Rules, portanto o backend repete suas próprias verificações. A gestão manual administrativa continua disponível; versão nova do starter não permite concedê-lo novamente. Veja [o Player Bootstrap](docs/player-bootstrap.md).

A imagem completa fica em `published-cards/{cardId}/preview.png`, acessível por download autenticado somente enquanto a carta está publicada. Salvar com status Publicada gera/atualiza o PNG; Rascunho/Arquivada tenta remover uma representação anterior. Falhas posteriores são avisadas sem desfazer o documento salvo. Cartas publicadas antigas precisam ser reabertas/salvas para gerar essa representação. Veja [coleção, gestão e imagens publicadas](docs/colecao.md).

Um destino interno válido em `returnUrl` tem prioridade após entrar: membros podem voltar às páginas de `/game`, e admins também às rotas de `/admin`. `/login` continua sendo Minha conta com sessão ativa; o Perfil do jogador aponta para essa experiência existente.

A gestão lista **perfis em `users/{uid}`**, não todas as contas Authentication. O primeiro admin é configurado no Console; outros papéis podem ser administrados pelo painel. Cada titular vincula seus métodos e solicita a recuperação da própria senha; o painel não altera credenciais de terceiros nem exclui contas. O novo backend Admin SDK atende somente ao bootstrap do jogador. Veja [autenticação e admin](docs/autenticacao-e-admin.md).

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

Abra `http://localhost:4200/`. Após registrar ou entrar como membro, navegue em `/game/home`. Como admin, acesse `/admin/cartas/criar` ou `/admin/cartas/lista`; o painel também oferece um atalho para a área do jogador.

Antes do primeiro acesso ao novo `/game`, configure `starterCollections/default` com cartas publicadas e quantidades válidas. Sem Function disponível ou starter ativo válido, a preparação mostra erro e oferece nova tentativa. Não há configuração remota criada automaticamente. Para executar o fluxo completo isolado em localhost, use [o environment exclusivo de emuladores](docs/config/environment.emulators.example.ts) e siga [os emuladores e a configuração do starter](docs/player-bootstrap.md).

A gestão manual permanece em `/admin/usuarios/editar/:uid`: salve a carta como publicada e defina a quantidade total na seção Coleção de um perfil existente. O starter soma à quantidade já concedida, preservando a primeira data de aquisição.

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

O bootstrap possui testes de primeira concessão, repetição/concorrência, soma com inventário prévio, limites e falhas sem gravação parcial. Frontend cobre preparação, sucesso, erro/retry e troca de sessão; Rules preservam coleção read-only para member e isolam players/configuração. Resultados finais e limites da verificação desta etapa ficam no [contexto operacional](docs/contexto-operacional-para-ias.md). Validação em emuladores não equivale a Function publicada, starter configurado ou sessão Firebase real.

## Documentação e desenvolvimento

- [Índice da memória operacional](docs/README.md)
- [Editor visual, histórico e templates](docs/editor-de-cartas.md)
- [Cartas, assets e persistência](docs/cartas.md)
- [Coleção do jogador e imagens publicadas](docs/colecao.md)
- [Player Bootstrap, starter e Functions](docs/player-bootstrap.md)
- [Modelo Firestore](docs/modelo-dados-firestore.md)
- [Arquitetura frontend](docs/arquitetura-frontend.md)
- [Autenticação e administração](docs/autenticacao-e-admin.md)
- [Usuários e cargos](docs/usuarios.md)
- [Riscos e configuração externa](docs/riscos-e-dividas-tecnicas.md)
- [Guia para agentes](AGENTS.md)

O README e os documentos de domínio acompanham cada trabalho relevante, conforme [a regra de apresentação](docs/apresentacao-readme.md).
