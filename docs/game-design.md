# Game Design — Deckfall v0.1

Status: APROVADO — v0.1

Last reviewed: 2026-10-15

Source of truth for: regras de jogo v0.1 aprovadas e registro de aprovação explícita do proprietário

## Situação e aprovação

**Game Design v0.1 APROVADO por Emanuel em 2026-10-15**, após a apresentação da proposta completa. A aprovação abrange as recomendações adotadas, regras, números iniciais, conjunto de referência e critérios de aceitação dos seis blocos finais. A referência e os limites estão em [Aprovações registradas](#aprovações-registradas).

O marco ativo e o próximo incremento de implementação seguem o [roadmap](roadmap.md). Estados de uma regra/versão: **PROPOSTA**, **APROVADO** somente após confirmação explícita de Emanuel com data/escopo/referência registrada, ou **DEPRECATED** com link à substituta. Aprovar o design não comprova implementação, duração real ou balanceamento; mudanças futuras de regras/números voltam à revisão do proprietário.

## Estrutura de v0.1

A regra adotada é um duelo de dois participantes, inicialmente verificável em sandbox e treino, com pressão de campo e decisões sobre trocar unidades ou atacar o líder. Meta de experiência: aprender a sequência básica em uma partida e buscar partidas de aproximadamente **8–12 minutos**. Essa duração e o equilíbrio entre quem começa e quem joga depois são hipóteses de playtest, não resultados medidos.

O núcleo aprovado tem energia automática, duas categorias de carta, cinco unidades por lado e resolução imediata. Ficam fora: reações, pilha de respostas, interrupções, habilidades ativadas de unidades, gatilhos, equipamentos, terrenos, facções obrigatórias, crítico/esquiva, invocação de fichas, ressurreição, PvP funcional, economia e progressão. As fases posteriores conservam seus próprios bloqueios.

### Decisões principais e motivos — APROVADO

Emanuel aprovou a recomendação de cada linha. A coluna final conserva as alternativas consideradas para comparação; elas **não foram adotadas** e não fazem parte das regras v0.1.

| Decisão | Recomendação adotada — APROVADO | Motivo | Alternativa não adotada e custo |
| --- | --- | --- | --- |
| Vitória e vida | Reduzir a vida do líder adversário de 20 a zero | Objetivo visível; espaço para pressão e algumas trocas | 25 de vida: mais recuperação, possivelmente partidas mais longas |
| Deck e cópias | Exatamente 24 cartas; até 2 por identidade de carta | Deck pequeno e pelo menos 12 identidades; evita exceção de cópias por raridade | 30 cartas com o mesmo limite: maior variedade e mais conteúdo necessário |
| Mão e compra | 4 iniciais; 1 por turno; mão máxima 8 | Pouca informação simultânea no mobile e compra previsível | Mão inicial 5: mais opções, mas maior análise de abertura |
| Energia | Aumentar 1 por turno próprio, até 8, e renovar integralmente | Sem cartas de recurso nem mãos travadas por falta delas | Cartas de recurso: acrescentam construção de deck e risco de compra improdutiva |
| Tipos | Unidade e Ação | Duas regras de uso fáceis de reconhecer | Um terceiro tipo permanente: adiar até haver necessidade comprovada |
| Campo | Até 5 unidades por participante, sem linhas de combate | Campo legível e limite pequeno de alvos | 4 vagas: ainda mais compacto, com menos espaço para composições |
| Dano nas unidades | Persistente, com revide simultâneo em combate | Trocas deixam consequência e cura tem função clara | Restaurar vida a cada turno: simplifica marcas, mas reduz desgaste e valor da cura |
| Atributos | Poder e Vida; deixar speed e magic fora do combate v0.1 | Evita prioridade, fórmulas extras e multiplicadores | Reinterpretá-los depois: exige design e balanceamento próprios |
| Proteção do líder | Somente Guarda restringe alvos de ataques | Cria defesa tática sem etapa de bloqueadores | Ataque sempre livre: menos regras, mas menos controle sobre pressão direta |
| Deck vazio | Fadiga crescente por tentativa de compra | Dá urgência e evita derrota abrupta na última carta | Perder na primeira compra vazia: simples, porém mais brusco |
| Mulligan | Uma troca parcial ou total, sem penalidade | Corrige mãos iniciais caras sem efeitos de recurso especiais | Sem mulligan: menor preparação, com mais aberturas pouco interativas |

## Preparação, decks e acesso — APROVADO

1. Cada participante recebe um líder com **20 de vida máxima e atual**, sem poder de ataque ou habilidade própria, um deck válido de **24 cartas**, mão/campo/descarte vazios, energia máxima/atual zero e fadiga zero.
2. Um sorteio determina quem é P1. Embaralhar o deck de P1 e depois o de P2; comprar quatro cartas para cada um, nessa ordem. Em testes, o sorteio e os embaralhamentos usam aleatoriedade reproduzível.
3. Os dois jogadores concluem o mulligan antes do primeiro turno. P1 começa e **não compra no seu primeiro turno**; P2 compra normalmente. A carta adicional acessível a P2 é a compensação inicial adotada, sem moeda extra ou energia temporária.
4. Todas as cartas do deck pertencem ao conjunto de gameplay versionado da partida e têm perfil explicitamente validado para v0.1. Não há mínimo obrigatório de Unidades/Ações, facção, raridade ou sideboard.
5. O limite de duas cópias usa a identidade canônica da carta, não nome, imagem, template ou ID da cópia em batalha. Revisões da mesma carta não criam um novo limite; a partida usa uma única revisão fixada por identidade. Cada cópia física em batalha tem identidade própria.
6. Um futuro deck pessoal persistido deverá conferir quantidade possuída e elegibilidade no backend antes de iniciar a partida; esse contrato não existe hoje. O conjunto inicial de treino/sandbox aprovado usa **decks de referência iguais e acessíveis a todos**, independentes da coleção, sem conceder propriedade. Essa exceção é uma configuração explícita de teste/treino, sem permissão de writes no cliente.
7. O StarterPack registrado com Nyra ×1 não forma um deck de 24 cartas. O design aprovado não altera seu conteúdo nem prevê reset/regrant. O conjunto de referência abaixo é conteúdo aprovado para teste, sem criar cartas, pacotes ou documentos reais.

**Motivo:** separar o acesso necessário ao protótipo da aquisição persistida permite validar o jogo sem antecipar economia nem converter inventário em requisito artificial de teste.

### Mulligan

Cada jogador pode selecionar de zero a quatro instâncias da mão inicial, uma única vez. Separar as escolhidas, comprar o mesmo número do restante do deck e só depois devolver as separadas e reembaralhar. A mesma instância separada não reaparece na reposição; outra cópia da mesma carta pode aparecer.

Cada confirmação registra escolhas privadas e irrevogáveis daquele participante, sem executar reposições enquanto falta a confirmação do outro. Confirmar zero encerra a oportunidade. Após ambas as confirmações, somente as quantidades trocadas são públicas; as identidades permanecem privadas. Resolver P1 e depois P2, independentemente da ordem de chegada, concorrência ou repetição das confirmações. Sem trocas adicionais ou perda de cartas.

## Energia e custos — APROVADO

No início de **cada turno próprio**, aumentar a energia máxima do jogador ativo em um, limitada a oito, e definir a energia atual igual à máxima. Unidades não aumentam energia. Energia não gasta não acumula; a renovação substitui o saldo, e o oponente mantém seus próprios contadores.

Cartas custam inteiros de **1 a 8**. Não há cartas gratuitas, descontos, energia negativa, dívida ou cartas que geram recursos nesta versão. Jogar duas cartas de custo dois consome quatro de energia; atacar não custa energia.

Exemplo: no terceiro turno próprio, o jogador tem três de energia. Pode jogar uma carta de custo três ou combinar custos que somem no máximo três. Encerrar com uma energia não muda o máximo quatro do turno próprio seguinte.

**Motivo:** uma curva automática torna o planejamento previsível e limita o número de ações sem exigir um recurso comprável ou um tipo adicional de carta.

## Tipos e atributos — APROVADO

| Tipo | Dados de batalha | Uso e destino |
| --- | --- | --- |
| Unidade | Custo, Poder, Vida máxima e opcionalmente Guarda | Sai da mão para uma vaga livre do campo; ao morrer, vai ao descarte |
| Ação | Custo e exatamente um efeito básico com seus parâmetros | Resolve imediatamente e vai ao descarte; não ocupa vaga no campo |

Unidades do conjunto inicial têm Poder inteiro não negativo e Vida máxima inteira positiva. A Vida atual começa igual à máxima. Os perfis concretos abaixo usam Poder de 1 a 5 e Vida de 1 a 8; são números iniciais para teste, não limites herdados do editor. Poder zero é permitido, mas a unidade não pode declarar ataque com Poder zero.

**attack:** adotar o significado de Poder de ataque. **defense:** adotar Vida máxima/inicial da unidade e apresentar o rótulo **Vida**, evitando a interpretação de armadura. Dano reduz Vida atual; defesa não subtrai dano e não é comparada ao ataque como condição binária de destruição.

**speed e magic:** excluir ambos da semântica de batalha v0.1. Não determinam iniciativa, dano, custo ou desempate. Isso não apaga dados atuais do editor. A futura modelagem de gameplay deverá declarar os campos próprios e revisar cada carta elegível; nenhum atributo atual é convertido automaticamente.

**Motivo:** custo, Poder, Vida e um marcador de Guarda oferecem diferenças suficientes para o primeiro teste. Reinterpretar magic como custo ou speed como prioridade importaria valores e expectativas sem balanceamento.

## Campo, zonas e informação — APROVADO

| Zona/estado | Regra | Informação para o adversário |
| --- | --- | --- |
| Deck | Pilha ordenada e oculta; comprar remove o topo | Quantidade restante, sem composição/ordem reveladas |
| Mão | Máximo 8 cartas | Apenas quantidade; identidade e detalhes permanecem privados |
| Campo | Até 5 Unidades por lado | Identidade, Poder, Vida atual/máxima, Guarda e disponibilidade de ataque |
| Descarte | Ações usadas, unidades mortas e compras excedentes, em ordem definida | Conteúdo e ordem públicos |
| Líder e recursos | Vida, energia atual/máxima e contador de fadiga | Públicos |

Não há zona de exílio, suporte, equipamento ou recurso físico. O resolvedor pode manter uma carta em resolução internamente, sem criar uma zona de interação ou oportunidade de resposta.

Usar a menor vaga livre do campo, da esquerda para a direita. A posição não cria alcance, proteção de vizinhos ou coluna contra coluna. A sexta unidade é uma jogada inválida: não substitui outra nem gasta carta/energia.

**Mão cheia:** cada compra com oito cartas ainda remove a carta do topo, revela-a e a envia ao descarte. Não escolhe uma carta antiga para descartar e não causa fadiga se havia carta para comprar. Uma compra múltipla processa cada tentativa separadamente.

**Motivo:** limites explícitos mantêm seleção de alvos e exibição manejáveis; o descarte previsível evita uma decisão adicional durante compras.

## Turno e ações legais — APROVADO

As fases são automáticas, exceto a fase principal. Um turno é a vez de um participante; uma rodada corresponde a um turno de cada um.

| Fase | Ordem de resolução |
| --- | --- |
| 1. Preparação | Incrementar o contador de turno próprio; aumentar/renovar energia; preparar as unidades que já estavam no campo |
| 2. Compra | Comprar uma carta, exceto no primeiro turno de P1; aplicar mão cheia/fadiga e conferir término |
| 3. Principal | Jogar carta, declarar ataque ou encerrar; cartas e ataques podem ser intercalados |
| 4. Encerramento | Concluir o turno, passar ao outro participante e executar sua preparação/compra |

Não há descarte obrigatório ao encerrar, regeneração de unidades, efeitos de início/fim ou janela de reação. Passar sem outra jogada é permitido. A disponibilidade para atacar é renovada somente no turno próprio do dono; ela não controla o revide.

Unidades entram sem poder atacar naquele turno. Nos turnos próprios seguintes, cada uma pode atacar **uma vez**, se tiver Poder positivo e alvo legal. Uma unidade que defende continua apta a atacar no próximo turno; revide não consome ataque.

Durante a fase principal, só o jogador ativo emite comandos de jogo. Ambos podem confirmar o próprio mulligan na preparação inicial e podem desistir enquanto a partida não terminou. Não há desfazer após confirmação de uma jogada, compra ou ataque.

**Motivo:** uma fase principal única permite decidir a ordem entre remoção, compra, invocação e ataques sem uma estrutura de prioridades.

## Ataque, defesa e alvos — APROVADO

### Declarar e resolver um ataque

1. Selecionar uma unidade própria apta a atacar e um alvo adversário legal.
2. Validar a intenção inteira antes de alterar o estado. Uma tentativa inválida não consome ataque.
3. Marcar o ataque da unidade como usado. Contra unidade, calcular os dois danos a partir dos Poderes anteriores ao combate e aplicá-los **simultaneamente** às respectivas Vidas atuais.
4. Remover todas as unidades com Vida menor ou igual a zero e conferir término. Contra líder, aplicar somente o Poder do atacante à vida do líder, sem revide.
5. Permitir o próximo comando somente depois de concluída a resolução. Ataques diferentes são sequenciais; o atacante escolhe a ordem.

Uma unidade defensora revida mesmo se entrou naquele turno, já atacou ou vai morrer no mesmo combate. Não há escolha de bloqueador, defesa manual, esquiva, crítico, dano excedente ao líder ou ataque em grupo.

**Exemplo:** uma unidade 3/2 ataca uma 2/3, ambas com Vida cheia. Ambas causam seu dano e morrem. Uma unidade 2/4 que recebe três de dano sobrevive com uma Vida; essa Vida não se restaura no turno seguinte.

### Guarda

Se o adversário controla uma ou mais unidades com **Guarda**, ataques só podem escolher uma delas. Se não houver Guarda, o atacante escolhe qualquer unidade adversária ou o líder. A restrição é verificada a cada ataque; remover a última Guarda libera os próximos.

Guarda funciona imediatamente ao entrar, mesmo sem poder atacar. Não concede redução de dano ou Poder adicional e não limita quantas vezes a unidade pode ser atacada. **Guarda restringe ataques, não efeitos de Ações**.

**Motivo:** é uma única regra defensiva que dá valor a remover ameaças e escolher trocas, sem interrupções.

### Regras de alvo

| Intenção | Alvo permitido | Restrições |
| --- | --- | --- |
| Ataque | Unidade ou líder adversário | Respeitar Guarda; atacante próprio e apto |
| Dano de Ação | Uma unidade ou líder adversário | Pode ignorar Guarda; não afeta aliado |
| Cura | Uma unidade ou líder próprio | Deve existir e estar vivo; limita ao máximo de Vida |
| Compra | O próprio jogador, automaticamente | Sem seleção de alvo |

Identificadores de mão, descarte, unidade morta, outro match ou lado incorreto não são alvos válidos. Ações não atacam cartas ocultas. Cura em alvo já com Vida cheia é legal e produz zero cura; a interface deve informar isso antes de confirmar. Uma unidade removida não pode ser curada.

Toda Ação exige alvo válido quando seu efeito o requer. Antes de pagar custo, conferir turno, fase, identidade na mão, custo, alvo e vaga, quando aplicável. Rejeição conserva estado, cartas, energia, ataque disponível e aleatoriedade.

## Efeitos básicos e resolução — APROVADO

| Efeito | Semântica | Valores do conjunto inicial |
| --- | --- | --- |
| Causar dano | Subtrair N da Vida do alvo adversário; sem armadura ou resistência | 1 ou 3 |
| Curar | Restaurar N no aliado escolhido, até Vida máxima; sem reviver | 3 |
| Comprar | Tentar comprar N cartas para quem usou a Ação, uma por vez | 1 ou 2 |

Guarda é uma característica fixa da Unidade, não um gatilho executável. Não há efeitos de entrada/morte, buffs, debuffs, durações, auras, escudos, veneno, compras escolhidas, dano em área, efeitos aleatórios ou combinações de efeitos por carta. Novos efeitos e novos parâmetros dependem de revisão de conteúdo/design; descrição livre nunca é instrução executável.

Uma Ação válida paga o custo, sai da mão para o descarte e aplica seu único efeito. Dano é um lote atômico, cura é uma aplicação e compra é uma sequência de tentativas. Após cada lote de dano ou tentativa de compra, limpar mortos e conferir término antes de continuar. Se uma compra por efeito causar derrota por fadiga, interromper as tentativas seguintes; não devolver a carta ou energia já utilizadas.

Unidades mortas no mesmo lote entram no descarte em ordem canônica: dono P1 antes de P2, e vaga menor antes de maior. A ordem não dispara nada nesta versão, mas torna histórico e replay inequívocos.

**Motivo:** três efeitos e uma característica fixa cobrem pressão, recuperação e reposição de mão. Excluir cadeias/gatilhos evita recursão, dependências de prioridade e interpretação de texto.

## Vitória, deck vazio e término — APROVADO

- Líder com Vida menor ou igual a zero perde após a resolução do lote que causou o dano; se os dois chegarem a essa condição no mesmo lote, o resultado é empate. O conjunto inicial não possui Ação que cause dano aos dois líderes; a regra explicita a semântica de simultaneidade.
- Desistir encerra a partida com derrota do desistente. Não há vitória alternativa por destruir unidades, possuir cartas ou alcançar energia.
- Deck vazio sozinho não encerra a partida. Cada tentativa de comprar sem carta incrementa o contador individual de fadiga e causa esse valor de dano ao próprio líder: **1, depois 2, depois 3…**. Não há carta para enviar ao descarte.
- Dano de fadiga ignora Guarda. Cura não reduz o contador. Uma compra de duas com uma carta restante compra essa carta e depois aplica uma fadiga; se ela for letal, encerrar imediatamente.
- Depois de um resultado terminal, nenhuma nova jogada ou passagem de turno é aceita. Recuperar o recibo de um comando já aplicado continua possível, sem alterar o resultado.
- Não propor timer, derrota por desconexão ou limite artificial de turnos nesta etapa. AFK, abandono e reconexão competitiva pertencem ao futuro multiplayer e exigem política própria.

**Motivo:** fadiga crescente impede reposição infinita e dá consequência à compra extra no fim. Evita perder só por ter comprado a última carta válida.

## Raridade, acesso e balanceamento — APROVADO

Raridade permanece classificação editorial/visual. Não altera custo, Poder, Vida, limite de cópias, energia, prioridade ou efeito por si mesma. Não há restrição exclusiva para lendárias nem regra de que uma carta mais rara deva ser mais forte.

O protótipo de treino deve oferecer o mesmo conjunto de referência a todos. Não há compra com dinheiro, moeda ou chance de raridade em v0.1. Acesso equivalente ao conjunto e balanceamento por custo/função são necessários para avaliar estratégia; a etiqueta de raridade isoladamente não assegura justiça. Antes de uma economia futura, revisar distribuição/acesso e impedir que pagamento compre vantagem mecânica.

O balanceamento inicial considera custo, Poder, Vida, Guarda e eficiência da Ação juntos. Valores baixos e poucas características favorecem testes. Nenhuma fórmula rígida ou equivalência exata de atributos está aprovada, e nenhuma carta atual foi balanceada por esta proposta.

### Conjunto de referência para sandbox/treino — APROVADO

O pool didático aprovado tem **16 identidades**. O deck padrão usa **12 delas com duas cópias de cada**, totalizando 24 cartas: 16 Unidades e 8 Ações. Os dois participantes podem usar esse mesmo deck para testar a vantagem de iniciativa. As quatro identidades complementares permitem experimentar outras construções legais, sem novas mecânicas; um pool de apenas 12 identidades obrigaria sempre a mesma lista com o limite de duas cópias.

Nomes são rótulos de protótipo; não criam cartas no catálogo nem adaptam Nyra automaticamente. O conjunto é acessível de forma igual no contexto de referência. Trocas na lista para teste conservam 24 cartas e o limite de duas cópias.

| Rótulo de protótipo | Tipo | Custo | Poder / Vida | Característica ou efeito |
| --- | --- | --- | --- | --- |
| Recruta | Unidade | 1 | 2 / 1 | Sem característica |
| Escudeiro | Unidade | 1 | 1 / 2 | Guarda |
| Duelista | Unidade | 2 | 3 / 2 | Sem característica |
| Vigia | Unidade | 2 | 1 / 4 | Guarda |
| Mercenário | Unidade | 3 | 4 / 3 | Sem característica |
| Sentinela | Unidade | 4 | 2 / 6 | Guarda |
| Colosso | Unidade | 5 | 5 / 6 | Sem característica |
| Guardião | Unidade | 6 | 4 / 8 | Guarda |
| Faísca | Ação | 1 | — | Causar 1 de dano a um alvo adversário |
| Golpe preciso | Ação | 2 | — | Causar 3 de dano a um alvo adversário |
| Recuperar | Ação | 2 | — | Curar 3 em um alvo próprio |
| Planejar | Ação | 2 | — | Comprar 2 |

Complemento do pool, **fora do deck padrão**:

| Rótulo de protótipo | Tipo | Custo | Poder / Vida | Característica ou efeito |
| --- | --- | --- | --- | --- |
| Lanceiro | Unidade | 2 | 2 / 3 | Sem característica |
| Vanguarda | Unidade | 3 | 3 / 4 | Sem característica |
| Bastião | Unidade | 5 | 3 / 7 | Guarda |
| Intuição | Ação | 1 | — | Comprar 1 |

**Motivo:** um conjunto concreto permite discutir curva, pressão, Guarda, cura e compra sem exigir arte ou catálogo definitivos. O conteúdo está aprovado como ponto inicial de teste; só será fixture jogável após implementação nos marcos permitidos.

Registrar em playtests duração real, turnos, vantagem de P1/P2, frequência de mulligan, compras descartadas e estratégias dominantes. A meta de 8–12 minutos e os números acima podem exigir ajuste; testes de regras não comprovam balanceamento.

## Desktop e mobile — APROVADO

Representar cinco vagas de cada lado, líder e recursos sempre identificáveis. Cartas em mão podem usar apresentação compacta e inspeção ampliada, preservando uma seleção clara de alvo.

Oferecer toque/clique em carta ou atacante, destacar alvos legais e confirmar a intenção; não exigir arraste, hover, clique direito ou gesto preciso. Mostrar custo, Guardas, Vida atual/máxima, unidades recém-invocadas e ataques já usados. Cancelar seleção antes da confirmação é permitido.

Animação apenas apresenta o resultado já resolvido; sua duração, ausência ou opção de reduzir movimento não altera turno, dano ou legalidade. Uma intenção recusada não consome recursos. A ausência de confirmação pode ocorrer depois de uma jogada aceita: consultar seu resultado/recibo antes de supor falha, preservando a idempotência. Essas são diretrizes para o futuro sandbox, sem alteração da interface atual.

## Requisitos para o futuro BattleEngine — APROVADO

Esta seção define critérios conceituais para os marcos posteriores. Não introduz interfaces TypeScript, esquema Firestore, Callables ou escolha de transporte. Preserva a autoridade já estabelecida em [ADR-0001](decisions/0001-autoridade-backend.md).

1. **Resolução pura:** estado + intenção + regras/conteúdo fixados produzem novo estado e eventos, ou rejeição sem alteração. Sem Firestore, rede, relógio, animações, leitura de canvas, Math.random ou geração imprevisível de IDs dentro da resolução.
2. **Reprodução determinística:** especificar e versionar PRNG, embaralhamento, ordem de consumo e estado/contador. Fixar seed no início, com fonte confiável para partidas futuras. Mesmo estado inicial, versões, seed e sequência de intenções aceitas devem produzir estados/eventos idênticos. Rejeições não avançam PRNG. Mulligan resolve em ordem canônica, não na ordem da rede.
3. **Conteúdo fixado:** conservar versão das regras, perfis de gameplay, decks e revisões de carta usados na partida. Alterar/arquivar uma carta depois não muda uma partida em andamento. A política de elegibilidade é conferida antes de iniciar; não consultar o catálogo vivo a cada ataque.
4. **Estado explícito:** distinguir cópia física de definição de carta; registrar jogador ativo, fase, contadores de turno, ordem de zonas, vagas, Vida atual/máxima, energia, disponibilidade de ataque, fadiga, aleatoriedade e resultado. Usar inteiros e limites finitos definidos no ruleset; não depender de floats, ordem de consultas ou locale. Identificadores e critérios de ordenação precisam ser estáveis.
5. **Cliente envia intenção:** selecionar carta/atacante/alvo, encerrar turno, confirmar mulligan ou desistir. Não aceitar como autoridade dano, compra escolhida, custo, atributos, seed, UID arbitrário, estado final ou vencedor enviados pelo cliente.
6. **Validação backend:** derivar identidade da autenticação, conferir participação, estado não terminal, fase/turno, revisão, instância na zona correta, energia, alvo, Guarda e vaga. Separar permissão de usar deck de referência do inventário pessoal. Cliente pode antecipar feedback visual; o servidor confirma ações e resultados.
7. **Atomicidade e repetição:** na futura persistência de partidas, usar revisão esperada e ID idempotente de comando no escopo partida + participante autenticado. Mesmo ID/conteúdo recupera seu recibo; mesmo ID com conteúdo diferente é rejeitado. Consultar recibos exige autorização e devolve somente a projeção daquele participante, sem eventos privados do oponente. Concorrentes sobre o mesmo estado/revisão não aplicam os dois; um comando ainda não aplicado com revisão antiga é recusado, e o cliente relê o estado antes de formular nova intenção. Estado, eventos/recibo e resultado terminal devem compartilhar commit; retries não geram efeitos externos duplicados. Confirmar mulligan também segue essas garantias: aceitar uma confirmação privada por vez, reler a nova revisão para a outra se necessário e resolver reposições uma única vez após ambas.
8. **Informação oculta:** seed/estado PRNG, ordem/composição não revelada do deck e mão adversária ficam no estado autoritativo. Não enviá-los em respostas, erros, logs públicos, eventos ou IDs que codifiquem posição/carta oculta. Cada participante recebe sua projeção e eventos autorizados. Determinismo não torna seguro expor a seed durante a partida.
9. **Mesma regra em todos os contextos:** sandbox, bot e futuro backend usam o mesmo resolvedor. O bot escolhe com a informação permitida ao seu participante; inspeção completa é modo explícito de sandbox. Treino local e testes não concedem propriedade, moeda ou resultado competitivo.
10. **Tempo e efeitos externos separados:** políticas futuras de timeout/reconexão entram como intenções ordenadas pelo backend, quando aprovadas. Persistência, autenticação e apresentação ficam fora do núcleo puro. Não antecipar reward, shop ou novo backend nesta proposta.

A validação centralizada de ações e a manutenção de estado autoritativo são também descritas na [documentação técnica da Heroic Labs](https://heroiclabs.com/docs/gameplay-multiplayer-server-multiplayer/). A referência sustenta o princípio; não é decisão de adotar plataforma, biblioteca, servidor em ticks ou transporte. A arquitetura vigente do Deckfall permanece a fonte para implementação futura.

## Cenários mínimos de aceitação — APROVADO

Estes casos definem a aceitação do jogo completo. O [contrato e efeitos tipados](gameplay-contract.md) já testam formato, invariantes de snapshots, parâmetros/alvos de efeitos e projeções; transições de combate, execução de efeitos, composição de decks e integração permanecem nos respectivos marcos. Resultados executados ficam no [contexto operacional](contexto-operacional-para-ias.md#validação-disponível); esta lista não anuncia todos os cenários como implementados.

| Cenário | Resultado esperado pelo design aprovado |
| --- | --- |
| Deck com 23/25 cartas ou terceira cópia de uma identidade | Recusar antes de iniciar; revisão diferente não burla limite |
| Deck pessoal sem cópias possuídas; referência de treino válida | Recusar o primeiro; aceitar o segundo só no contexto explícito de treino |
| P1 e P2 começam | Ambos com 20 de Vida e quatro cartas; P1 pula sua primeira compra; P2 não |
| Mulligan parcial/total/zero | Uma confirmação privada e irrevogável por participante; reposições só após ambos; tamanho preservado; resultado independe da ordem da rede e de retries |
| Turnos próprios e energia | Cada jogador evolui independentemente 1→8; renovar não acumula sobras |
| Custo insuficiente/exato | Insuficiente não muda nada; exato deixa energia zero |
| Sexta unidade ou carta fora da mão | Recusar sem consumo; vaga válida usa menor índice livre |
| Unidade nova, já atacante ou com Poder zero | Não pode declarar ataque; defensora ainda revida |
| Dois combatentes com dano letal | Ambos causam dano e morrem no mesmo lote, sem dano excedente ao líder |
| Dano persistente e cura | Ferimento continua após turno; cura respeita máximo; morto não é alvo |
| Uma ou mais Guardas | Ataques exigem Guarda; Ação de dano pode escolher o líder; após última Guarda morrer, ataque seguinte fica livre |
| Mão cheia | Consumir topo e descartá-lo publicamente; não gerar fadiga enquanto havia carta |
| Deck vazio e compra múltipla | Fadiga individual 1, 2, 3…; parte disponível é comprada; derrota interrompe tentativas restantes |
| Líder em zero e simultaneidade terminal | Confirmar derrota no checkpoint; lote com ambos em zero empata |
| Desistência ou comando após término | Desistência termina; novo comando de jogo é recusado; retry recupera recibo |
| Replay e versão | Mesmas entradas geram mesmos estados/eventos; edição posterior do catálogo não interfere |
| Duplicação, resposta perdida e concorrência | Um único resultado persistido; nenhum custo/ataque aplicado duas vezes |
| Projeção, recibos e bot | Nenhuma mão, seed ou ordem oculta adversária exposta, inclusive ao recuperar recibos; bot usa somente informação permitida |

Adicionar casos de borda dos números aprovados e testes de invariantes: conservação de instâncias entre zonas, campo/mão dentro dos limites, energia legal, ordenação estável e resultado terminal imutável. Duração e vantagem de iniciativa exigem playtest além da conformidade do motor.

## Relação com o código existente

Fatos verificados: [Card](../src/app/model/interfaces/Cards/card.ts) possui atributos genéricos, raridades cadastrais, type/subtype livres e canvas separado. Esse contrato de catálogo não incorpora o perfil de batalha descrito aqui nem seus custos/efeitos tipados. Seus defaults attack/defense/speed/magic não implementam estas regras.

[Cartas](cartas.md) continua a fonte do contrato atual; [editor](editor-de-cartas.md) trata apresentação. [Coleção](colecao.md), [bootstrap](player-bootstrap.md) e [pacotes](pacotes.md) continuam com suas permissões/concessões atuais. A aprovação do design não muda documentos persistidos, StarterPack, Rules ou autoridade do inventário.

A adaptação das cartas e perfis de batalha pertence aos respectivos marcos do roadmap. Custos, Poder, Vida e efeitos exigem conteúdo revisado, sem dedução de nome, descrição, arte, raridade ou layout. O conjunto de referência é independente do catálogo publicado existente.

## Critério para submeter à aprovação

O critério foi atendido: o documento cobre parâmetros, preparação, zonas, recursos, legalidade, combate, resolução, término, conteúdo de referência e casos de aceitação. A aprovação explícita do pacote foi recebida e está registrada abaixo; as alternativas de comparação não foram adotadas.

O [Project State](project-state.md) e o [roadmap](roadmap.md) refletem a aprovação e a implementação efetivamente validada. O [Gameplay Contract](gameplay-contract.md) aplica o primeiro incremento técnico sem antecipar executor de efeitos, Deck Rules, deck builder, Battle Engine, interface de batalha ou deploy. Os próximos passos seguem o roadmap; revisões futuras do design precisam identificar a alteração e obter nova aprovação explícita.

## Aprovações registradas

**Versão: v0.1. Status: APROVADO. Proprietário: Emanuel Sacoman. Data: 2026-10-15.**

Pedido original: elaborar uma proposta completa de Game Design v0.1 para revisão, mantendo suas regras como PROPOSTA / PENDENTE até a decisão do proprietário. Esse pedido autorizou a elaboração do documento; não foi usado como aprovação das regras.

Confirmação posterior do proprietário nesta sessão, após receber a proposta completa e seus seis blocos de decisão:

> tem minha aprovação, pode aplicar

Escopo aprovado: os seis blocos da seção final, com as recomendações da tabela adotadas, incluindo seus números iniciais, regras detalhadas, conjunto didático e cenários de aceitação. Não foram indicadas exceções. As alternativas da última coluna não foram escolhidas. Duração de 8–12 minutos, equilíbrio de iniciativa e balanceamento continuam hipóteses a medir em playtests; aprovar os valores iniciais não comprova esses resultados.

A confirmação liberou o primeiro incremento pequeno do roadmap, Gameplay Contract. Os demais marcos mantêm suas dependências e o escopo próprio; não há autorização de deploy, alteração de produção ou implementação automática de múltiplos marcos.

## DECISÕES QUE EMANUEL PRECISA APROVAR

**Resolvido: os seis blocos abaixo foram APROVADOS por Emanuel em 2026-10-15**, conforme [o registro](#aprovações-registradas). O título é preservado para manter os links existentes. Não há decisão de v0.1 pendente nesses blocos; economia, monetização e multiplayer futuro conservam seus próprios marcos e decisões.

1. **Objetivo e parâmetros de abertura:** duelo, vitória por zerar o líder de 20 de Vida; quatro cartas iniciais, uma compra por turno, P1 sem primeira compra, mulligan único e mão máxima oito.
2. **Deck e acesso ao protótipo:** 24 cartas, até duas cópias por identidade; deck pessoal dependente de propriedade e decks de referência iguais no treino sem concessão ao inventário.
3. **Recurso e turno:** energia automática de um a oito, custos de um a oito e fase principal com cartas/ataques intercalados, sem respostas ou interrupções.
4. **Combate e atributos:** cinco unidades por lado, espera para atacar, um ataque por turno próprio, dano persistente e revide simultâneo; Guarda restringe ataques; Poder/Vida substituem a interpretação ambígua de attack/defense e speed/magic ficam fora da batalha v0.1.
5. **Tipos, efeitos e conteúdo inicial:** Unidade/Ação, somente dano/cura/compra e Guarda; pool didático de 16 identidades e deck padrão de 12 ×2 para testar, com números sujeitos a balanceamento.
6. **Encerramento:** fadiga crescente, derrota por Vida zerada/desistência e empate por morte simultânea; sem timer ou derrota por desconexão nesta etapa.
