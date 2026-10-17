# Memória operacional do Deckfall

Status: Active

Last reviewed: 2026-10-17

Source of truth for: mapa da documentação e localização da fonte principal de cada assunto

O [README do projeto](../README.md) apresenta o Deckfall. Agentes começam em [AGENTS.md](../AGENTS.md), seguem a leitura abaixo e abrem somente os domínios necessários à tarefa.

## Comece aqui

| Documento | Pergunta que responde |
| --- | --- |
| [Estado atual](project-state.md) | O que existe hoje, o que bloqueia e qual ação é segura? |
| [Roadmap](roadmap.md) | Qual é o único marco ativo e quais são dependências e critérios? |
| [Game Design](game-design.md) | Quais regras do jogo foram propostas ou aprovadas pelo proprietário? |
| [Lore Bible](lore/README.md) | Qual é a base narrativa e o que um agente pode expandir sem contradizer o cânone? |
| [Arquitetura frontend](arquitetura-frontend.md) | Onde ficam rotas, componentes, serviços e fronteiras de responsabilidade? |

`project-state` descreve o presente; `roadmap`, a direção; `game-design`, regras do jogo; `lore/`, narrativa e autonomia criativa; `AGENTS`, regras de trabalho; ADRs, razões arquiteturais. Histórico fica no Git. Autorizações explícitas do proprietário e seus limites devem ser preservados; nenhum documento concede autorização de deploy ou ratifica propostas por si só.

## Domínios

| Fonte principal | Conteúdo |
| --- | --- |
| [Autenticação e admin](autenticacao-e-admin.md) | Login/cadastro, vínculo Google/senha, recuperação, guards e primeiro admin |
| [Usuários](usuarios.md) | Perfis Firestore, vínculo por UID e gestão de papéis |
| [Cartas](cartas.md) | Contrato atual de dados, arte, assets e CRUD |
| [Lore Bible](lore/README.md) | Cânone, mundo, eras, regiões, facções, personagens, mistérios e workflow narrativo de cartas; sem mecânicas automáticas |
| [Starter Wave 01](content/starter-wave-01.md) | Manifesto das 12 identidades iniciais, perfis aprovados, lore, prompts e controle de criação/arte/publicação; composição futura sem alterar o StarterPack atual |
| [Gameplay Contract](gameplay-contract.md) | API pura: tipos, efeitos/alvos, validação de decks, invariantes e projeção, ainda sem executor/motor/integração |
| [Deck Builder v0.1](deck-builder.md) | Arquitetura APROVADA em 17/10/2026; contratos puros e porta backend/erros validados; marco CURRENT incompleto, sem adapter, CRUD, persistência ou UI |
| [Editor de cartas](editor-de-cartas.md) | Canvas próprio, Konva, bindings, templates, histórico e exportação |
| [Coleção do jogador](colecao.md) | Propriedade, gestão administrativa, PNG publicado e reparo de previews |
| [Player Bootstrap](player-bootstrap.md) | Entrada em `/game`, preparação e concessão única de pack lacrado |
| [Pacotes](pacotes.md) | Definições/versões, StarterPack, abertura atômica e reveal |
| [Modelo Firestore](modelo-dados-firestore.md) | Coleções/campos persistidos e limites das Rules |

## Operação e manutenção

| Fonte principal | Conteúdo |
| --- | --- |
| [Contexto operacional](contexto-operacional-para-ias.md) | Setup, Firebase, comandos, emuladores, validação e evidências remotas datadas |
| [Riscos e dívidas](riscos-e-dividas-tecnicas.md) | Limites, falhas possíveis e pendências ainda abertas |
| [CORS do Storage](configuracao-cors-storage.md) | Diagnóstico, backup, alteração revisada e reversão de CORS |
| [Apresentação do README](apresentacao-readme.md) | Manutenção da apresentação pública no mesmo trabalho |

Exemplos de configuração: [Firebase Web](config/environment.example.ts), [ambiente isolado](config/environment.emulators.example.ts) e [CORS](config/storage.cors.example.json). Não são credenciais nem comprovação de configuração remota.

## Decisões arquiteturais

O [índice de ADRs](decisions/README.md) registra apenas decisões duráveis comprovadas e suas consequências. Contratos detalhados continuam nos documentos de domínio; propostas de jogo continuam no Game Design.

## Como manter esta memória

Siga os protocolos de início/fim e os comandos **“Valide o que falta”** e **“Continue o roadmap”** em [AGENTS.md](../AGENTS.md#pedidos-de-continuidade). Atualize somente as fontes afetadas, remova pendências resolvidas e use links para evitar duplicação. Mude `Last reviewed` somente após revisar o conteúdo; nunca use a data como substituto da verificação.
