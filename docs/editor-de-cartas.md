# Editor visual de cartas

## Modelo próprio e responsabilidades

O editor usa Konva 10.7.1 diretamente em Angular 18 standalone, mantendo CSS e a organização existente. Konva renderiza; `CardEditorDocument` contém os dados da aplicação. Nunca substituir esse modelo por `stage.toJSON()` nem persistir nós, listeners, histórico, Files ou Blob URLs no Firestore.

`CardEditorDocument` separa `data: CardDataInput` de `canvas: CardCanvasData`. Gameplay inclui nome, descrição, raridade, status e atributos. Canvas contém dimensões, fundo, elementos e metadados dos assets. A geometria ou cor de um texto não altera o valor de um atributo de jogo.

Contratos ficam em `model/interfaces/Cards`. Estado, fábricas, validação, assets, rascunhos e auxiliares de renderização ficam em `model/services/tools`. `CardEditorComponent` orquestra os serviços CRUD/Storage e o componente canvas. Os painéis apresentam e editam estado local, sem acesso Firebase próprio.

## Canvas e elementos

`CardCanvasData` versão 1 contém `width`, `height`, `background`, `elements` e `assets`. Cada elemento possui ID estável, nome, tipo, X/Y, largura/altura, rotação, opacidade, visibilidade, bloqueio e propriedades tipadas por uma union discriminada.

Tipos atuais: `text`, `icon`, `rect`, `circle`, `line`, `image`, `artwork`, `attribute` e `bar`. Moldura e badge são presets de formas; área de descrição é um preset de texto. Eles continuam editáveis. A ordem do array é a ordem visual, de fundo para frente; o painel apresenta a lista inversa. IDs usam UUID, sem depender do índice.

Texto possui conteúdo, vínculo, fonte, tamanho, estilo, alinhamento, espaçamento e entrelinhas. Estilo compartilhado possui fill, stroke, espessura e sombra. Formas aceitam cor/gradiente e raio dos cantos. Imagens possuem referência `assetId`, fit, crop normalizado, zoom, deslocamentos, máscara e filtros de cinza/sépia. `artwork` identifica a área principal, sem fixar sua posição ou dimensão.

Background aceita cor sólida, gradiente, imagem ou textura repetida. Assets armazenam ID, caminho, nome, MIME e bytes. `storagePath:null` representa um arquivo ainda local; os binários permanecem no serviço de assets, fora do JSON persistido.

## Interface e modos

O editor desktop combina biblioteca/camadas à esquerda, canvas central e propriedades/dados à direita. Painéis têm scroll; o layout se adapta a notebooks e telas menores sem alterar o modelo da carta.

- **Design:** adicionar, selecionar, mover, redimensionar, rotacionar, duplicar, excluir, esconder e bloquear elementos. Propriedades variam por tipo; camadas oferecem drag and drop e botões de ordenação.
- **Dados:** Reactive Forms para conteúdo e atributos, incluindo ID estável, chave, rótulo, valor, min/max, ícone e cor. Campos inválidos ficam no formulário; o estado recebe apenas dados válidos. Trocar de modo preserva esse formulário montado.
- **Preview:** canvas limpo, sem Transformer, grid, guides, handles ou placeholders de imagem. A toolbar conserva a troca de modo e exportação.

Seleção atual é individual. `selectedIds` prepara evolução, mas não implementa multisseleção ou Transformer de vários elementos.

## Bindings seguros

Textos usam `binding` explícito ou tokens como `{{name}}` e `{{attributes.attack}}`. A resolução aceita somente `name`, `description`, `rarity`, `type`, `subtype` e `attributes.<chave>`, sem eval ou navegação arbitrária. Raridade usa o rótulo centralizado; valor ausente aparece como `—`.

Elementos `attribute` e `bar` usam `attributeKey`. Renomear uma chave mantendo seu ID atualiza as referências de texto/atributo/bar no estado. Barras calculam proporção pelos limites min/max, sem depender de quatro atributos fixos.

Uma imagem com `binding:'art'` acompanha o asset do primeiro elemento artwork com assetId não nulo. Sem artwork com imagem, usa seu próprio assetId como fallback. O próprio artwork sempre usa seu assetId, evitando autorreferência; trocar a arte atualiza as imagens vinculadas na renderização e exportação.

## Renderização e interação

`CardCanvasComponent` mantém `CardKonvaRenderer`, ResizeObserver e sincronização do estado. O renderer preserva Stage e grupos por ID, com conteúdo e overlays separados; atualiza desenhos por assinatura dos elementos e dados derivados.

Drag/transform alteram nós durante o gesto e gravam geometria no estado ao terminar, sem writes Firebase por movimento. Transformer respeita tamanho mínimo e bloqueio. Grid usa passo 20; snap usa bordas/centros da carta, outros elementos e grid, com guides visuais. São auxiliares de alinhamento, não um sistema completo de constraints.

Zoom muda somente a viewport, com opções 25–150%, ajuste à área disponível e Ctrl+scroll. O estado limita a viewport a 10–200%. Alterar zoom não muda as dimensões reais.

Listeners, Stage, observer e imagens decodificadas são destruídos ao encerrar. URLs Blob pertencem ao serviço de assets e são revogadas no seu ciclo de vida.

## Histórico e atalhos

`CardEditorStateService` mantém snapshots próprios, undo/redo, seleção e dirty state. Há limite de 80 passos. Edição de dados/propriedades pode agrupar mudanças próximas; gestos finalizados geram passos de geometria. Novas mudanças descartam o redo. Salvar atualiza a referência persistida sem substituir o histórico por JSON Konva.

Em Design, fora de inputs/textareas/selects e modais: Delete remove, Ctrl/Cmd+D duplica, Ctrl/Cmd+Z desfaz, Ctrl/Cmd+Shift+Z ou Ctrl/Cmd+Y refaz, Esc desseleciona. Ctrl/Cmd+C/V copia e cola dentro da instância do editor; não usa o clipboard do sistema operacional.

Arquivos de imagens são mantidos em cache durante a sessão para permitir undo após mudanças ou salvamentos. Uma versão antiga recuperada por undo pode precisar reenviar o binário ao salvar, caso sua referência anterior tenha sido limpa.

O cache diferencia ID e origem do arquivo. Assim aplicar um template com o mesmo ID e outro caminho não reutiliza uma imagem antiga; respostas de downloads anteriores não substituem a origem atual. Versões anteriores permanecem disponíveis para Undo dentro do orçamento de memória.

Excluir um elemento remove do documento assets sem outras referências, preservando arquivos compartilhados por elementos restantes. O histórico e o cache permitem restaurá-los por Undo; uma substituição de imagem verifica o limite depois de remover referências antigas, permitindo trocar arquivos mesmo no limite de assets.

## Salvamento, templates e duplicação

Salvar é explícito. `CardService` persiste dados e canvas; `CardStorageService` envia arquivos para o proprietário correto. Falhas retornam mensagens, IDs recuperáveis e caminhos para conferir. Consulte [cartas](cartas.md) para a ordem transacional e compensações.

`CardTemplate` contém nome, canvas e atributos iniciais, além de ID/timestamps. `cardTemplates` é uma coleção administrativa separada. A UI salva novos templates e carrega templates existentes; o serviço também oferece update/delete, sem tela dedicada de gestão de templates nesta fase.

Fantasy Basic é uma composição inicial local e editável de fundo, moldura, nome, artwork, atributos, descrição e raridade. Não há gravação automática desse template no Firebase. Aplicar template pede confirmação e substitui design/atributos iniciais, mantendo os demais dados da carta. Ao salvar uma carta ou template, assets de outro proprietário são copiados para o namespace do destino.

Duplicar carta prepara um novo rascunho local com nome de cópia, status draft e seus binários. A ação Salvar cria o novo documento e materializa arquivos próprios; duplicar não sobrescreve o documento original.

## Rascunho local e JSON

`CardLocalDraftService` salva manualmente documento, Files e data em IndexedDB `deckfall-card-editor`, store `drafts`. A chave é o ID da carta ou `new`. Carregar um rascunho valida o modelo e restaura os binários. É armazenamento deste navegador, sujeito a disponibilidade/quota/limpeza; não é backup remoto.

Salvar local não grava no Firebase. Não há autosave remoto nem debounce de writes. A arquitetura possui dirty state e salvamento explícito para futura evolução.

Baixar JSON exporta o documento validado, sem imagens, histórico ou credenciais. Importar valida versão, campos e limites, pede confirmação e carrega o modelo. Assets com caminho precisam estar acessíveis; assets sem binário devem ser reenviados. JSON não substitui um rascunho IndexedDB com imagens.

## Exportação e limites

PNG/JPEG usam somente conteúdo da carta, sem overlays ou placeholders, em dimensões reais multiplicadas por 1, 2 ou 4. JPEG recebe fundo branco para transparência. Exportação aguarda fontes/imagens, recusa gestos ativos e imagens indisponíveis. O zoom da viewport não muda o arquivo exportado.

| Limite | Valor atual |
| --- | --- |
| Dimensões padrão | 744 × 1039 px |
| Dimensão configurável | 160–2048 px por lado |
| Elementos / assets | 64 / 24 |
| Documento validado pelo cliente | 128 KiB |
| Histórico | 80 passos |
| Arquivo de imagem | PNG/JPEG/WebP, até 5 MiB |
| Cache de Files na sessão | 128 MiB |
| Imagens decodificadas | Até 32 milhões de pixels no total |
| Exportação | Até 32 milhões de pixels após pixelRatio |
| Fontes locais | Arial, Georgia, Times New Roman, Courier New, Verdana, Trebuchet MS |
| Atributos | Até 8, limites personalizados dentro de ±1.000.000 |

O cliente valida profundamente as unions, IDs, referências, cores, fontes e faixas. Rules verificam autorização, envelope e limites específicos; não validam profundamente todos os elementos. Veja [riscos e dívidas](riscos-e-dividas-tecnicas.md) antes de ampliar limites ou anunciar garantias de backend.
