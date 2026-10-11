# Riscos e dívidas técnicas

## Verificados no reconhecimento local

- Não havia Rules no repositório nem alias `.firebaserc`. A configuração SDK existe, mas o estado do Console, serviços habilitados, primeiro admin e Rules remotas não foi consultado; **não assumir** que estão configurados ou ausentes. Seguir bootstrap e conferir manualmente.
- Environments locais estão ignorados; um clone novo precisa configurá-los a partir do exemplo em `docs/config`. Nenhum segredo foi acrescentado.
- Rules foram preparadas localmente; não houve publicação nem deploy. O estado das Rules remotas permanece não verificado.
- Downloads autenticados de imagens podem exigir CORS do bucket e a integração IAM Storage → Firestore. Nenhuma configuração remota foi alterada.
- O gerador sobrescreve `robots.txt`/sitemap e pode recolocar referências ao Café Sacoman. Os auxiliares atuais foram corrigidos para esta fase sem páginas públicas; evitar reexecutar o gerador.
- Java do sistema é 8. A CLI instalada 15.9.0 exige Java 21; foi obtido runtime portátil com checksum verificado em `.local-tools`, ignorado pelo Git, somente para validação local. Em outra máquina, instalar Java/CLI compatíveis para repetir testes.

## Limites das decisões desta fase

- Autenticação foi adiada por decisão do proprietário: o admin abre sem login e `/login` é apenas placeholder. Não há sessão/guards nem autorização de navegação na UI. Firestore/Storage reais continuam sujeitos às Rules de administrador; a interface aberta não oferece CRUD administrativo livre. Reintroduzir Auth e guards é uma etapa futura, sem enfraquecer as Rules para contornar a ausência de sessão.
- Não existe transação atômica entre Firestore e Storage. Falhas parciais precisam de compensação e identificação explícita; fechamento do browser pode interromper limpeza.
- Fechamento/queda entre upload e finalização pode deixar arquivo não referenciado. Não há job backend de reconciliação nesta fase. Confira referências `cards/{id}.art.storagePath` antes de apagar arquivos pelo Console. Mensagens de cleanup informam o caminho quando a operação consegue terminar.
- Exclusão remove a arte antes do documento. Uma edição concorrente entre essas etapas pode resultar em referência sem arquivo; a segunda transação recusa sobrescrever versão nova e informa a falha. Para gestão por múltiplos admins/abas, considerar posteriormente protocolo de exclusão/backend.
- Lista carrega a coleção administrativa completa, adequada ao início. Paginação será necessária quando o volume crescer. Slug não garante unicidade global.
- Arte é privada mesmo para cartas publicadas. Um catálogo público futuro precisa política própria de distribuição/revogação de imagens.
- UI não define o design final da carta; nesta fase administra dados e arte.
- Usuários listados são perfis do Firestore, não todas as contas do Authentication. O SDK cliente não lista/verifica contas Auth de terceiros; vincular perfil exige conferir o UID no Console. Gerenciar credenciais ou sincronizar todas as contas exigirá backend/Admin SDK futuro.
- As Rules preservadas bloqueiam próprio rebaixamento; o frontend atual não identifica o usuário corrente. Na futura operação autenticada, não existe garantia global de último admin entre solicitações concorrentes de vários admins. Recuperação será feita pelo Console quando necessária.
