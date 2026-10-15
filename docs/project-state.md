# Project State

Status: Active

Last reviewed: 2026-10-15

Última atualização: 2026-10-15

Source of truth for: snapshot presente do Deckfall, bloqueadores e próxima ação segura

## Produto atual

Deckfall é uma plataforma de cartas digitais com editor/administração e área autenticada do jogador. Permite publicar cartas, administrar pacotes determinísticos, receber o StarterPack lacrado, abri-lo pelo backend e consultar a coleção. Ainda não oferece uma partida jogável. Este snapshot foi confrontado com código, Rules, tipos, testes e histórico local; a produção não foi consultada novamente nesta tarefa.

## Stack

Angular 18 standalone, TypeScript, Firebase modular/AngularFire, Authentication, Firestore, Storage e Hosting; Konva com modelo visual próprio. Backend separado em `functions/`, Functions Gen 2, Admin SDK e Node.js 22. Versões e comandos têm fonte principal no [contexto operacional](contexto-operacional-para-ias.md); responsabilidades e rotas na [arquitetura](arquitetura-frontend.md).

## Sistemas implementados

- **Auth e admin:** e-mail/senha e Google, vínculo de métodos, recuperação, perfis/papéis e guards; painel de cartas, usuários e pacotes.
- **Cartas e editor:** dados estruturados separados de canvas, Konva, assets privados, templates, histórico, rascunho local e exportação; catálogo em lista/galeria.
- **Publicação e previews:** PNG achatado autenticado para coleção/reveal/resumo; sincronização após save e reparo administrativo global/individual com avisos por carta.
- **Área do jogador e coleção:** navegação/perfil, leitura da própria propriedade, busca/filtro e gestão manual de quantidades pelo admin.
- **Player Bootstrap e packs:** starter único lacrado, definições determinísticas e versões imutáveis, abertura atômica/idempotente, reveal e recuperação do resultado após refresh.
- **Gameplay Contract:** módulo TypeScript puro em `shared/gameplay`, com constantes aprovadas, perfis/estados/intenções tipados, validação de formato e invariantes de snapshots, projeções privadas por participante e testes próprios. Ainda não é importado pela aplicação ou por Functions.
- **Typed Effects:** catálogo fechado de dano, cura e compra, com parâmetros aprovados e validação de alvos por participante/campo. Tipos, parsers de perfil e projeções usam a mesma união; o módulo não executa efeitos nem altera estado.
- **Deck Rules:** validador puro de 24 cartas e até duas cópias por identidade, com revisão/elegibilidade do catálogo versionado e quantidades pessoais ou referência exata de treino em contexto confiável. Retorna composição canônica independente, sem autenticar, consultar coleção ou criar instâncias. API em [Gameplay Contract](gameplay-contract.md#deck-rules-e-contexto-confiável).

“Implementado” descreve código e cobertura existentes, sem encerrar o QA remoto pendente. Contratos e referências de implementação ficam nos [docs de domínio](README.md#domínios).

## Sistemas parciais

- `/game/decks` e `/game/jogar` são placeholders com ações desabilitadas.
- O [Game Design v0.1](game-design.md#aprovações-registradas) foi aprovado explicitamente por Emanuel. O [Gameplay Contract, Typed Effects e Deck Rules](gameplay-contract.md) estão implementados e validados; ainda não há resolução de batalha ou integração de decks com propriedade/autorização no backend.
- O modelo persistido `Card` continua genérico e separado dos perfis de gameplay. Não houve conversão de cartas existentes, adaptação de Nyra ou criação do pool didático no catálogo.
- Definições adicionais de packs existem no admin; não há distribuição genérica de instâncias ao jogador.

## Não implementado

Deck Builder, persistência/autorização integrada de decks, catálogo/referência reais de gameplay, Battle Engine, sandbox, bot de treino, persistência de partidas, matchmaking/PvP/reconexão, moedas/recompensas/loja/packs compráveis ou aleatórios, XP/níveis/conquistas/ranked/MMR/leaderboard/seasons. A ordem pretendida e seus bloqueios estão no [roadmap](roadmap.md).

## Backend atual

Há duas Callables em [functions/src/index.ts](../functions/src/index.ts): `initializePlayer` e `openPack`, ambas na região `southamerica-east1`, autenticadas e com validação própria no servidor. O bootstrap concede instância lacrada; a abertura usa sua versão histórica e concede cartas no mesmo commit do resultado. Não há backend de batalha ou economia.

Coleções principais: `users`, `players`, `cards`, `cardTemplates`, `packDefinitions`/`versions`, e subcoleções `users/{uid}/collection` e `users/{uid}/packs`. Membros não escrevem propriedade/player/packs; clientes admin também não escrevem player/instâncias. A gestão manual administrativa de coleção é o fluxo privilegiado existente. Fonte dos campos e permissões: [modelo Firestore](modelo-dados-firestore.md); razões: [ADRs](decisions/README.md).

## Rotas importantes

`/login` também atende Minha conta. `/game/*` exige perfil autenticado válido e bootstrap antes de montar páginas; inclui `/game/home`, `/game/colecao`, `/game/pacotes` e `/game/pacotes/abrir/:id`. `/admin/*` exige admin e reúne dashboard, cartas, pacotes e usuários. Tabela completa e guards: [arquitetura frontend](arquitetura-frontend.md#rotas-e-layout).

## Estado de produção

Configuração versionada: Hosting site `deckfall`, saída `dist/card-game/browser` e rewrite SPA em [firebase.json](../firebase.json). O projeto remoto documentado é `cardgame-6fdcb`, domínio `https://deckfall.web.app`; o frontend local usa Firebase real por padrão, salvo configuração explícita de emuladores.

As últimas evidências registradas confirmam publicação de Functions/Firestore Rules/Hosting de pacotes, StarterPack ativo versão 1 com uma Nyra publicada, PNG existente, Rules remotas iguais às locais, CORS das duas origens e domínio Auth autorizado. **São evidências datadas de 13–15/10/2026, sem nova auditoria remota nesta tarefa.** A correção local do MIME das previews e o reparo administrativo não têm publicação posterior confirmada; o teste real com member também permanece aberto. Recibos, datas e limites: [contexto operacional](contexto-operacional-para-ias.md). Nenhuma autorização de publicação é herdada desses registros.

## Problemas conhecidos

Fonte principal: [riscos e dívidas](riscos-e-dividas-tecnicas.md). Permanecem QA autenticado member de coleção/reveal/resumo e publicação autorizada da correção local; falta de atomicidade entre documento e preview/cleanup; leituras sem paginação; limites de validação profunda do canvas; ausência de controles adicionais de abuso no backend. Falta antiga de `openPack`/StarterPack e CORS das origens registradas não são bugs atuais comprovados.

## Marco atual e continuidade

Deck Rules está concluído e permanece como único marco CURRENT no [roadmap](roadmap.md#deck-rules), conforme o pedido de limitar esta tarefa a esse marco. Deck Builder continua planejado, sem promoção ou execução. Evidências locais estão no [contexto operacional](contexto-operacional-para-ias.md#validação-disponível).

## Owner decisions required

Nenhuma decisão de produto pendente para Deck Rules v0.1 concluído. Mudanças de regras/números, persistência/autorização, economia e multiplayer futuros conservam seus próprios requisitos e limites de aprovação.

## Next safe action

Não há incremento pendente nos critérios atuais de Deck Rules. Encerrar o marco nesta tarefa e aguardar nova solicitação para rever a continuidade, sem iniciar Deck Builder, persistência ou batalha. A manutenção operacional pendente está em [riscos](riscos-e-dividas-tecnicas.md) e não autoriza deploy.
