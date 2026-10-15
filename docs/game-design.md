# Game Design — Deckfall

Status: PROPOSTA / PENDENTE

Last reviewed: 2026-10-15

Source of truth for: propostas, aprovação explícita e regras de jogo do Deckfall

## Situação e aprovação

Esta é somente a estrutura inicial do Game Design v0.1. Não há regras definitivas aprovadas ou documento anterior de design localizado no repositório auditado. O direcionamento de fases vem do proprietário e está no [roadmap](roadmap.md); ele não aprova parâmetros de gameplay.

Estados de uma regra/versão: **PROPOSTA** (inclui pendências sem definição), **APROVADO** (somente com decisão explícita do proprietário registrada aqui) e **DEPRECATED** (substituída, com link à sucessora). Agentes podem organizar requisitos e apontar lacunas; não podem aprovar as próprias propostas. Ao registrar aprovação, inclua escopo/versão, data e referência verificável da decisão, sem depender de outro chat.

## Estrutura de v0.1

Todas as linhas abaixo estão **PROPOSTA / PENDENTE**, sem valores ou regras definidos.

| Tópico | Definição necessária para o Core Game |
| --- | --- |
| Objetivo e término | Condições de vitória, derrota, empate e encerramento |
| Estado inicial | Participantes, recursos iniciais, mão e preparação |
| Cartas e zonas | Tipos/subtipos relevantes, zonas e informação pública/oculta |
| Turnos e ações | Ordem/fases, ações legais, custos e prioridades |
| Combate | Alvos, resolução, dano e interação dos atributos |
| Efeitos | Semântica, duração, gatilhos, ordem e resolução de conflitos |
| Decks | Tamanho, cópias, elegibilidade e relação com a coleção |
| Aleatoriedade | Onde existe, como reproduzir e quais resultados são observáveis |
| Escopo de v0.1 | Cenário mínimo jogável e casos de aceitação do sandbox/treino |

Economia, monetização e progressão têm fases posteriores; não são pré-requisitos para inventar regras de v0.1. Só entram no design quando o proprietário autorizar o respectivo escopo.

## Relação com o código existente

[Card](../src/app/model/interfaces/Cards/card.ts) guarda dados genéricos, raridades cadastrais e atributos editáveis. Defaults como Ataque/Defesa/Velocidade/Magia, limite de oito atributos e quantidade de coleção até 9999 são capacidades/limites técnicos; não definem combate, vida inicial, chances de raridade ou limite de cópias em deck. [Cartas](cartas.md) é a fonte do contrato atual; [editor](editor-de-cartas.md) trata sua apresentação visual.

Gameplay Contract e Typed Effects só poderão formalizar a semântica após a aprovação correspondente. Não há Battle Engine para inferir regras atuais. Limites de trabalho dos agentes: [AGENTS.md](../AGENTS.md#limites-da-autonomia).

## Critério para submeter à aprovação

Preencher os tópicos do Core Game com decisões/propostas identificadas, explicitar o escopo mínimo e casos de aceitação, e resolver ambiguidades que afetem contratos, efeitos, decks e resolução de batalha. Depois, solicitar a aprovação explícita do proprietário. Este checklist não é aprovação nem autorização para implementar.

## Aprovações registradas

Nenhuma aprovação de regras de jogo registrada. Ao aprovar v0.1, atualize [estado](project-state.md) e [roadmap](roadmap.md) no mesmo trabalho; preserve referência de regras substituídas sem acumular changelog neste arquivo.
