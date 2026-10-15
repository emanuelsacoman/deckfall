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

“Implementado” descreve código e cobertura existentes, sem encerrar o QA remoto pendente. Contratos e referências de implementação ficam nos [docs de domínio](README.md#domínios).

## Sistemas parciais

- `/game/decks` e `/game/jogar` são placeholders com ações desabilitadas.
- O [Game Design v0.1](game-design.md#aprovações-registradas) foi aprovado explicitamente por Emanuel. O [Gameplay Contract](gameplay-contract.md) foi implementado e validado; Typed Effects ainda não tem catálogo/validação semântica próprios, e não há resolução de batalha.
- O modelo persistido `Card` continua genérico e separado dos perfis de gameplay. Não houve conversão de cartas existentes, adaptação de Nyra ou criação do pool didático no catálogo.
- Definições adicionais de packs existem no admin; não há distribuição genérica de instâncias ao jogador.

## Não implementado

Regras funcionais de decks/deck builder, Battle Engine, sandbox, bot de treino, persistência de partidas, matchmaking/PvP/reconexão, moedas/recompensas/loja/packs compráveis ou aleatórios, XP/níveis/conquistas/ranked/MMR/leaderboard/seasons. A ordem pretendida e seus bloqueios estão no [roadmap](roadmap.md).

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

## Próximo marco recomendado

Implementar o próximo incremento de Typed Effects, o único marco ativo no [roadmap](roadmap.md#typed-effects), a partir do Game Design v0.1 aprovado e do contrato já validado.

## Owner decisions required

Nenhuma decisão bloqueante no momento para o próximo incremento de Typed Effects conforme v0.1 aprovado. Mudanças de regras/números, economia e multiplayer futuros conservam seus próprios limites de aprovação.

## Next safe action

Em uma próxima solicitação de continuidade, implementar o catálogo tipado e a validação semântica dos efeitos dano, cura e compra conforme as regras aprovadas, com testes isolados. Não integrar turnos/batalha ou persistência nesse incremento; o descritor estrutural existente não conclui Typed Effects. A manutenção operacional pendente está em [riscos](riscos-e-dividas-tecnicas.md) e não autoriza deploy.
