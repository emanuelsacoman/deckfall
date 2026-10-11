# Riscos e dívidas técnicas

## Configuração externa não verificada

- O SDK possui configuração local e os environments são ignorados. O Console remoto não foi consultado: não afirmar que Auth, Firestore, Storage, primeiro admin ou Rules estão configurados ou ausentes. Conferir [bootstrap](autenticacao-e-admin.md).
- Email/Password e Google precisam estar habilitados, com domínios autorizados e configuração do provedor. Google usa popup; o navegador pode bloqueá-lo ou o usuário cancelá-lo. Não foi executado login real no projeto remoto nesta entrega.
- Vínculo de senha/Google e entrega de e-mail de recuperação foram validados com clientes substituíveis em testes, sem conta ou caixa postal real. Remetente/templates, política de senhas e página de conclusão dependem do Console. Em fallback de reautenticação, o titular deve informar a nova senha novamente após voltar; ela não é persistida.
- Rules e índices foram atualizados localmente, sem publicação ou deploy. Seu estado remoto continua desconhecido. Testes de emuladores não comprovam IAM, provedores ou permissões de produção.
- Downloads autenticados podem exigir CORS e a integração IAM Storage → Firestore. O exemplo em docs/config é preparação; nenhuma alteração remota foi aplicada.
- Um clone precisa preencher environments com valores públicos do Web App. Nunca adicionar service accounts ou credenciais administrativas.
- O gerador já executado pode sobrescrever robots/sitemap/configurações e reintroduzir referências de outro projeto. Não executá-lo novamente sem tarefa específica.
- A máquina possui Java 8 no sistema; os testes da CLI 15.9.0 usam Java 21 portátil em `.local-tools`, ignorado pelo Git. Outras máquinas precisam de runtime/CLI compatíveis.

## Persistência e falhas reais possíveis

Firestore e Storage não compartilham transação atômica. O serviço preserva documentos/arquivos quando não consegue confirmar referências e informa IDs/caminhos. Fechar o navegador entre upload e finalização/cleanup pode deixar arquivos órfãos. Não há job backend de garbage collection ou reconciliação.

Antes de apagar manualmente um arquivo, confira `cards/{id}.art`, `canvas.assets` e, para templates, `cardTemplates/{id}.canvas.assets`. Cleanup só trata os arquivos registrados na operação/documento e pertencentes ao namespace esperado; não varre todo o bucket.

Exclusão agora remove o documento primeiro em transação e depois limpa arquivos. Se cleanup falhar, o documento pode já estar excluído; recarregar a lista não resolve os arquivos pendentes. A mensagem contém caminhos para revisão. Confirmação perdida de exclusão preserva arquivos até conferir o estado. Edições concorrentes são recusadas por versão; não existe lock global entre abas nem coordenação backend de todas as operações.

Assets de outro proprietário são copiados pelo serviço antes da gravação final. A validação de ownership/referências é do cliente; as Rules do canvas não validam profundamente todos os caminhos dos elementos/assets.

## Limites do editor e da validação

- O cliente valida profundamente o modelo; Rules validam autorização, campos/envelope, listas/dimensões e ranges de gameplay, sem validar profundamente cada elemento/asset visual. O limite 128 KiB é do cliente. Um cliente administrativo modificado pode enviar conteúdo profundo diferente; leituras/importações locais rejeitam modelos inválidos.
- Até 8 atributos são validados pelas Rules. Seu orçamento de expressões exige testes reais com o caso máximo sempre que campos ou limites mudarem; não extrapolar para 16 sem redesenho/verificação.
- Imagens têm MIME declarado e tamanho verificados, não inspeção backend profunda. A decodificação/renderização pode falhar; o editor informa erros e limita o total decodificado a 32 milhões de pixels. Até 5 MiB comprimidos não define o custo de pixels na memória.
- Histórico mantém até 80 snapshots. Arquivos ficam em cache durante a sessão para undo, até 128 MiB; substituir muitas imagens pode exigir salvar/reabrir. Imagens decodificadas e exportação possuem orçamento separado de 32 milhões de pixels.
- PNG/JPEG em 1×/2×/4× são implementados; algumas combinações de dimensões/ratio excedem o orçamento e são recusadas. WebP de exportação continua futuro.
- Fontes são locais, sem arquivos embutidos. Disponibilidade de fontes/browser pode alterar a aparência entre dispositivos; o modelo persiste layout/propriedades, sem prometer raster idêntico em todo ambiente.
- Seleção é individual. Multisseleção, grupos editáveis compostos, clipboard do sistema e constraints avançadas de alinhamento continuam futuros. Ctrl/Cmd+C/V usa somente uma cópia interna de elemento.
- Autosave remoto não existe. Salvar e rascunho local são ações manuais. IndexedDB depende de quota/disponibilidade e pode ser removido com dados do navegador; JSON exportado não inclui os binários das imagens.
- Rascunhos locais usam chave da carta ou `new`, sem particionamento por UID. Usar o mesmo perfil de navegador compartilha esse armazenamento local; ele não é um repositório remoto nem uma camada de autorização.
- O serviço tem CRUD de templates; a UI oferece criar/carregar, sem página de edição/exclusão de templates. O template Fantasy Basic é apenas um ponto inicial editável, sem representar design final obrigatório.

## Catálogo, usuários e produto

As listas administrativas carregam coleções completas. Paginação será necessária com maior volume. Slug não garante unicidade global. Arte permanece privada mesmo quando a carta está published; um catálogo público precisa decidir distribuição/revogação de imagens.

A lista de usuários mostra perfis Firestore, não todas as contas Authentication. Vincular por UID não confirma que a conta existe; gestão de credenciais de terceiros ou sincronização completa exigirá backend/Admin SDK. O titular já pode vincular seus próprios métodos e solicitar recuperação de senha em Minha conta.

Rules bloqueiam próprio rebaixamento, mas o formulário atual de perfis não identifica o usuário corrente. Não há garantia global de último admin em solicitações concorrentes; recuperação pode ser feita pelo Console. Cadastro da conta Auth e criação do perfil não são atômicos: falha do perfil pode exigir novo login após configurar Rules.

Jogo, decks, packs, batalhas, inventário, trocas, marketplace e gerenciamento de sets continuam fora desta entrega. Resultados de testes/build ficam no [contexto operacional](contexto-operacional-para-ias.md); não confundir validação local com backend remoto configurado.
