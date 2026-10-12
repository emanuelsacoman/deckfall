# Cartas digitais

> A imagem renderizada da carta é somente uma representação visual. A fonte de verdade da carta são seus dados estruturados.

Cartas servem como base para filtros, decks, batalhas, efeitos, packs, inventário e marketplace futuros. Esses sistemas de jogo não são implementados agora. O design é genérico e separado do gameplay; detalhes de Konva e painéis ficam em [editor de cartas](editor-de-cartas.md).

## Contrato atual e compatibilidade

`Card` reúne ID de leitura, nome/slug/descrição, raridade/status, arte anulável, atributos, `setId`, timestamps e os campos opcionais `type`, `subtype`, `templateId` e `canvas`. `CardDataInput` contém os dados lógicos; `CardInput` acrescenta o canvas. `CardCanvasData` versão 1 guarda fundo, dimensões, elementos e assets próprios.

Raridades: `common`, `rare`, `epic`, `legendary`. Status: `draft`, `published`, `archived`; o status existente `archived` foi preservado. Constantes e rótulos ficam no contrato, sem espalhar strings mágicas.

`CardAttribute` tem chave, rótulo e valor; ID estável, min/max, ícone e cor são opcionais para compatibilidade. Defaults continuam Ataque, Defesa, Velocidade e Magia, com faixa 0–100. O editor permite remover/adicionar/reordenar/renomear até oito atributos e configurar limites dentro de ±1.000.000, com mínimo estritamente menor que máximo e valor finito dentro da faixa. Chaves únicas seguem `^[a-z][a-z0-9_-]{0,39}$`.

Cartas antigas sem canvas são carregadas com composição Fantasy Basic e, quando existir, asset derivado da arte legada. A adaptação e IDs faltantes acontecem no estado local, sem write automático. Salvar explicitamente grava o novo modelo. `setId` é preservado mesmo sem UI de sets.

## Firestore e arquivos

Coleção principal: `cards/{cardId}`. Slug deriva do nome e não promete unicidade global. Timestamps são de servidor; `createdAt` não muda na edição. O serviço lê do servidor e compara `updatedAt` em transação para evitar sobrescrever outra versão.

Binários ficam no Storage:

```text
cards/{cardId}/assets/{uuid}.png|jpg|webp
cards/{cardId}/art/{uuid}.png|jpg|webp       # arte legada compatível
templates/{templateId}/assets/{uuid}.png|jpg|webp
```

No documento, persistir metadados `id`, `storagePath`, `fileName`, `contentType` e `size`, sem Base64 ou URLs bearer. A arte principal também mantém `art` com caminho/nome/MIME/tamanho para compatibilidade da lista. Paths novos são únicos e não sobrescrevem arquivos existentes.

PNG/JPEG/WebP, conteúdo não vazio e até 5 MiB por arquivo; nome original até 255 caracteres. MIME/tamanho são validados, sem serviço backend de inspeção profunda do binário. Downloads autenticados usam Blob e URLs temporárias, revogadas no ciclo de vida. CORS/IAM do bucket podem exigir configuração externa.

As imagens carregam separadamente dos dados na edição. Falhas são lembradas até tentativa manual, troca da origem ou reset do editor. Salvar dados/design conserva as referências de arquivos do próprio namespace, sem exigir download desses arquivos. Novos assets, cópias de outro proprietário e operações com binários completos precisam dos arquivos disponíveis. A janela de retries de operações Storage usada pelo serviço é de até 15 segundos; upload mantém a configuração própria do SDK. Consulte [CORS do Storage](configuracao-cors-storage.md) para o erro de navegador observado em localhost.

O upload preserva os bytes e a transparência do PNG. O editor aplica preenchimento transparente ao enviar PNG para uma camada de imagem/arte principal; essa propriedade acompanha o canvas salvo, sem alterar o contrato dos assets nem as Rules. As áreas transparentes revelam a composição por baixo. Veja [imagens transparentes](editor-de-cartas.md#imagens-png-transparentes).

Espelhamento e ajustes de brilho/contraste/saturação/matiz são propriedades do canvas, aplicadas ao renderizar. Salvar/reabrir uma carta ou template conserva esses ajustes e continua usando o mesmo arquivo original. Não gerar uma cópia raster do asset a cada mudança de slider. Consulte [personalização visual](editor-de-cartas.md#personalização-visual).

## Criar e salvar

1. Validar dados, canvas e uploads pendentes; gerar o ID.
2. Se houver imagens, gravar documento inicial `draft`, `art:null` e canvas sem assets/elementos. Isso permite o upload ao namespace de um proprietário existente. Sem imagens, a gravação pode concluir com o status escolhido.
3. Materializar assets no namespace da carta. Arquivos de outro proprietário são copiados; arquivos novos usam UUID.
4. Finalizar dados/canvas/arte em transação, comparando a versão e recebendo `updatedAt` de servidor.
5. Conferir referências antes de limpar arquivos não utilizados. Avisos mostram caminhos que precisam de revisão.

O editor relê a carta salva, atualiza o estado persistido e preserva histórico. Criação bem-sucedida abre a rota de edição do novo ID. Se a confirmação ou releitura falhar, o ID é mostrado e novas criações são bloqueadas até verificar o documento, evitando duplicação silenciosa.

## Editar e compensar

Uploads novos acontecem antes de atualizar o documento. A transação recusa documentos excluídos ou alterados em outra sessão; somente após confirmar os novos metadados é possível limpar arte/asset anterior não referenciado.

Toda compensação consulta o documento no servidor. Se o arquivo ainda é referenciado, não pertence ao namespace esperado ou o estado não pôde ser confirmado, preservá-lo e informar o caminho. Isso evita apagar uma arte válida quando uma confirmação de gravação foi perdida. Falhas retornam `CardOperationError` com ID; recarregue antes de repetir.

Operações simultâneas de update/delete são bloqueadas por ID na instância local do serviço. Não há lock global entre abas. Arquivos permanecem em cache na sessão do editor para undo; restaurar um design antigo pode exigir novo upload no próximo salvamento.

## Excluir

A lista e o editor pedem confirmação. O serviço primeiro exclui o documento em transação, após conferir `updatedAt`. Depois consulta o estado e limpa somente arquivos registrados daquele proprietário que deixaram de ser referenciados; arquivo inexistente é aceito.

Se a exclusão do documento não for confirmada, os arquivos são preservados e a mensagem orienta conferir o ID. Se o documento foi excluído e cleanup falhou, a operação informa explicitamente a limpeza pendente e seus caminhos. Não há transação atômica entre Firestore e Storage nem reconciliação automática após fechar o navegador.

## Templates, lista e segurança

`cardTemplates` guarda designs e atributos iniciais separados das cartas. Criar/copiar templates materializa arquivos próprios em `templates/{id}/assets`; aplicar um template à carta não cria dependência permanente dos arquivos de outro proprietário depois do salvamento. A UI oferece salvar e carregar templates; o serviço possui CRUD adicional para evolução futura da gestão.

A tela `/admin/cartas/lista` oferece **Lista** e **Cartas inteiras**. Lista mantém miniatura de arte, nome, raridade, status, atualização e ações de editar/excluir; seus downloads têm até quatro operações simultâneas. Cartas inteiras apresenta uma galeria responsiva com o design salvo completo (fundo, imagens, textos, molduras, atributos e efeitos), na proporção original, e um link de edição sobre cada carta. A escolha permanece ao atualizar a coleção nessa tela; abrir uma nova instância começa em Lista. Alternar modos conserva os documentos carregados.

`CardPreviewComponent` solicita a prévia ao entrar próximo da área visível (IntersectionObserver, margem 200px) e permite tentar novamente se houver erro. `CardPreviewService` gera PNG local da composição salva em dimensões reais, com até duas renderizações/downloads simultâneos e leituras autenticadas. Cartas antigas sem canvas usam Fantasy Basic com arte legada, pela mesma adaptação compartilhada com o editor. Assets ocultos sem vínculos visíveis não são baixados; arte principal oculta ainda pode alimentar uma imagem visível vinculada.

Previews não são gravadas em Firestore/Storage. Stage, imagens decodificadas e URLs temporárias são liberados ao gerar/cancelar a prévia. A UI mantém somente a URL do PNG final enquanto o item permanece montado. Trocar modo, recarregar ou sair destrói os componentes e cancela filas/descarta respostas antigas. Na lista, URLs das artes são revogadas ao trocar modo/recarregar/excluir/sair. Cartas sem arte continuam sendo renderizadas com seus demais elementos; falha de imagem necessária mostra erro com retry em vez de uma composição incompleta.

Guards exigem sessão administrativa para o editor; Firestore/Storage Rules exigem admin nas operações protegidas. Apenas metadados de `published` são publicamente legíveis; arte e templates continuam privados. O cliente valida profundamente o modelo; as Rules controlam autorização, campos/envelope e limites específicos, sem prometer validação completa do canvas no servidor.

Veja [modelo Firestore](modelo-dados-firestore.md), [autenticação](autenticacao-e-admin.md) e [riscos](riscos-e-dividas-tecnicas.md). Não houve deploy nesta entrega.
