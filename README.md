# Deckfall

Uma plataforma de cartas digitais de Emanuel Sacoman, com área do jogador, editor visual e administração em Angular/Firebase.

Status: em desenvolvimento

Last reviewed: 2026-10-17

Source of truth for: apresentação pública do projeto

Cada carta combina dados estruturados de gameplay com um design editável. A imagem exportada apresenta a carta; dados e elementos continuam disponíveis para edição e futuras experiências de jogo.

## Estágio atual

A fundação da plataforma está implementada: autenticação, catálogo/editor administrativo, publicação de cartas, área do jogador, coleção persistida e pacotes determinísticos versionados. O backend concede um **StarterPack** lacrado uma única vez; a abertura autenticada e atômica concede as cartas antes do reveal. Definições adicionais existem no admin, ainda sem distribuição ao jogador.

O **Game Design v0.1 foi aprovado explicitamente**, e o **Gameplay Contract, Typed Effects e Deck Rules** estão implementados em TypeScript puro. Há perfis, estados, intenções, invariantes, projeções privadas, validação de efeitos/alvos e de decks contra conteúdo e quantidades confiáveis ou referência exata de treino. O módulo ainda não executa batalha nem está integrado em runtime à aplicação ou a Functions. **Deck Builder é o marco CURRENT e permanece incompleto**: sua arquitetura foi aprovada, com [compatibilidade pura](docs/gameplay-contract.md#compatibilidade-pessoal-com-catálogo-ativo), [rascunhos pessoais](docs/gameplay-contract.md#intenção-parcial-de-deck-pessoal) e [contratos de recurso/mutações](docs/gameplay-contract.md#recurso-pessoal-e-pedidos-de-mutação) implementados e validados. Rascunhos aceitam composição parcial de 0–24 cartas; os pedidos separam escolhas do jogador de metadados e versões do recurso. Uma [porta backend do store](docs/deck-builder.md#porta-backend-do-store-e-erros-de-domínio) reutiliza apenas os tipos compartilhados e define transação futura e erros de domínio, sem adapter ou operações CRUD. Esses contratos não comprovam propriedade, concorrência real ou aptidão para jogar. UI e persistência continuam sem implementação. Decks e Jogar permanecem placeholders; partidas/PvP, economia e progressão são fases futuras. Consulte [o estado atual](docs/project-state.md), [o roadmap](docs/roadmap.md), [as regras aprovadas](docs/game-design.md) e [o contrato](docs/gameplay-contract.md).

A [Lore Bible v0.1](docs/lore/README.md) inaugura o eixo narrativo de dark fantasy: Vélar reúne reinos, florestas, ruínas e histórias pessoais séculos depois da misteriosa Queda. Há cinco regiões, cinco facções e oito personagens iniciais, com contraste entre beleza e decadência. O Hard Canon está proposto e pendente de aprovação; o Soft Canon inicial é a base editorial expansível. Lore e gameplay permanecem separados.

A [Starter Wave 01](docs/content/starter-wave-01.md) reúne 12 identidades editoriais com os perfis do deck padrão aprovado, lore e prompts de ilustração. A criação das cartas no editor está pendente por indisponibilidade da ferramenta de UI: 0/12 criadas nesta execução, todas preparadas para `draft` e sem arte. A futura composição de 24 cartas não foi aplicada ao StarterPack existente.

O ambiente remoto documentado usa `https://deckfall.web.app`, projeto `cardgame-6fdcb`, com infraestrutura de pacotes publicada e StarterPack configurado com uma Nyra. As [evidências de 13–15/10/2026](docs/contexto-operacional-para-ias.md#evidências-externas-registradas) têm escopo e data; não equivalem a uma nova auditoria de produção. A correção local do MIME das previews e o reparo administrativo estão implementados, mas a publicação posterior e o QA completo com member não têm confirmação. Veja [as pendências reais](docs/riscos-e-dividas-tecnicas.md).

Localhost usa o Firebase configurado no environment, real por padrão. Para desenvolver isolado, configure [os emuladores](docs/pacotes.md#localhost-isolado). Para outras origens ou diagnóstico de imagens, siga [o guia CORS do Storage](docs/configuracao-cors-storage.md).

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
- **Edição mais direta:** cores com paleta do documento, sliders com entrada precisa, movimento por setas, renomeação de camadas, enquadramento de imagens e zoom rápido; [controles e atalhos](docs/editor-de-cartas.md#controles-de-cor-e-precisão) preservam o modelo da carta.
- **Histórico e exportação:** desfazer/refazer, atalhos e PNG/JPEG em 1×, 2× ou 4×, respeitando dimensões reais e orçamento de pixels.
- **Cartas e templates:** salvar/reabrir o modelo próprio no Firestore, uploads organizados no Storage, composição ornamental inicial e Fantasy Basic editáveis, salvar/carregar templates e preparar cópias de cartas.
- **Catálogo em dois modos:** lista administrativa ou galeria de cartas inteiras, com a composição salva, proporção original e acesso à edição ao clicar.
- **Reparo de previews publicadas:** sincronização administrativa de todas as cartas publicadas ou regeneração individual, uma carta por vez, com resultado por carta e sem alterar dados do jogo.
- **Rascunho local:** salvamento manual de documento e imagens em IndexedDB; importação/exportação de JSON para o modelo estruturado.
- **Edição com imagens indisponíveis:** a carta abre sem esperar downloads; falhas têm nova tentativa manual e referências dos arquivos próprios podem ser conservadas ao salvar dados/design.
- **Usuários e coleção:** consultar, vincular por UID e editar perfis Firestore/papéis; na edição de um perfil existente, conceder cartas publicadas, definir quantidade total e remover propriedade com confirmação. Alterar contato não muda credenciais.
- **Minha conta:** vincular Google e e-mail/senha ao mesmo usuário, consultar métodos ativos e recuperar senha por e-mail.
- **Contrato de gameplay:** módulo puro compartilhável, sem dependência de Angular/Firebase; tipos, formatos, invariantes de snapshots e visibilidade por participante testados, sem executar batalha.
- **Efeitos tipados:** dano, cura e compra com parâmetros fechados, rejeição de texto livre e validação de alvos conforme lado/estado vivo. Guarda não bloqueia Ações; o módulo não aplica os efeitos nem consome recursos.
- **Memória operacional:** estado presente, roadmap com um único marco ativo, Game Design aprovado, decisões arquiteturais e protocolos de continuidade em [docs/](docs/README.md).

O acesso Google tenta popup e continua por redirecionamento quando o navegador o bloqueia. Em **Minha conta**, quem entrou por e-mail/senha pode vincular Google; quem entrou com Google pode adicionar uma senha após confirmar sua identidade. Os dois métodos preservam UID e perfil. **Esqueci minha senha** envia o link de recuperação pelo Firebase. Veja [o fluxo de autenticação](docs/autenticacao-e-admin.md).

O editor usa um modelo versionado próprio. Konva representa esse estado; `stage.toJSON()` não é o banco de dados. Design e gameplay permanecem separados, sem impor um único layout de carta.

Molduras e emblemas vetoriais combinam cores e formas sem depender de emojis. Para acabamentos ilustrados ou texturas detalhadas, combine arte e PNGs transparentes próprios em camadas. O editor não inclui geração de imagens por IA; as variações procedurais usam os estilos e símbolos disponíveis. Veja [o ateliê e seus limites](docs/editor-de-cartas.md#ateliê-de-molduras-e-emblemas).

### Permissões e contas

Guards distinguem a sessão autenticada com perfil válido (`member` ou `admin`) do acesso administrativo. Firestore e Storage Rules protegem os dados. Metadados de cartas `published` podem ser lidos publicamente; artes/assets editáveis e templates permanecem administrativos. Cadastro público cria apenas identidade/acesso em `users/{uid}`, sem autopromoção. `players/{uid}` guarda estado mínimo/marcador; `users/{uid}/packs/{id}` guarda instâncias, e `users/{uid}/collection/{cardId}` conserva somente quantidade e datas. Membros leem seus próprios dados e não escrevem coleção/player/packs; clientes admin também não escrevem player ou instância.

**Angular solicita; o servidor decide.** `initializePlayer` cria instância lacrada e marcador num commit único. `openPack` usa sua `definitionVersion`, valida cartas ainda publicadas e soma as quantidades no mesmo commit de estado/resultado da abertura, preservando a primeira aquisição. Repetições e concorrência não duplicam starter ou conteúdo. Admin SDK ignora Rules, portanto o backend repete suas próprias verificações. Definições ficam em `packDefinitions/{packId}`, com o nome **StarterPack** reservado a `starter`; a administração cria/avança versões atomicamente sem reescrever histórico ou conceder propriedade. O fluxo direto anterior foi removido, sem migração de produção ou reconcessão. A gestão manual administrativa continua disponível. Veja [bootstrap](docs/player-bootstrap.md) e [pacotes](docs/pacotes.md).

A imagem completa fica em `published-cards/{cardId}/preview.png`, acessível por download autenticado somente enquanto a carta está publicada. Salvar com status Publicada gera/atualiza o PNG; Rascunho/Arquivada tenta remover uma representação anterior. Falhas posteriores são avisadas sem desfazer o documento salvo, inclusive depois da criação. Para cartas antigas ou previews ausentes/desatualizadas, use **Sincronizar previews publicadas** ou **Regenerar preview** em `/admin/cartas/lista`. A imagem local do admin usa assets privados e não comprova o download da imagem publicada pelo jogador. Veja [coleção, gestão e imagens publicadas](docs/colecao.md).

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
npm.cmd run test:gameplay
npm.cmd run test:rules
npm.cmd run build:functions
npm.cmd run test:functions
npm.cmd run test:functions:emulator
git diff --check
```

Os testes Angular precisam do Chrome. Backend usa Node.js 22; emuladores precisam da Firebase CLI e Java compatíveis. Nesta máquina, CLI 15.9.0 e Java 21 são usados para essa validação. `test:rules` executa Firestore/Storage em `demo-cardgame`; `test:functions:emulator` integra Auth/Firestore/Callable no mesmo projeto isolado.

`test:gameplay` compila o contrato isolado, confere os testes de tipos e executa Node Test Runner, incluindo composição, cópias, revisão/elegibilidade, quantidades pessoais e referência de treino. O build Angular não inclui esse módulo ainda. Não há nova dependência ou migração de cartas. Backend testa uma instância lacrada sem coleção no bootstrap, abertura única/atômica, versão histórica, soma com inventário prévio, limites e falhas sem gravação parcial. Frontend cobre administração/versionamento, preparação, sessão, pacotes, reveal/revisão, lifecycle de URLs, erros de preview, retry e reparo administrativo. O teste de regressão do download usa o Firebase SDK instalado e Blob nativo do navegador. Rules preservam coleção read-only para member e isolam players/packs/configuração. Comandos e resultados, identificados por escopo/data, ficam no [contexto operacional](docs/contexto-operacional-para-ias.md). Testes isolados e leituras OAuth não substituem a validação autenticada real; [pacotes](docs/pacotes.md#publicação-posterior) registra o procedimento de publicação da correção, sujeito a autorização.

## Documentação e desenvolvimento

- [Índice da memória operacional](docs/README.md)
- [Estado atual e próxima ação segura](docs/project-state.md)
- [Roadmap e dependências](docs/roadmap.md)
- [Game Design v0.1 aprovado](docs/game-design.md)
- [Lore Bible: universo, cânone e criação de conteúdo](docs/lore/README.md)
- [Gameplay Contract](docs/gameplay-contract.md)
- [Decisões arquiteturais](docs/decisions/README.md)
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

Agentes começam pelo [AGENTS.md](AGENTS.md), conferem estado/roadmap e leem os domínios relevantes. Os protocolos **“Valide o que falta”** e **“Continue o roadmap”** permitem retomar o trabalho sem depender de outro chat, mantendo decisões de produto com o proprietário. O README e os documentos de domínio acompanham cada trabalho relevante, conforme [a regra de apresentação](docs/apresentacao-readme.md).
