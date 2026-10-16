# Lore Bible — Deckfall

Status: Active — base editorial v0.1

Last reviewed: 2026-10-16

Source of truth for: entrada da Lore Bible e processo de criação narrativa de cartas

Vélar é um mundo de jardins, estradas e cidades reconstruídos entre as marcas da Queda. Um cavaleiro pode proteger flores e viajantes enquanto seu reino se desfaz; um vestígio pode conservar um gesto de alguém cujo nome se perdeu. Beleza, decadência, esperança e tragédia convivem sem exigir que todo mistério seja resolvido.

Esta é a base narrativa oficial de trabalho solicitada por Emanuel. **Hard Canon v0.1 está em PROPOSTA / PENDENTE de aprovação explícita.** O Soft Canon inicial foi incorporado editorialmente sob a delegação desta tarefa, sem alegação de aprovação nominal de cada nome ou história. Story Seeds não são fatos. Status e autoridade têm fonte principal em [canon.md](canon.md).

## Mapa da Bible

| Documento | Fonte principal de | Quando ler |
| --- | --- | --- |
| [Cânone e autonomia](canon.md) | Níveis, fatos estruturais propostos e decisões reservadas ao proprietário | Antes de qualquer criação ou revisão narrativa |
| [Mundo](world.md) | Tom, vida material, magia observada e direção visual | Antes de definir conceito, história ou arte |
| [Linha do tempo](timeline.md) | Eras relativas e âncoras históricas | Ao mencionar passado, fundadores ou ruínas |
| [Regiões](regions.md) | Geografia, comunidades e identidade dos cinco lugares iniciais | Ao escolher origem ou cenário |
| [Facções](factions.md) | Objetivos, relações, aparência e tensões das cinco organizações iniciais | Ao atribuir afiliação ou conflito institucional |
| [Personagens](characters.md) | Oito figuras iniciais, situação e vínculos | Antes de criar alguém semelhante ou usar uma figura existente |
| [Story Seeds](story-seeds.md) | Perguntas e possibilidades ainda não canônicas | Ao buscar ganchos ou registrar propostas |

Leia primeiro cânone e mundo, depois apenas os domínios pertinentes. Mantenha a informação na fonte principal e use links nas demais; uma carta ou um prompt não deve se tornar a única fonte de uma mudança central.

## Fronteira com o jogo

Esta Bible é um eixo paralelo de conteúdo. Não muda o marco do [roadmap de Core Game](../roadmap.md#deck-rules), não inicia Deck Builder e não modifica [Game Design](../game-design.md), [Gameplay Contract](../gameplay-contract.md) ou [Card](../cartas.md).

Região, facção, religião, profissão e posição narrativa não concedem bônus ou restrições automáticas. Um relato de magia não adiciona mecânica. O nome Deckfall identifica o jogo; seus habitantes não precisam falar em decks, cartas ou TCG para justificar o título. Não foi criada ou alterada nenhuma carta no Firebase nesta tarefa.

## Ficha narrativa de uma futura carta

Preferir os campos abaixo no briefing de criação, usando links para elementos já registrados. Esta ficha é documentação editorial, **não uma proposta de campos novos no schema**.

| Campo | O que registrar |
| --- | --- |
| Nome | Nome ou título da carta; verificar reutilização e homônimos antes de criar outro elemento. |
| Tipo narrativo | Pessoa, criatura, objeto, lugar, acontecimento ou gesto, por exemplo. Não é o `kind` de gameplay. |
| Região | Origem ou cenário; admitir deslocamento e origem desconhecida quando fizer sentido. |
| Afiliação | Organização, relação informal ou nenhuma. Não obrigar todas as cartas a pertencer a uma facção. |
| Era | Presente, período histórico ou relato situado na linha do tempo. |
| Lore curta | Uma a três frases com identidade e conflito; atribuir crenças a quem as sustenta. |
| Descrição visual | Sujeito, materiais, estado, ambiente e símbolos coerentes com o universo. |
| Gameplay separado | Referência ao perfil permitido ou pendência de conteúdo. Não deduzir custo, atributos, raridade ou efeito da história. |

Nyra já existe no catálogo documentado, mas esta tarefa não consultou ou reinterpretou sua descrição remota. Não lhe atribuir origem, facção, passado ou novo perfil a partir desta Bible sem conferir o conteúdo existente no escopo de uma tarefa apropriada.

## Workflow de novas cartas

1. **Ler Lore Bible:** conferir `canon.md`, `world.md` e os registros relacionados; identificar status e limites de autonomia.
2. **Escolher conceito:** definir a experiência narrativa e o contexto local, sem inventar mecânica para justificá-los.
3. **Verificar semelhantes:** buscar nomes, lugares, papéis e histórias existentes na Bible e, quando a tarefa permitir acesso ao catálogo, conferir cartas já criadas. Reutilizar vínculos úteis antes de duplicar elementos.
4. **Criar personagem, evento ou ação:** desenvolver motivação, situação e consequências proporcionais à escala. Registrar uma proposta se tocar decisão reservada ao proprietário.
5. **Definir lore:** preencher a ficha e distinguir fatos, relatos e perguntas. Um elemento menor pode ser criado autonomamente dentro dos [limites](canon.md#limites-da-autonomia).
6. **Definir gameplay permitido:** conferir o design aprovado e o perfil de conteúdo autorizado, separadamente da narrativa. Se o conceito pedir uma mecânica nova, manter essa parte como proposta; não implementá-la, adaptar atributos do editor ou declarar elegibilidade automaticamente.
7. **Criar a carta no editor SEM arte:** executar esta etapa somente no escopo de uma futura tarefa de criação de carta autorizada, usando os contratos e fluxos administrativos existentes. Uma ficha narrativa por si só não autoriza writes remotos ou publicação. Não adicionar campos de lore ao schema por conveniência.
8. **Criar o Art Prompt:** entregar texto que descreva somente a ilustração, conforme o modelo abaixo. Gerar ou anexar a imagem é uma etapa própria quando solicitada.
9. **Registrar a lore nova necessária:** conferir se a carta acrescenta relações, locais, eventos ou características recorrentes que precisam ser preservados; atualizar sua fonte principal antes de depender deles em conteúdo posterior.
10. **Atualizar a Bible apenas se relevante:** um detalhe isolado pode ficar na ficha da carta; um elemento reutilizável vai ao documento de domínio adequado. Revisar links, continuidade e status, sem criar dezenas de arquivos ou transformar uma seed em fato silenciosamente.

O workflow não exige aprovação individual de toda vila, criatura ou personagem menor. Sua autonomia já foi delegada; aprovação é necessária nos casos centrais definidos em `canon.md`. Não executar as etapas de editor, arte ou publicação nesta fundação documental.

## Art Prompt

Quando uma futura carta sem arte for criada, entregar também um bloco `Art Prompt` preenchido. Modelo:

```text
Art Prompt
Personagem ou objeto: [sujeito, traços reconhecíveis e estado atual].
Aparência e roupa: [rosto/corpo ou materiais; tecidos, armadura, desgaste, acessórios].
Pose: [gesto legível e relação física com o ambiente].
Cenário: [região, local, vegetação, arquitetura e objetos relevantes].
Iluminação: [fonte, direção, intensidade e contraste].
Clima e atmosfera: [tempo, estação, sensação emocional e condições do ambiente].
Composição: [sujeito principal, profundidade, foco e elementos secundários].
Cores predominantes: [paleta coerente e pontos de contraste].
Detalhes simbólicos: [marcas de história/afiliação sustentadas pela lore, sem texto].
Formato: ilustração vertical; preservar rosto, mãos e elementos essenciais na área
central, com ambiente suficiente nas margens para recorte no layout da carta.
Direção: dark fantasy com contraste entre beleza e decadência, materiais concretos
e detalhes coerentes com a região; ajustar à cena, sem escurecer tudo por padrão.
Somente arte: sem texto, letras, nome da carta, interface, bordas, moldura,
ícones de UI, números ou atributos impressos na imagem.
```

O prompt não deve incluir custos e estatísticas como elementos desenhados. O canvas do editor continua responsável por layout e apresentação. Uma flor na imagem não comprova efeito, facção ou explicação sobrenatural.

## Os 16 arquétipos de referência

Os nomes e perfis aprovados continuam no [conjunto de referência do Game Design](../game-design.md#conjunto-de-referência-para-sandboxtreino--aprovado). A tabela abaixo aponta possibilidades narrativas, **não cria cartas, novos nomes oficiais ou mapeamentos canônicos de gameplay**.

| Arquétipos de protótipo | Espaço para desenvolvimento futuro |
| --- | --- |
| Recruta, Escudeiro, Duelista, Vigia | Formação, juramentos, rivalidades e trabalho de proteção nas cidades, estradas e ordens. |
| Mercenário, Sentinela, Guardião | Contratos das Marcas, guardas locais e protetores com lealdades distintas; não precisam pertencer à mesma facção. |
| Colosso | Uma criatura ou figura imponente ligada a um conflito local; tamanho e aparência não criam poderes novos. |
| Lanceiro, Vanguarda, Bastião | Pessoas e formações de uma campanha, resistência de um refúgio ou lembrança de um cerco. |
| Faísca, Golpe Preciso, Recuperar | Um instante de magia, habilidade ou cuidado com contexto pessoal, dentro do perfil aprovado. |
| Planejar, Intuição | Preparação, experiência, uma impressão ou sonho atribuídos a alguém, sem revelar informação oculta por regra narrativa. |

Nomes verdadeiros e vínculos serão desenvolvidos em tarefas futuras. Identidades canônicas, revisões e perfis não são trocados por renomear uma história. O StarterPack e a coleção não são alterados por essa associação editorial.

[Índice dos documentos](../README.md) · [Estado atual](../project-state.md) · [Regras dos agentes](../../AGENTS.md)
