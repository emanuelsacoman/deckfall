# Cartas digitais

> A imagem renderizada da carta é somente uma representação visual. A fonte de verdade da carta são seus dados estruturados.

O domínio `Card` prepara filtros, batalhas, decks, efeitos, packs, inventário e marketplace futuros sem implementar esses sistemas agora.

## Contrato

`Card` contém ID de leitura, nome/slug/descrição, raridade/status tipados, arte anulável, atributos extensíveis, associação `setId` anulável e timestamps. `CardAttribute` contém chave técnica, rótulo e número 0–100. Padrões do formulário: Ataque, Defesa, Velocidade e Magia; chaves customizadas são permitidas.

Raridades `common`, `rare`, `epic`, `legendary`; status `draft`, `published`, `archived`. Constantes centralizam os valores. Reactive Forms valida nome, escolhas, atributos e arquivo. Coleção: `cards`; dados da arte ficam no documento, binário no Storage em `cards/{cardId}/art/{nomeUnico}`.

## Fluxos implementados

- Criar: validar, gerar ID e persistir `draft` com `art:null`, enviar arte em caminho UUID e finalizar metadados/status em transação. Sem arte, uma gravação com status escolhido basta. Falha retorna `CardOperationError` com ID para verificar/editar o documento. Se a primeira gravação não foi confirmada, a mensagem instrui conferir o ID antes de repetir; não presume que o documento existe.
- Editar: carregar documento, reutilizar formulário, enviar nova arte em caminho único, gravar dados/metadados em transação e só então limpar arte antiga. Transação compara `updatedAt` e caminho anterior e recusa sobrescrever mudança de outra sessão.
- Compensar: antes de apagar um upload, consultar a carta no servidor. Se ainda aponta para o arquivo, preservá-lo; se não é possível confirmar o estado, preservá-lo e informar o caminho. Assim uma confirmação de gravação perdida não provoca exclusão da arte válida. Cleanup malsucedido produz mensagem/aviso com caminho para conferir e remover manualmente.
- Excluir: pedir confirmação, conferir versão, apagar a arte associada (arquivo inexistente é aceito), conferir versão novamente em transação e excluir documento. Se apagar a arte falhar, o documento permanece para nova tentativa. Se excluir documento falhar após a remoção da arte, a mensagem informa que a arte já foi removida e orienta recarregar/concluir a exclusão ou reenviá-la. Só o arquivo associado é apagado; arquivos de operações interrompidas exigem a revisão descrita abaixo.

`CardService` bloqueia operações simultâneas para o mesmo ID na instância local. Não há bloqueio global entre abas. O formulário preserva `setId` na edição mesmo sem expor gerenciamento de sets. Sucesso e avisos seguem para a lista; falha de criação fornece link de recuperação para o ID e falha de edição permite recarregar. A lista mostra arte, nome, raridade, status, atualização e ações. Imagens carregam com até quatro downloads simultâneos e URLs Blob são revogadas ao recarregar, excluir ou destruir a tela.

Até oito atributos podem ser removidos/adicionados, incluindo decimais entre 0 e 100. Chaves únicas começam com letra minúscula e aceitam letras minúsculas, números, `_` e `-`. O limite inicial foi escolhido após testes reais identificarem que 16 posições ultrapassavam o orçamento de expressões das Rules; oito com arte passam em criação e edição. Ampliar esse limite requer reavaliar o esquema/Rules e repetir os testes.

PNG/JPEG/WebP, até 5 MiB; sem SVG nesta fase. Storage lê apenas admin. Usar bytes autenticados e URL Blob temporária evita persistir/expor URLs bearer com token; revogar URLs no ciclo de vida. Bucket remoto pode exigir CORS para leitura via browser.

Metadados: `storagePath`, nome original até 255 caracteres, `contentType` e tamanho em bytes. Não se usa o nome original como caminho do objeto. Upload novo nunca sobrescreve objeto existente. A validação é de MIME declarado e tamanho, sem processamento/inspeção profunda do conteúdo binário nesta fase.

## Segurança e crescimento

A navegação administrativa está aberta nesta fase simplificada; login e guards serão implementados futuramente. Firestore/Storage Rules continuam controlando dados e exigindo admin para operações administrativas. Sem integração de autenticação, listar todo o catálogo, gravar cartas e acessar artes depende dessa etapa futura; abrir o painel não concede permissão Firebase. Apenas `published` é publicamente legível no Firestore; arte continua privada e exige decisão futura antes de catálogo público. Nenhuma regra permite autopromoção de usuário.

Firestore e Storage não compartilham transação: compensação explícita e mensagens recuperáveis são necessárias; interrupção abrupta e concorrência na exclusão estão documentadas em [riscos e dívidas](riscos-e-dividas-tecnicas.md). Sets, templates, novas raridades e atributos podem ampliar o domínio em trabalhos futuros. Sem abstrações ou coleções vazias antecipadas.
