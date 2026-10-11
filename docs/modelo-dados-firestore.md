# Modelo Firestore

## Coleções

`users/{uid}`: perfil administrativo com `role` e `roleId` iguais (`admin`/`member`), `displayName`, `contactEmail`, `createdAt` e `updatedAt`. UID pertence ao caminho, sem duplicação no documento. Nome e contato são strings opcionais no conteúdo (vazio permitido), limitadas a 120 e 254 caracteres. Novo perfil exige os seis campos e timestamps de servidor. O bootstrap mínimo `role`/`roleId` continua legível/editável: datas antigas ausentes não são inventadas; atualização recebe `updatedAt`, preservando `createdAt` existente ou sua ausência.

As Rules preservadas permitem que admin liste, leia e escreva perfis e que um autenticado leia o próprio. Membros não escrevem nem se promovem; exclusão e próprio rebaixamento são negados. A aplicação atual não autentica usuários nem resolve sessão: a navegação aberta não concede essas permissões, e as operações protegidas são rejeitadas sem sessão por um backend que aplique essas Rules. E-mail de contato não é credencial de login. Não misturar dados públicos do jogador nesta coleção. Leia [usuários](usuarios.md) para detalhes.

`cards/{cardId}`: `name`, `slug`, `description`, `rarity`, `status`, `art`, `attributes`, `setId`, `createdAt`, `updatedAt`. ID pertence ao caminho e não precisa ser gravado no documento. Timestamps são de servidor, não relógio do browser.

- Raridades: `common`, `rare`, `epic`, `legendary`.
- Status: `draft`, `published`, `archived`.
- `art`: null ou mapa `{ storagePath, fileName, contentType, size }`.
- `attributes`: lista de `{ key, label, value }`, valor numérico finito entre 0 e 100. A lista não depende de quatro chaves fixas.
- `setId`: string ou null, reservado para associação futura; não há coleção de sets nesta fase.

As regras limitam campos e valores; leitura pública apenas `published`, admin lê todos e é o único que escreve. Sem autenticação no frontend, a lista administrativa completa e as gravações permanecem protegidas pelo backend. Rules não filtram consultas: uma futura lista pública precisa `where('status', '==', 'published')`.

Não persistir File, Blob, Base64 nem URL de download. Slug é derivado do nome; unicidade global não está prometida. Leia [cartas](cartas.md) para os fluxos e limites efetivamente implementados.

Limites: nome/slug 120 caracteres, descrição 5000, até 8 atributos, chave técnica até 40 (`^[a-z][a-z0-9_-]{0,39}$`), rótulo até 60 e setId até 128. O serviço exige chaves únicas; as Rules validam o conteúdo de cada posição. O limite inicial de 8 conserva margem no orçamento de expressões das Rules, verificado com arte e todos os atributos. `createdAt` permanece imutável na edição e `updatedAt` recebe timestamp do servidor. Tipos de leitura usam `Timestamp | null`; o serviço consulta o servidor antes de operações que dependem da versão.
