# Apresentação e manutenção do README

`README.md` é a apresentação pública do Deckfall no GitHub. Ele deve permitir que um visitante, colaborador ou futuro agente entenda rapidamente o propósito do projeto, o que funciona hoje, seu estágio e como começar. `AGENTS.md` é a porta de entrada dos agentes; `docs/` guarda a memória operacional detalhada.

## Regra permanente

Sempre revise e atualize o README no mesmo trabalho relevante. Isso é obrigatório quando mudar funcionalidades, configuração, arquitetura, estágio, comandos, documentação ou condições de desenvolvimento. A entrega deve deixar a apresentação coerente com o código e as verificações realizadas, sem depender do histórico da conversa.

Não use somente uma troca de data para cumprir essa regra. Atualize o conteúdo que mudou: capacidades, instruções, limites, links ou estágio. Não anuncie uma funcionalidade como disponível antes de implementá-la e validá-la. Quando estiver em andamento, identifique esse estado explicitamente; planos futuros continuam sendo planos.

## Conteúdo e leitura

O README deve manter, nesta ordem aproximada:

1. Nome Deckfall e uma descrição curta da plataforma de cartas digitais.
2. Estágio atual e capacidades reais, com distinção entre aplicação administrativa e funcionalidades futuras.
3. Stack e decisões de arquitetura suficientes para orientar um colaborador.
4. Passos mínimos para instalar, configurar e executar localmente.
5. Comandos de validação e seus pré-requisitos.
6. Links para documentação de domínio, configuração e riscos.

Use títulos claros, parágrafos curtos, listas úteis e comandos copiáveis. Evite badges sem verificação, números fictícios, screenshots desatualizados, promessas de segurança absoluta ou histórico extenso de implementação.

## Conteúdo confiável

Confirme as informações no código, Rules, configurações, interfaces e testes antes de atualizar. Não transforme validação local em afirmação de que o backend remoto está configurado, que as Rules foram publicadas ou que houve deploy.

Ao apresentar usuários, diferencie o perfil Firestore em `users/{uid}` da conta Firebase Authentication. Criar ou editar um perfil não equivale a criar uma conta Auth. Um e-mail de contato editável não altera o e-mail de login. Não anuncie listagem de todas as contas Auth, exclusão de contas ou alteração de senhas sem implementação específica que sustente essas capacidades.

Contratos completos, bootstrap, regras de autorização, fluxos de falhas e pendências externas pertencem aos documentos de domínio. O README deve resumir o necessário e apontar para esses documentos.

## Verificação no mesmo trabalho

- Leia o README ao iniciar uma tarefa relevante e identifique os trechos afetados.
- Atualize a apresentação junto do código e da documentação correspondente.
- Confira comandos, versões citadas, links relativos e o estágio declarado após a validação.
- Informe `README.md` entre os documentos atualizados no relatório da tarefa, explicando a mudança concreta.

Essa manutenção faz parte da entrega. Não deixe a atualização do README para uma sessão futura.
