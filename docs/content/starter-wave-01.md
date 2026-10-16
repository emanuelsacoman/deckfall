# Starter Wave 01

Status: conteúdo editorial DRAFT / aguardando arte — criação no editor PENDENTE

Last reviewed: 2026-10-16

Source of truth for: nomes, lore, perfis aprovados, prompts e controle editorial desta onda

## Controle da onda

**0 de 12 cartas criadas nesta execução.** O acesso ao navegador e a inicialização de Computer Use falharam antes de abrir o editor: `failed to write kernel assets`, caminho não encontrado (`os error 3`). Foi aplicada a alternativa solicitada pelo proprietário: conteúdo integral neste manifesto, sem script ou escrita direta em Firestore. Isso não demonstra defeito no editor ou falta de autorização da conta; a UI não pôde ser inspecionada.

`Criada = NÃO` significa preparada somente neste manifesto, sem Card ID confirmado. Não houve consulta de homônimos remotos; antes de uma futura criação, conferir a lista administrativa para evitar duplicatas. DRAFT é o status editorial e o status que deverá ser selecionado no editor, não uma alegação de documento remoto existente.

| # | Carta | Arquétipo | Tipo | Raridade | Criada | Arte | Publicada | StarterPack |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 01 | Lia do Candeia | Recruta | Unidade | Common | NÃO | PENDENTE | NÃO | NÃO |
| 02 | Nilo, Escudeiro do Refúgio | Escudeiro | Unidade | Common | NÃO | PENDENTE | NÃO | NÃO |
| 03 | Mira da Ponte Estreita | Duelista | Unidade | Rare | NÃO | PENDENTE | NÃO | NÃO |
| 04 | Ruan da Clareira | Vigia | Unidade | Common | NÃO | PENDENTE | NÃO | NÃO |
| 05 | Sava Rul, Pendão Remendado | Mercenário | Unidade | Rare | NÃO | PENDENTE | NÃO | NÃO |
| 06 | Brena, Sentinela do Estuário | Sentinela | Unidade | Rare | NÃO | PENDENTE | NÃO | NÃO |
| 07 | Dorso de Ardósia | Colosso | Unidade | Epic | NÃO | PENDENTE | NÃO | NÃO |
| 08 | Elian Varo, Juramento em Flor | Guardião | Unidade | Legendary | NÃO | PENDENTE | NÃO | NÃO |
| 09 | Brasa sob a Chuva | Faísca | Ação | Common | NÃO | PENDENTE | NÃO | NÃO |
| 10 | Abertura na Ponte | Golpe Preciso | Ação | Rare | NÃO | PENDENTE | NÃO | NÃO |
| 11 | Mãos de Namar | Recuperar | Ação | Common | NÃO | PENDENTE | NÃO | NÃO |
| 12 | O Mapa das Duas Margens | Planejar | Ação | Epic | NÃO | PENDENTE | NÃO | NÃO |

Distribuição: **8 Unidades + 4 Ações; 5 Common, 4 Rare, 2 Epic, 1 Legendary**. Raridade é editorial: singularidade, importância narrativa e elaboração visual. Não modifica força, custo, probabilidade de obtenção ou quantidade futura de cópias.

## Gameplay e entrada futura no editor

As doze correspondências reproduzem o [deck de referência aprovado](../game-design.md#conjunto-de-referência-para-sandboxtreino--aprovado). Os perfis abaixo são a especificação de conteúdo aprovada, **ainda sem integração ao catálogo editorial**; não são novas mecânicas, definições executáveis cadastradas ou prova de elegibilidade. Alvos e efeitos conservam o [Gameplay Contract](../gameplay-contract.md#efeitos-tipados-e-alvos): dano a líder/unidade adversários vivos, cura a líder/unidade próprios vivos, compra ao próprio jogador sem alvo manual. Dano de Ação ignora Guarda; cura não revive e respeita a Vida máxima na futura resolução.

O [editor existente](../cartas.md#contrato-atual-e-compatibilidade) oferece nome, descrição, raridade, status, tipo/subtipo livres e atributos removíveis. O formulário atual permite remover todos os atributos; não é necessário conservar quatro defaults. Ao executar futuramente a criação autorizada:

- Nome = nome final; descrição = somente a lore curta; raridade = enum correspondente `common`, `rare`, `epic` ou `legendary`; status = `draft`.
- Tipo editorial = `Unidade` ou `Ação`; subtipo vazio; `setId` permanece nulo. Região, afiliação e vínculo desta onda ficam neste manifesto, sem campos novos ou codificações ocultas.
- Unidades: usar apenas as chaves legadas suportadas `attack` e `defense`, rotuladas Poder e Vida, com os valores exatos do perfil. Remover `speed` e `magic`; não lhes atribuir valores novos ou função. Esses valores visíveis não tornam a carta um perfil de batalha integrado.
- Ações: remover os atributos, sem inventar Poder/Vida. Ajustar a apresentação com os controles existentes para não exibir elementos numéricos sem atributo correspondente.
- Custo, Guarda e Typed Effects ficam exclusivamente no perfil deste manifesto até a integração apropriada. Não escondê-los em descrição, subtipo, `setId` ou atributos improvisados.
- Não selecionar imagem, asset temporário ou placeholder externo. Arte intencionalmente ausente; não publicar nem gerar preview definitiva de jogador. Registrar o Card ID somente após confirmar a criação e releitura no fluxo real.

Toda a onda ocorre no Presente e respeita a [base editorial de Vélar](../lore/README.md) e o [status pendente do Hard Canon](../lore/canon.md#hard-canon--proposta--pendente). Lia, Nilo, Mira, Ruan e Brena são figuras locais específicas destas cartas; não passam a protagonistas centrais. Dorso de Ardósia recebe apenas um registro reutilizável de fauna em [world.md](../lore/world.md#natureza-criaturas-e-perigos). Nenhuma carta resolve a Queda, a natureza do Vínculo ou uma Story Seed central.

## 01 — Lia do Candeia

**Status editorial:** DRAFT / aguardando arte. **Criação no editor:** NÃO. **Card ID:** PENDENTE — não criada.

**Arquétipo:** Recruta. **Tipo:** Unidade. **Gameplay aprovado:** custo 1; Poder 2; Vida 1; sem Guarda.

**Raridade:** Common (`common`), por representar uma iniciante de uma comunidade ribeirinha. **Região:** Reino de Auren, margem do Candeia. **Afiliação:** Liga das Pontes. **Personagem relacionado:** Lia, ajudante local em sua primeira escolta.

**Lore:** Lia conhecia o peso de cada saco antes de aprender a segurar uma lança. Quando a barca de mantimentos precisou de escolta, trocou uma manhã no cais pela estrada. Ainda conta os companheiros como contava os volumes: ninguém deve ficar para trás.

**Descrição visual:** jovem adulta de pele morena e cabelos presos sob lenço ocre, usando colete de couro sobre linho gasto. Uma lança simples e a corda enrolada no quadril mostram a transição de barqueira a escolta. Caminha ao lado de um barco baixo, com a estrada e campos de Auren ao fundo; manhã dourada, água barrenta e um pequeno canteiro verde junto a um muro quebrado.

**Encaixe narrativo:** iniciativa e pouca experiência de proteção sustentam o papel de Recruta; não são causa ou justificativa para alterar seus números.

**Art Prompt:**

```text
ART PROMPT — Lia do Candeia
Crie somente a arte de uma carta de fantasia do universo Deckfall. Vélar é um mundo medieval-renascentista reconstruído séculos depois de um cataclismo cuja causa permanece desconhecida; há trabalho cotidiano e esperança entre ruínas.
Sujeito: Lia, jovem adulta ribeirinha em sua primeira escolta de mantimentos.
Aparência: pele morena, cabelos escuros presos sob lenço ocre, mãos habituadas a cordas.
Roupa/armadura: linho gasto, colete de couro remendado, botas enlameadas, sem armadura de gala.
Pose/ação: caminha pela margem com uma lança simples; outra mão segura uma corda enrolada.
Expressão: atenção e coragem ainda insegura, sem pose de heroína invencível.
Cenário: barca baixa carregada de sacos, cais de madeira reparado, campos e muro rachado com vegetação.
Região de Vélar: Reino de Auren, rio Candeia.
Momento/clima: manhã de primavera após chuva.
Iluminação: sol baixo dourado refletido na água barrenta.
Composição: figura em três quartos, lança diagonal contida no enquadramento, barco em plano secundário.
Paleta: ocre, linho cru, verde de campo, madeira e dourado suave.
Elementos simbólicos: cordas bem cuidadas e mantimentos comuns, sem brasões escritos.
Atmosfera: primeiro compromisso, sustento e fragilidade.
Estilo: dark fantasy painterly / cinematic fantasy illustration, beleza convivendo com decadência, detalhes materiais realistas, sem aparência fotográfica moderna.
Formato: vertical, apropriado para arte principal de carta.
Preservar: rosto, mãos e lança próximos da área central, com ambiente nas margens para crop.
NÃO incluir: texto, letras, nome, números, atributos, interface, borda, moldura, ícones, marca d'água ou layout de carta. Somente a ilustração.
```

**Arte:** PENDENTE. **Publicação:** PENDENTE — não publicada. **StarterPack:** PENDENTE — não incluída.

## 02 — Nilo, Escudeiro do Refúgio

**Status editorial:** DRAFT / aguardando arte. **Criação no editor:** NÃO. **Card ID:** PENDENTE — não criada.

**Arquétipo:** Escudeiro. **Tipo:** Unidade. **Gameplay aprovado:** custo 1; Poder 1; Vida 2; Guarda.

**Raridade:** Common (`common`), um auxiliar de proteção sem posição excepcional. **Região:** Reino de Auren. **Afiliação:** Ordem do Último Jardim. **Personagem relacionado:** Nilo, antigo carroceiro que auxilia um refúgio.

**Lore:** Nilo entrou a serviço do refúgio quando suas mãos já conheciam décadas de trabalho. Não sonha com torneios: quer que a porta permaneça aberta até o último viajante passar. Seu escudo foi feito com a madeira da carroça que o trouxe.

**Descrição visual:** homem na casa dos cinquenta anos, barba curta grisalha, postura robusta e rosto marcado pelo sol. Usa linho claro, acolchoado verde desbotado e pequenas peças de ferro reaproveitado. Segura um escudo de tábuas com reforços simples no portão de um refúgio; hortaliças, uma roda encostada e a luz de pão sendo assado dão calor ao fim de tarde.

**Encaixe narrativo:** um auxiliar que se coloca entre o perigo e a passagem é uma imagem temática de Guarda, sem conferir habilidade adicional.

**Art Prompt:**

```text
ART PROMPT — Nilo, Escudeiro do Refúgio
Crie somente a arte de uma carta de fantasia do universo Deckfall. Em Vélar, comunidades medievais-renascentistas mantêm refúgios entre as ruínas deixadas por uma antiga Queda ainda inexplicada.
Sujeito: Nilo, antigo carroceiro de cerca de cinquenta anos, agora escudeiro de um abrigo.
Aparência: pele curtida, barba curta grisalha, mãos largas e postura robusta.
Roupa/armadura: linho claro, acolchoado verde desbotado, peças pequenas de ferro reaproveitado.
Pose/ação: firma um escudo de tábuas junto à entrada e abre espaço para viajantes ao fundo.
Expressão: serenidade cansada e atenção prática.
Cenário: portão de pedra remendado, roda de carroça encostada, pequena horta e forno aceso no pátio.
Região de Vélar: Reino de Auren, refúgio da Ordem do Último Jardim.
Momento/clima: fim de tarde seco e fresco.
Iluminação: luz âmbar do forno contra o azul suave das sombras.
Composição: escudo e figura em primeiro plano, abertura do portão visível em profundidade.
Paleta: madeira, verde gasto, ferro escuro, linho e âmbar.
Elementos simbólicos: marcas do antigo uso da madeira e um ramo simples junto ao portão, sem inscrições.
Atmosfera: hospitalidade conquistada com trabalho e proteção modesta.
Estilo: dark fantasy painterly / cinematic fantasy illustration, beleza convivendo com decadência, detalhes materiais realistas, sem aparência fotográfica moderna.
Formato: vertical, apropriado para arte principal de carta.
Preservar: rosto, mãos e escudo próximos da área central, com ambiente nas margens para crop.
NÃO incluir: texto, letras, nome, números, atributos, interface, borda, moldura, ícones, marca d'água ou layout de carta. Somente a ilustração.
```

**Arte:** PENDENTE. **Publicação:** PENDENTE — não publicada. **StarterPack:** PENDENTE — não incluída.

## 03 — Mira da Ponte Estreita

**Status editorial:** DRAFT / aguardando arte. **Criação no editor:** NÃO. **Card ID:** PENDENTE — não criada.

**Arquétipo:** Duelista. **Tipo:** Unidade. **Gameplay aprovado:** custo 2; Poder 3; Vida 2; sem Guarda.

**Raridade:** Rare (`rare`), pela identidade de uma profissional local reconhecível. **Região:** Lísria. **Afiliação:** sem afiliação. **Personagem relacionado:** Mira, espadachim contratada para acompanhar travessias disputadas.

**Lore:** Mira aprendeu a lutar onde dois passos para o lado terminam no canal. Cobra para acompanhar pessoas, não para decidir quem é dono da ponte. Ainda assim, cada contratante tenta fazê-la escolher uma margem.

**Descrição visual:** mulher adulta de pele castanha, cabelo preto curto e uma cicatriz discreta na sobrancelha. Veste casaco vinho gasto, camisa clara e uma única proteção de couro no braço; espada estreita sem adorno precioso. A ponte estreita entre casas inclinadas permite uma silhueta diagonal elegante, com água verde abaixo e luz branca de céu nublado.

**Encaixe narrativo:** especialização ofensiva e mobilidade em espaço estreito combinam com Duelista; nenhuma esquiva ou vantagem de terreno é criada.

**Art Prompt:**

```text
ART PROMPT — Mira da Ponte Estreita
Crie somente a arte de uma carta de fantasia do universo Deckfall. Vélar conserva cidades medievais-renascentistas vivas entre obras antigas em decadência, séculos depois de uma Queda misteriosa.
Sujeito: Mira, espadachim independente que acompanha travessias em Lísria.
Aparência: mulher adulta, pele castanha, cabelo preto curto, pequena cicatriz na sobrancelha.
Roupa/armadura: casaco vinho gasto, camisa clara, couro em um antebraço, espada estreita de uso real.
Pose/ação: corpo em três quartos numa base de esgrima contida, uma mão equilibrando o movimento.
Expressão: concentração e desconfiança discreta.
Cenário: ponte estreita de pedra reparada, canal verde e casas inclinadas com cobre envelhecido nas janelas.
Região de Vélar: Lísria, cidade de estuário.
Momento/clima: meio da manhã, céu encoberto e brisa úmida.
Iluminação: claridade branca difusa com reflexos verdes sob a ponte.
Composição: silhueta diagonal legível, perspectiva do corrimão conduzindo ao fundo, sem multidão dominante.
Paleta: vinho, cobre oxidado, verde de água e pedra clara.
Elementos simbólicos: duas margens visíveis e reparos de épocas diferentes, sem emblema de facção.
Atmosfera: habilidade cotidiana entre liberdade e necessidade de trabalho.
Estilo: dark fantasy painterly / cinematic fantasy illustration, beleza convivendo com decadência, detalhes materiais realistas, sem aparência fotográfica moderna.
Formato: vertical, apropriado para arte principal de carta.
Preservar: rosto, mãos e espada próximos da área central, com ambiente nas margens para crop.
NÃO incluir: texto, letras, nome, números, atributos, interface, borda, moldura, ícones, marca d'água ou layout de carta. Somente a ilustração.
```

**Arte:** PENDENTE. **Publicação:** PENDENTE — não publicada. **StarterPack:** PENDENTE — não incluída.

## 04 — Ruan da Clareira

**Status editorial:** DRAFT / aguardando arte. **Criação no editor:** NÃO. **Card ID:** PENDENTE — não criada.

**Arquétipo:** Vigia. **Tipo:** Unidade. **Gameplay aprovado:** custo 2; Poder 1; Vida 4; Guarda.

**Raridade:** Common (`common`), guardião de uma tarefa comunitária recorrente. **Região:** Mata de Namar. **Afiliação:** sem afiliação. **Personagem relacionado:** Ruan, vigia de uma passagem de coleta.

**Lore:** Ruan reconhece quem chega pelo cuidado com que pisa nas raízes. Mantém o caminho dos coletores aberto, mas não entrega a clareira a quem vem contar árvores como mercadoria. Quando a chuva apaga os rastros, ele continua no mesmo lugar.

**Descrição visual:** homem idoso de pele escura, cabelo branco rente e ombros largos sob capa de fibras enceradas. Carrega bastão comprido com ponta de ferro, sem armadura pesada. Está num abrigo elevado baixo entre raízes, com recipientes para água, folhas molhadas e lírios-de-vau distantes; um feixe âmbar atravessa a mata ao fim da chuva.

**Encaixe narrativo:** permanência e proteção de uma passagem sustentam Vigia com Guarda; não há detecção especial, alcance ou habilidade de floresta.

**Art Prompt:**

```text
ART PROMPT — Ruan da Clareira
Crie somente a arte de uma carta de fantasia do universo Deckfall. Vélar é um mundo medieval-renascentista onde florestas e comunidades sobrevivem entre ruínas de uma Queda cuja causa segue desconhecida.
Sujeito: Ruan, vigia idoso de uma passagem usada por coletores.
Aparência: homem de pele escura, cabelo branco rente, mãos envelhecidas, corpo ainda firme.
Roupa/armadura: capa de fibras enceradas verde-acinzentadas, lã simples e botas reparadas, sem armadura pesada.
Pose/ação: permanece à entrada de um abrigo baixo, bastão com ponta de ferro apoiado junto ao corpo.
Expressão: vigilância paciente, sem hostilidade teatral.
Cenário: raízes grandes, passarela curta, recipientes de água, folhas molhadas e poucos lírios brancos na margem distante.
Região de Vélar: Mata de Namar.
Momento/clima: tarde úmida logo depois de chuva.
Iluminação: um feixe âmbar atravessa a copa e revela gotas sobre a capa.
Composição: figura estável no centro, bastão vertical, passagem sugerida atrás sem ocupar toda a cena.
Paleta: verde profundo, madeira molhada, branco de flor e âmbar.
Elementos simbólicos: ferramenta mantida com zelo e marcas de passagem comuns, sem runas luminosas.
Atmosfera: cuidado comunitário e limite entre acolher e ceder o território.
Estilo: dark fantasy painterly / cinematic fantasy illustration, beleza convivendo com decadência, detalhes materiais realistas, sem aparência fotográfica moderna.
Formato: vertical, apropriado para arte principal de carta.
Preservar: rosto, mãos e bastão próximos da área central, com ambiente nas margens para crop.
NÃO incluir: texto, letras, nome, números, atributos, interface, borda, moldura, ícones, marca d'água ou layout de carta. Somente a ilustração.
```

**Arte:** PENDENTE. **Publicação:** PENDENTE — não publicada. **StarterPack:** PENDENTE — não incluída.

## 05 — Sava Rul, Pendão Remendado

**Status editorial:** DRAFT / aguardando arte. **Criação no editor:** NÃO. **Card ID:** PENDENTE — não criada.

**Arquétipo:** Mercenário. **Tipo:** Unidade. **Gameplay aprovado:** custo 3; Poder 4; Vida 3; sem Guarda.

**Raridade:** Rare (`rare`), por representar uma capitã regional recorrente, sem transformar seu posto em superioridade mecânica. **Região:** Marcas do Ferro. **Afiliação:** Companhia do Pendão Roto. **Personagem relacionado:** [Sava Rul](../lore/characters.md#sava-rul), no papel já estabelecido.

**Lore:** Sava manda costurar os rasgos sem esconder as emendas. Cada pedaço lembra um caminho cumprido e uma dívida que ainda precisa cobrar. Hoje seu contingente leva famílias pela estrada; amanhã, alguém lhe oferecerá pagamento para fechá-la.

**Descrição visual:** capitã adulta de olhar firme, ferro escurecido em peças desiguais, faixa de argila e capa de costuras aparentes. Segura espada curta junto ao corpo e o pendão remendado passa atrás do ombro, com nós coloridos. Trigo cortado, carroças de retirada e uma fortificação distante aparecem sob vento seco, sem cena de massacre ou triunfo impecável.

**Encaixe narrativo:** experiência contratada e compromisso instável com seus empregadores correspondem ao Mercenário; não cria contrato, pagamento ou efeito de entrada como mecânica.

**Art Prompt:**

```text
ART PROMPT — Sava Rul, Pendão Remendado
Crie somente a arte de uma carta de fantasia do universo Deckfall. Em Vélar, uma sociedade medieval-renascentista vive entre beleza e decadência séculos após a Queda; a guerra atual também nasce de escolhas humanas.
Sujeito: Sava Rul, capitã da Companhia do Pendão Roto, responsável por uma escolta nas Marcas.
Aparência: mulher adulta de traços firmes, rosto marcado por vento e cansaço, postura experiente.
Roupa/armadura: ferro escurecido em peças desiguais, faixa cor de argila e capa com costuras aparentes.
Pose/ação: observa a estrada com espada curta abaixada e o pendão apoiado atrás do ombro.
Expressão: cálculo e preocupação com quem segue a escolta, sem sorriso triunfal.
Cenário: campo de trigo cortado, carroças e viajantes pequenos ao fundo, fortificação distante.
Região de Vélar: Marcas do Ferro.
Momento/clima: tarde seca com vento forte.
Iluminação: luz lateral quente e sombras frias de nuvens esparsas.
Composição: retrato em três quartos com equipamento visível, pendão legível como tecido, não como painel.
Paleta: barro, ocre de palha, ferro negro e nós de tecido coloridos.
Elementos simbólicos: rasgos costurados e emendas conservadas, sem letras ou brasões escritos.
Atmosfera: proteção profissional, dívida e escolhas ambíguas.
Estilo: dark fantasy painterly / cinematic fantasy illustration, beleza convivendo com decadência, detalhes materiais realistas, sem aparência fotográfica moderna.
Formato: vertical, apropriado para arte principal de carta.
Preservar: rosto, mãos, espada e parte do pendão próximos da área central, com ambiente nas margens para crop.
NÃO incluir: texto, letras, nome, números, atributos, interface, borda, moldura, ícones, marca d'água ou layout de carta. Somente a ilustração.
```

**Arte:** PENDENTE. **Publicação:** PENDENTE — não publicada. **StarterPack:** PENDENTE — não incluída.

## 06 — Brena, Sentinela do Estuário

**Status editorial:** DRAFT / aguardando arte. **Criação no editor:** NÃO. **Card ID:** PENDENTE — não criada.

**Arquétipo:** Sentinela. **Tipo:** Unidade. **Gameplay aprovado:** custo 4; Poder 2; Vida 6; Guarda.

**Raridade:** Rare (`rare`), pela silhueta e função local singulares. **Região:** Lísria. **Afiliação:** Liga das Pontes. **Personagem relacionado:** Brena, veterana da guarda de um embarcadouro.

**Lore:** Brena guarda o embarcadouro onde trabalhou antes de vestir qualquer proteção. Conhece as marcas de cheia mais altas que os homens que agora discutem a passagem. Enquanto uma família ainda espera na margem, ela não recolhe a corrente.

**Descrição visual:** mulher madura de corpo largo, cabelo grisalho trançado e casaco encerado azul-escuro sobre placas de proteção usadas. Sustenta um escudo alto de madeira naval, com gancho e corda de trabalho à cintura. Está num cais de degraus gastos, defendendo a passagem para uma barca; nevoeiro violeta de madrugada, lâmpadas quentes e cobre oxidado contrastam com a água fria.

**Encaixe narrativo:** defesa persistente de uma travessia combina com Sentinela e Guarda; a corrente é cenário, não efeito de bloquear zonas ou turnos.

**Art Prompt:**

```text
ART PROMPT — Brena, Sentinela do Estuário
Crie somente a arte de uma carta de fantasia do universo Deckfall. Vélar é medieval-renascentista, com cidades reconstruídas depois de uma Queda misteriosa; trabalho e abrigo convivem com desgaste e desigualdade.
Sujeito: Brena, sentinela madura da Liga das Pontes num embarcadouro de Lísria.
Aparência: mulher de corpo largo, cabelo grisalho trançado, rosto sereno marcado pela umidade.
Roupa/armadura: casaco encerado azul-escuro sobre placas usadas, botas altas, gancho e corda de trabalho.
Pose/ação: sustenta um escudo alto de madeira naval enquanto mantém aberta a passagem para uma barca.
Expressão: firmeza protetora, sem agressividade desnecessária.
Cenário: degraus gastos do cais, corrente frouxa ao lado, cobre oxidado e passageiros em segundo plano.
Região de Vélar: Lísria, estuário do Candeia.
Momento/clima: madrugada fria com nevoeiro baixo.
Iluminação: lâmpadas âmbar contra água e névoa violeta.
Composição: vista ligeiramente baixa, escudo e corpo ocupam o centro sem esconder o rosto; profundidade no cais.
Paleta: azul-escuro, violeta, madeira molhada, verde de cobre e âmbar.
Elementos simbólicos: marcas de cheia e reparos da madeira, sem textos ou símbolos de interface.
Atmosfera: segurança provisória e dignidade do trabalho comum.
Estilo: dark fantasy painterly / cinematic fantasy illustration, beleza convivendo com decadência, detalhes materiais realistas, sem aparência fotográfica moderna.
Formato: vertical, apropriado para arte principal de carta.
Preservar: rosto, mãos e escudo próximos da área central, com ambiente nas margens para crop.
NÃO incluir: texto, letras, nome, números, atributos, interface, borda, moldura, ícones, marca d'água ou layout de carta. Somente a ilustração.
```

**Arte:** PENDENTE. **Publicação:** PENDENTE — não publicada. **StarterPack:** PENDENTE — não incluída.

## 07 — Dorso de Ardósia

**Status editorial:** DRAFT / aguardando arte. **Criação no editor:** NÃO. **Card ID:** PENDENTE — não criada.

**Arquétipo:** Colosso. **Tipo:** Unidade. **Gameplay aprovado:** custo 5; Poder 5; Vida 6; sem Guarda.

**Raridade:** Epic (`epic`), pela criatura incomum e escala visual, sem bônus por raridade. **Região:** Escarpa de Sal. **Afiliação:** sem afiliação. **Criatura relacionada:** Dorso de Ardósia, apelido local de um grande quadrúpede observado nas encostas; sua origem não é atribuída à Queda.

**Lore:** Os guias chamam de Dorso de Ardósia o animal que atravessa as encostas depois do degelo. Suas placas escuras parecem rocha até que o corpo inteiro respira. Os moradores aprenderam a deixar espaço entre seu caminho e os próprios rebanhos.

**Descrição visual:** grande quadrúpede herbívoro, baixo e pesado, com focinho largo, pelagem curta cinza e placas ósseas escuras sobre o dorso, sem ser feito de pedra. Cascos largos apoiam-se no cascalho salino; líquens pequenos ocupam frestas das placas. Um abrigo distante dá escala, sem cavaleiro montado ou armadura artificial; sol frio depois do degelo e pequenas plantas de encosta evitam uma paisagem inteiramente morta.

**Encaixe narrativo:** massa e força corporal correspondem ao Colosso; não confere armadura mecânica, atropelamento, dano em área ou poderes minerais.

**Art Prompt:**

```text
ART PROMPT — Dorso de Ardósia
Crie somente a arte de uma carta de fantasia do universo Deckfall. Vélar é um mundo medieval-renascentista de natureza e ruínas antigas; a causa da Queda permanece desconhecida, e nem toda criatura incomum surgiu dela.
Sujeito: Dorso de Ardósia, grande quadrúpede herbívoro visto por guias da Escarpa de Sal.
Aparência: corpo baixo, pesado e vivo; focinho largo, olhos pequenos, pelagem curta cinza e placas ósseas escuras que lembram ardósia. Não é golem, robô ou animal feito de pedra.
Roupa/armadura: nenhuma; somente placas naturais e pequenos líquens, sem sela ou equipamento.
Pose/ação: atravessa lentamente uma encosta, um casco adiante e respiração sugerida no ar frio.
Expressão: atenção animal calma, sem malícia humana.
Cenário: cascalho claro, rocha negra, manchas de neve derretida, plantas baixas e abrigo minúsculo distante.
Região de Vélar: Escarpa de Sal.
Momento/clima: manhã fria depois do degelo sazonal.
Iluminação: sol pálido lateral evidenciando textura óssea e pelagem.
Composição: perspectiva baixa em três quartos, corpo inteiro reconhecível, profundidade de montanha para escala.
Paleta: branco mineral, cinza frio, negro de placas, verde discreto e azul distante.
Elementos simbólicos: trilha compartilhada com rebanhos, sem runas, olhos luminosos ou prova de origem cósmica.
Atmosfera: grandeza natural, cautela e vida num ambiente difícil.
Estilo: dark fantasy painterly / cinematic fantasy illustration, beleza convivendo com decadência, detalhes materiais realistas, sem aparência fotográfica moderna.
Formato: vertical, apropriado para arte principal de carta.
Preservar: cabeça, patas e silhueta do dorso próximos da área central, com ambiente nas margens para crop.
NÃO incluir: texto, letras, nome, números, atributos, interface, borda, moldura, ícones, marca d'água ou layout de carta. Somente a ilustração.
```

**Arte:** PENDENTE. **Publicação:** PENDENTE — não publicada. **StarterPack:** PENDENTE — não incluída.

## 08 — Elian Varo, Juramento em Flor

**Status editorial:** DRAFT / aguardando arte. **Criação no editor:** NÃO. **Card ID:** PENDENTE — não criada.

**Arquétipo:** Guardião. **Tipo:** Unidade. **Gameplay aprovado:** custo 6; Poder 4; Vida 8; Guarda.

**Raridade:** Legendary (`legendary`), por representar um personagem central e a imagem temática da onda; não por força automaticamente superior. **Região:** Reino de Auren. **Afiliação:** Ordem do Último Jardim. **Personagem relacionado:** [Elian Varo](../lore/characters.md#elian-varo), vivo e no seu papel atual.

**Lore:** Elian recebeu as chaves para que o refúgio não fosse abandonado. Agora lhe pedem que escolha quem merece entrar. Entre as flores que os viajantes deixaram nas correias de sua armadura, ele ainda procura uma resposta que não transforme o juramento em propriedade.

**Descrição visual:** Elian com armadura de ferro remendada, capa verde-escura, luvas gastas e flores naturais presas longe do fio da espada. Permanece junto à entrada de um refúgio, espada abaixada e mão aberta em direção a quem chega. O jardim em primeiro plano cresce entre pedras partidas, sob a luz do fim do dia; o rosto revela responsabilidade, não santidade ou poder cósmico.

**Encaixe narrativo:** o juramento de proteger uma entrada sustenta Guardião com Guarda. Ser central ou Legendary não altera os números herdados do arquétipo.

**Art Prompt:**

```text
ART PROMPT — Elian Varo, Juramento em Flor
Crie somente a arte de uma carta de fantasia do universo Deckfall. Em Vélar, um mundo medieval-renascentista séculos depois de uma Queda ainda inexplicada, um cavaleiro pode cuidar de flores e pessoas entre reinos decadentes.
Sujeito: Elian Varo, cavaleiro da Ordem do Último Jardim que tenta manter seu refúgio aberto.
Aparência: homem adulto de rosto cansado e atento, postura de quem assume responsabilidades concretas.
Roupa/armadura: ferro remendado, capa verde-escura, luvas gastas; flores naturais recebidas em agradecimento presas às correias, longe da lâmina.
Pose/ação: espada abaixada ao lado do corpo e outra mão aberta para acolher viajantes.
Expressão: firmeza com dúvida humana, sem expressão de santo ou escolhido sobrenatural.
Cenário: entrada de refúgio de pedra partida, jardim vivo e pessoas pequenas sob o arco ao fundo.
Região de Vélar: Reino de Auren, rotas próximas à Mata de Namar.
Momento/clima: fim de tarde de primavera, ar fresco.
Iluminação: luz dourada nas flores e bordas do ferro, sombra verde-azulada sob o arco.
Composição: cavaleiro em três quartos, flores no primeiro plano e porta ao fundo; monumental pela composição, sem halo.
Paleta: verde profundo, ferro, marfim envelhecido e cores delicadas das flores.
Elementos simbólicos: chave simples no cinto, reparos e flores reais, sem runas ou inscrições.
Atmosfera: beleza e decadência, acolhimento e o peso de uma promessa.
Estilo: dark fantasy painterly / cinematic fantasy illustration, beleza convivendo com decadência, detalhes materiais realistas, sem aparência fotográfica moderna.
Formato: vertical, apropriado para arte principal de carta.
Preservar: rosto, mãos, flores e espada próximos da área central, com ambiente nas margens para crop.
NÃO incluir: texto, letras, nome, números, atributos, interface, borda, moldura, ícones, marca d'água ou layout de carta. Somente a ilustração.
```

**Arte:** PENDENTE. **Publicação:** PENDENTE — não publicada. **StarterPack:** PENDENTE — não incluída.

## 09 — Brasa sob a Chuva

**Status editorial:** DRAFT / aguardando arte. **Criação no editor:** NÃO. **Card ID:** PENDENTE — não criada.

**Arquétipo:** Faísca. **Tipo:** Ação. **Gameplay aprovado:** custo 1; `damage`, quantidade 1; alvo líder ou unidade adversários vivos; ignora Guarda. Sem Poder/Vida.

**Raridade:** Common (`common`), por retratar um pequeno gesto de magia, não uma revelação do Vínculo. **Região:** Mata de Namar. **Afiliação:** sem afiliação. **Evento relacionado:** praticante local mantém uma pequena brasa e a lança para afastar um agressor de uma passagem.

**Lore:** A chuva tinha apagado o fogo do abrigo, mas não a pequena brasa entre os dedos do aprendiz. Quando um invasor avançou pela passagem, ele a lançou antes de encontrar uma palavra corajosa. Depois voltou a tentar acender o fogareiro.

**Descrição visual:** close de mãos adultas molhadas fazendo uma brasa saltar em arco curto, com parte de um rosto tenso sob capuz. Ao fundo, uma silhueta hostil ocupa a trilha sem dominar a imagem; o abrigo e o fogareiro frio situam o gesto cotidiano. Chuva oblíqua, dedos com barro, tecido azul-acinzentado e um único ponto laranja, sem muralha de fogo ou explosão.

**Encaixe narrativo:** uma manifestação pequena corresponde à Faísca. A história não cria dano em área, fogo persistente ou efeito adicional.

**Art Prompt:**

```text
ART PROMPT — Brasa sob a Chuva
Crie somente a arte de uma carta de fantasia do universo Deckfall. Vélar é medieval-renascentista, com magia alterada por uma Queda cuja causa não é conhecida; pequenos gestos ainda fazem parte da vida cotidiana.
Sujeito: instante em que um aprendiz adulto lança uma pequena brasa para defender uma passagem.
Aparência: mãos molhadas com barro, rosto parcialmente visível sob capuz, sem traços de entidade divina.
Roupa/armadura: tecido azul-acinzentado simples e manga remendada, sem armadura.
Pose/ação: dois dedos abertos libertam um ponto de fogo em arco curto; a outra mão equilibra o gesto.
Expressão: tensão e surpresa com a própria coragem.
Cenário: trilha de floresta, abrigo de madeira, fogareiro apagado e silhueta adversária pequena ao fundo.
Região de Vélar: Mata de Namar.
Momento/clima: tarde de chuva contínua.
Iluminação: luz fria difusa; a brasa ilumina discretamente dedos e gotas próximas.
Composição: foco fechado no gesto central, rosto no plano imediatamente atrás, sem explosão ou muralha de fogo.
Paleta: azul-cinza, verde escuro, barro e um único laranja vivo.
Elementos simbólicos: fogareiro comum e mãos de trabalhador; nenhuma explicação visual da Queda.
Atmosfera: fragilidade, defesa improvisada e magia de pequena escala.
Estilo: dark fantasy painterly / cinematic fantasy illustration, beleza convivendo com decadência, detalhes materiais realistas, sem aparência fotográfica moderna.
Formato: vertical, apropriado para arte principal de carta.
Preservar: mãos, brasa e rosto próximos da área central, com ambiente nas margens para crop.
NÃO incluir: texto, letras, nome, números, atributos, interface, borda, moldura, ícones, marca d'água ou layout de carta. Somente a ilustração.
```

**Arte:** PENDENTE. **Publicação:** PENDENTE — não publicada. **StarterPack:** PENDENTE — não incluída.

## 10 — Abertura na Ponte

**Status editorial:** DRAFT / aguardando arte. **Criação no editor:** NÃO. **Card ID:** PENDENTE — não criada.

**Arquétipo:** Golpe Preciso. **Tipo:** Ação. **Gameplay aprovado:** custo 2; `damage`, quantidade 3; alvo líder ou unidade adversários vivos; ignora Guarda. Sem Poder/Vida.

**Raridade:** Rare (`rare`), pelo momento de habilidade ligado a Mira. **Região:** Lísria. **Afiliação:** sem afiliação. **Personagem/evento relacionado:** Mira da Ponte Estreita aproveita uma abertura durante uma escolta local.

**Lore:** Mira não esperou que o adversário recuasse. Bastou a manga presa por um instante no corrimão. Seu movimento terminou antes que a água lá embaixo devolvesse o brilho da lâmina.

**Descrição visual:** a mesma Mira da carta 03, casaco vinho e cabelo curto, num gesto de esgrima econômico dirigido à abertura da proteção de um oponente. O enquadramento aproxima mãos, punho da espada e rosto; a ponte molhada e o reflexo do canal dão profundidade. Sem ferimento explícito, morte garantida ou figuras múltiplas atingidas; luz baixa depois de chuva.

**Encaixe narrativo:** precisão do gesto corresponde ao Golpe Preciso. Não introduz acerto crítico, reação, execução automática ou exigência de controlar Mira para jogar a Ação.

**Art Prompt:**

```text
ART PROMPT — Abertura na Ponte
Crie somente a arte de uma carta de fantasia do universo Deckfall. Vélar é um mundo medieval-renascentista de cidades vivas e construções antigas remendadas, séculos depois de uma Queda misteriosa.
Sujeito: movimento decisivo de Mira, espadachim independente, num confronto local de escolta.
Aparência: mulher adulta de pele castanha, cabelo preto curto e pequena cicatriz na sobrancelha.
Roupa/armadura: casaco vinho gasto, camisa clara, proteção de couro em um antebraço e espada estreita simples.
Pose/ação: gesto compacto da lâmina dirigido a uma abertura na proteção de um único adversário; manga dele presa no corrimão.
Expressão: concentração, sem fúria ou prazer em ferir.
Cenário: ponte estreita molhada, canal de água verde, casas com cobre oxidado; adversário apenas parcialmente mostrado.
Região de Vélar: Lísria.
Momento/clima: fim de tarde após chuva.
Iluminação: luz lateral suave sobre lâmina e gotas, reflexo frio vindo do canal.
Composição: foco na relação entre mãos, espada e rosto; diagonal curta, sem efeito de velocidade de interface.
Paleta: vinho, verde de água, aço fosco e pedra úmida.
Elementos simbólicos: corrimão reparado e tecido comum; sem runas ou marcas de acerto.
Atmosfera: habilidade e risco humano, sem massacre ou morte garantida.
Estilo: dark fantasy painterly / cinematic fantasy illustration, beleza convivendo com decadência, detalhes materiais realistas, sem aparência fotográfica moderna.
Formato: vertical, apropriado para arte principal de carta.
Preservar: rosto, mãos e abertura da proteção próximos da área central, com ambiente nas margens para crop.
NÃO incluir: texto, letras, nome, números, atributos, interface, borda, moldura, ícones, marca d'água ou layout de carta. Somente a ilustração.
```

**Arte:** PENDENTE. **Publicação:** PENDENTE — não publicada. **StarterPack:** PENDENTE — não incluída.

## 11 — Mãos de Namar

**Status editorial:** DRAFT / aguardando arte. **Criação no editor:** NÃO. **Card ID:** PENDENTE — não criada.

**Arquétipo:** Recuperar. **Tipo:** Ação. **Gameplay aprovado:** custo 2; `heal`, quantidade 3; alvo líder ou unidade próprios vivos, inclusive com Vida cheia; sem ultrapassar a Vida máxima na resolução. Sem Poder/Vida.

**Raridade:** Common (`common`), pelo cuidado acessível e cotidiano, não pela importância de Maela. **Região:** Mata de Namar. **Afiliação:** sem afiliação. **Personagem/evento relacionado:** [Maela Serre](../lore/characters.md#maela-serre) trata uma viajante viva num abrigo de coleta.

**Lore:** Maela separou as folhas úteis antes que alguém chamasse aquilo de milagre. Lavou as mãos, trocou o pano e pediu à viajante que respirasse devagar. Havia trabalho suficiente para aquela manhã sem prometer a ninguém uma vida sem cicatrizes.

**Descrição visual:** Maela ajoelhada junto a uma viajante consciente, com seu manto azul desbotado e bolsas de amostras. Mãos centrais preparam uma compressa limpa; faca de poda fechada, folhas e tigela de água ficam sobre madeira gasta. Luz fresca de manhã atravessa a folhagem e encontra linho branco, sem halo curativo, ressurreição ou ferida gráfica.

**Encaixe narrativo:** tratamento e recuperação representam a cura aprovada. Não concede cura contínua, remoção de estados, ressurreição ou requisito de possuir Maela em campo.

**Art Prompt:**

```text
ART PROMPT — Mãos de Namar
Crie somente a arte de uma carta de fantasia do universo Deckfall. Vélar é medieval-renascentista: há perdas, ruínas e magia alterada por uma Queda inexplicada, mas o cuidado comum também sustenta a vida.
Sujeito: Maela Serre, botânica livre, preparando uma compressa para uma viajante viva e consciente.
Aparência: duas mulheres adultas, gestos humanos delicados; a viajante cansada acompanha o tratamento com os olhos.
Roupa/armadura: Maela usa manto azul desbotado, botas com barro e bolsas de pano; a viajante veste lã e linho, sem armadura ornamentada.
Pose/ação: Maela ajoelhada, mãos lavadas ajustando pano limpo; a viajante sentada sob abrigo.
Expressão: atenção prática de Maela e alívio cauteloso da paciente.
Cenário: abrigo de coleta, tigela de água, folhas separadas, madeira gasta e faca de poda fechada ao lado.
Região de Vélar: Mata de Namar.
Momento/clima: manhã fresca após noite úmida.
Iluminação: luz de folhas filtrada sobre mãos e linho, sombras verdes suaves.
Composição: cena íntima, mãos no foco e rostos próximos; instrumentos de cuidado em plano secundário.
Paleta: azul gasto, verde de folha, branco de linho e madeira âmbar.
Elementos simbólicos: amostras de plantas e pano reutilizável bem cuidado, sem símbolos de cura ou halo.
Atmosfera: esperança sem promessa de milagre, dignidade e trabalho paciente.
Estilo: dark fantasy painterly / cinematic fantasy illustration, beleza convivendo com decadência, detalhes materiais realistas, sem aparência fotográfica moderna.
Formato: vertical, apropriado para arte principal de carta.
Preservar: rostos, mãos e compressa próximos da área central, com ambiente nas margens para crop.
NÃO incluir: texto, letras, nome, números, atributos, interface, borda, moldura, ícones, marca d'água ou layout de carta. Somente a ilustração.
```

**Arte:** PENDENTE. **Publicação:** PENDENTE — não publicada. **StarterPack:** PENDENTE — não incluída.

## 12 — O Mapa das Duas Margens

**Status editorial:** DRAFT / aguardando arte. **Criação no editor:** NÃO. **Card ID:** PENDENTE — não criada.

**Arquétipo:** Planejar. **Tipo:** Ação. **Gameplay aprovado:** custo 2; `draw`, quantidade 2; compra para o próprio jogador, sem alvo manual. Sem Poder/Vida.

**Raridade:** Epic (`epic`), pela reunião específica de perspectivas e composição visual, sem conceder poder adicional. **Região:** Lísria, com uma rota parcial da Escarpa como assunto. **Afiliação:** Liga das Pontes na organização da reunião; Dessa permanece independente. **Personagens/evento relacionados:** [Inês do Cais](../lore/characters.md#inês-do-cais) e [Dessa Orim](../lore/characters.md#dessa-orim) comparam condições de uma futura viagem de abastecimento.

**Lore:** Inês conhece o peso que uma barca suporta; Dessa conhece os caminhos que não cabem num recibo. Sob a lamparina, nenhuma das duas conseguiu transformar a experiência da outra em certeza. Ainda assim, saíram com mais de uma rota para tentar.

**Descrição visual:** Inês em casaco de lã remendado e Dessa em camadas cinzentas de viagem examinam um mapa artesanal numa oficina de cais. Pesos de cobre, tábuas enceradas e cordas servem de instrumentos; o papel exibe apenas traços abstratos de caminhos, sem letras ou números. A janela mostra chuva azul no canal, em contraste com a lâmpada âmbar; composição vista de cima e em diagonal aproxima mãos e rostos sem revelar mapa global ou resposta histórica.

**Encaixe narrativo:** reunir informações e preparar opções representa Planejar. Não cria busca no deck, escolha de compras, visão do futuro ou acesso à mão adversária; Inês e Dessa não são requisitos mecânicos.

**Art Prompt:**

```text
ART PROMPT — O Mapa das Duas Margens
Crie somente a arte de uma carta de fantasia do universo Deckfall. Em Vélar, um mundo medieval-renascentista reconstruído após uma Queda ainda sem explicação, rotas e conhecimento local são disputados e incompletos.
Sujeito: Inês do Cais e Dessa Orim comparando uma rota parcial de abastecimento, sem descobrirem uma verdade cósmica.
Aparência: duas mulheres adultas de idades diferentes, uma habituada ao cais e outra a viagens de altitude; mãos de trabalho e rostos atentos.
Roupa/armadura: Inês em casaco de lã remendado com chave de depósito no cinto; Dessa em camadas cinzentas de lã, retalhos coloridos e botas com sal, sem armadura.
Pose/ação: uma estabiliza o papel com um peso de cobre e a outra aponta uma bifurcação usando uma vareta.
Expressão: discordância produtiva e concentração, sem gesto de profecia.
Cenário: oficina de cais, mapa artesanal parcial, tábuas enceradas, corda e janela para um canal chuvoso. O mapa contém somente linhas de caminhos, sem letras, legendas ou números.
Região de Vélar: Lísria; a viagem discutida alcançaria caminhos da Escarpa de Sal.
Momento/clima: noite chuvosa e fresca.
Iluminação: lamparina comum âmbar sobre a mesa e luz azul da janela; não usar a Lamparina do Vau ou outro artefato mágico.
Composição: vista elevada em diagonal, rostos e mãos no mesmo núcleo visual; papel como parte da cena, nunca como interface.
Paleta: âmbar, azul de chuva, cobre gasto, papel cru e lã cinzenta.
Elementos simbólicos: bifurcação de caminhos e dois conjuntos de ferramentas, sem símbolos mágicos ou mapa global.
Atmosfera: preparação, confiança negociada e esperança de abastecer comunidades.
Estilo: dark fantasy painterly / cinematic fantasy illustration, beleza convivendo com decadência, detalhes materiais realistas, sem aparência fotográfica moderna.
Formato: vertical, apropriado para arte principal de carta.
Preservar: rostos, mãos e centro da mesa próximos da área central, com ambiente nas margens para crop.
NÃO incluir: texto, letras, nome, números, atributos, interface, borda, moldura, ícones, marca d'água ou layout de carta. Somente a ilustração.
```

**Arte:** PENDENTE. **Publicação:** PENDENTE — não publicada. **StarterPack:** PENDENTE — não incluída.

## Composição futura do StarterPack

**StarterPack Wave 01: 12 identidades × 2 cópias = 24 cartas totais.** Oito identidades de Unidade somam 16 cartas e quatro de Ação somam 8. A composição corresponde exatamente ao deck padrão v0.1; não é uma alteração ou versão remota de pacote.

Sua aplicação futura depende de todas as doze cartas terem arte, revisão, publicação e gameplay elegível na integração apropriada, além da autorização da tarefa que aplicar a composição pelo fluxo vigente de versões imutáveis. Primeiro será necessário confirmar os doze Card IDs reais e sua vinculação às identidades de gameplay. Ter um nome, dois atributos visíveis ou uma entrada neste manifesto não satisfaz elegibilidade.

**StarterPack atual não alterado. Nyra não alterada, excluída ou substituída.** Coleção, concessões, versões históricas e instâncias dos jogadores permanecem fora desta tarefa. Não houve publicação, geração de imagens, upload ou deploy. Deck Rules continua como marco técnico atual/concluído; Deck Builder, Battle Engine e Battle Sandbox não foram iniciados.
