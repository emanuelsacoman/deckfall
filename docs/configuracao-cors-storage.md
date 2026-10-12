# Configuração CORS para imagens do editor

O editor e a galeria baixam imagens com `getBlob()` do SDK Firebase Storage e criam URLs temporárias no navegador. Esse download direto exige CORS no bucket para a origem exata da página: `http://localhost:4200` no desenvolvimento e `https://deckfall.web.app` no site hospedado são origens diferentes. Uma resposta sem `Access-Control-Allow-Origin` compatível impede o navegador de entregar a imagem, inclusive quando o servidor responde `206 Partial Content`. [Documentação de download do Firebase](https://firebase.google.com/docs/storage/web/download-files#cors_configuration).

Os dois arquivos de environment locais apontam para o projeto `cardgame-6fdcb` e o bucket `cardgame-6fdcb.firebasestorage.app`. Esses nomes são configuração pública; não substitua o bucket por um nome terminado em `appspot.com`. A consulta inicial, em 11/10/2026, confirmou `cors: []` e `metageneration: "1"`. Após autorização explícita do proprietário, somente CORS foi atualizado para permitir `GET` de `http://localhost:4200`, com `maxAgeSeconds:3600`; a consulta posterior confirmou essa entrada e `metageneration:"2"`. Nenhuma Rule, IAM, ACL ou deploy foi alterado. Backups e proposta permanecem em `.local-tools/storage-cors-before-apply.json`, `storage-cors-proposed.json` e `storage-cors-after.json`, ignorados pelo Git.

Um teste OPTIONS sem credenciais no endpoint Firebase confirmou status 200 e cabeçalhos que aceitam GET/Authorization/Range e a origem (`Access-Control-Allow-Origin:*`). O teste usou um caminho de diagnóstico sem baixar arquivos; não representa um teste da sessão administrativa ou do download de uma imagem real. A consulta limitada a um nome sob `cards/` não forneceu um objeto para testar; não inferir daí que a imagem do relato não existe.

Em 12/10/2026, o relato passou a mostrar a origem `https://deckfall.web.app`. A consulta do bucket confirmou que apenas localhost estava permitido, ainda com metageneration `2`. A carta já havia sido editada pelo usuário: seu nome atual era Nyra e a arte referenciada era um WebP de 172.256 bytes; o caminho PNG do recibo inicial não era mais a referência atual. O diagnóstico usou a arte lida do documento atual, preservando essas alterações.

O GET real de mídia no endpoint Firebase, com `Origin: https://deckfall.web.app` e `Range: bytes=0-5242880`, retornou `206`, o WebP completo e `Access-Control-Allow-Origin` ausente antes da correção. Foi adicionado somente `GET` para essa origem, com `maxAgeSeconds:3600`, preservando integralmente a entrada localhost. O PATCH enviou apenas `{cors:...}`, com `ifMetagenerationMatch=2`; a consulta posterior confirmou as duas entradas e metageneration `3`. Nenhuma Rule, IAM, ACL, documento de carta, imagem ou deploy foi alterado.

Após a correção, o mesmo GET/Range retornou `206` com `Access-Control-Allow-Origin: https://deckfall.web.app`; uma segunda leitura com origem localhost também retornou `206` com `Access-Control-Allow-Origin: http://localhost:4200`. Ambas receberam os 172.256 bytes com SHA-256 igual à cópia lida diretamente do Storage. As leituras usaram a identidade OAuth já conectada da CLI Firebase, não uma sessão Firebase Authentication do navegador; confirmam mídia/cabeçalhos, sem substituir o teste do editor com o usuário administrador. Backups e resultados sem credenciais ficam em `.local-tools/storage-cors-deckfall-before.json`, `storage-cors-deckfall-proposed.json`, `storage-cors-deckfall-after.json`, `storage-cors-deckfall-get-before.json`, `storage-cors-deckfall-current-art.json` e `storage-cors-deckfall-verification.json`, ignorados pelo Git.

O exemplo [storage.cors.example.json](config/storage.cors.example.json) permite somente `GET` para localhost e o site Deckfall confirmado. Não aplique esse arquivo diretamente sobre uma configuração desconhecida: a atualização define a lista completa de CORS e poderia remover origens já usadas. O procedimento abaixo conserva todas as entradas existentes e adiciona somente a origem escolhida quando necessário.

## Preparar e revisar no Cloud Shell

Abra o [Google Cloud Console do projeto](https://console.cloud.google.com/storage/browser?project=cardgame-6fdcb) e ative o Cloud Shell com uma conta que possa consultar o bucket. O Cloud Shell disponibiliza a CLI Google Cloud, sem instalar ferramentas no Windows. [Como usar o Cloud Shell](https://cloud.google.com/shell/docs/using-cloud-shell).

Os comandos deste bloco apenas consultam metadados e criam arquivos na sessão do Cloud Shell. O diretório temporário é exclusivo desta execução; conserve seu caminho e os backups até terminar a conferência.

```bash
cors_workdir=$(mktemp -d -t deckfall-cors-XXXXXX)
cd "$cors_workdir"
gcloud storage buckets describe gs://cardgame-6fdcb.firebasestorage.app \
  --project=cardgame-6fdcb --raw \
  --format='json(name,cors,metageneration)' > bucket-before.json
```

Se a consulta falhar, pare e confira a conta/permissões e o nome do bucket. Não use um arquivo vazio como configuração inicial. `--raw` mantém os campos no formato da API, incluindo `cors`; o comando sem essa opção normaliza metadados. [Referência de `buckets describe`](https://cloud.google.com/sdk/gcloud/reference/storage/buckets/describe).

O próximo comando valida o bucket consultado, cria o backup da lista original e prepara a lista proposta para `https://deckfall.web.app`. Para outro ambiente, ajuste `origin` somente à origem necessária e autorizada. Todas as entradas atuais, inclusive origens, métodos, cabeçalhos e tempos de cache, são preservadas. Uma entrada existente que já permita `GET` para a origem escolhida ou `*` evita a duplicação.

```bash
python3 - <<'PY'
import json
from pathlib import Path

bucket = "cardgame-6fdcb.firebasestorage.app"
origin = "https://deckfall.web.app"
metadata = json.loads(Path("bucket-before.json").read_text(encoding="utf-8"))
if not isinstance(metadata, dict) or metadata.get("name") != bucket:
    raise SystemExit("Bucket inesperado: confira a consulta antes de continuar.")
current = metadata.get("cors", [])
if not isinstance(current, list) or not all(isinstance(rule, dict) for rule in current):
    raise SystemExit("Configuração CORS inesperada: revise manualmente antes de continuar.")
proposed = list(current)
covered = any(
    isinstance(rule.get("origin"), list)
    and isinstance(rule.get("method"), list)
    and (origin in rule["origin"] or "*" in rule["origin"])
    and "GET" in rule["method"]
    for rule in current
)
if not covered:
    proposed.append({"origin": [origin], "method": ["GET"], "maxAgeSeconds": 3600})
for name, rules in (("cors-before.json", current), ("cors-proposed.json", proposed)):
    Path(name).write_text(json.dumps(rules, indent=2) + "\n", encoding="utf-8")
print("Origem já permitida; nenhuma alteração necessária." if covered
      else f"Proposta preparada: adicionar GET para {origin}.")
PY
```

Confira a diferença e guarde `bucket-before.json` e `cors-before.json` antes de aplicar:

```bash
diff -u cors-before.json cors-proposed.json
```

`diff` retorna código 1 quando encontra diferenças; isso é esperado para a adição. Se os arquivos forem iguais, investigue a requisição real, a origem usada e possíveis permissões de leitura antes de alterar o bucket. `http://127.0.0.1:4200`, outras portas, `https://deckfall.firebaseapp.com` e domínios personalizados são origens diferentes e não são acrescentados por este procedimento.

## Aplicar somente quando a alteração remota estiver autorizada

A regra geral em [AGENTS.md](../AGENTS.md) é “Não faça deploy nem altere produção nesta fase”. A correção de localhost teve autorização explícita específica. A correção da origem `https://deckfall.web.app` concluiu a solicitação posterior de disponibilizar a carta editável no banco do Deckfall e corrigir a falha de imagem relatada no site. Esse escopo não autoriza novas origens, Rules, IAM ou deploy. As aplicações usaram o cliente autenticado da CLI Firebase contra a API oficial, com corpo somente `{cors:...}` e precondições da versão lida (`1` para localhost, `2` para o site). CORS é uma propriedade remota do bucket, mesmo quando a origem adicionada é apenas `localhost`. Os comandos Google Cloud abaixo são um roteiro para futuras alterações revisadas.

Antes de aplicar, consulte novamente os mesmos metadados e confira que ninguém alterou a configuração desde o backup. Se houver diferença, refaça a preparação a partir do estado atual. Execute a consulta e a comparação separadamente e pare se qualquer uma falhar:

```bash
gcloud storage buckets describe gs://cardgame-6fdcb.firebasestorage.app \
  --project=cardgame-6fdcb --raw \
  --format='json(name,cors,metageneration)' > bucket-now.json
cmp bucket-before.json bucket-now.json
```

Com a proposta revisada e a alteração autorizada, execute somente esta atualização. Ela define CORS; não publica Rules, muda IAM ou torna os arquivos públicos. Como a lista completa é substituída, evite alterações concorrentes durante a operação. [Configuração CORS do Cloud Storage](https://cloud.google.com/storage/docs/using-cors), [referência de `buckets update`](https://cloud.google.com/sdk/gcloud/reference/storage/buckets/update).

```bash
gcloud storage buckets update gs://cardgame-6fdcb.firebasestorage.app \
  --project=cardgame-6fdcb --cors-file=cors-proposed.json
```

Confirme o estado retornado e recarregue o editor:

```bash
gcloud storage buckets describe gs://cardgame-6fdcb.firebasestorage.app \
  --project=cardgame-6fdcb --raw --format='json(name,cors,metageneration)'
```

Entre com o usuário administrador, abra uma carta existente com imagem na origem escolhida e confira na aba Network se o GET real retorna a imagem com `Access-Control-Allow-Origin` compatível. Um OPTIONS bem-sucedido sozinho não comprova que a resposta de mídia permite CORS nem que a sessão passa pelas Rules. Confira também GET com `Range` quando presente. Experimente editar, salvar e exportar PNG: baixar a imagem é necessário para o canvas e a exportação. CORS não concede autorização; as Rules continuam exigindo a sessão e o perfil administrativo.

Após a correção, recarregue completamente a página (`Ctrl+Shift+R`). O editor mantém as falhas de download em cache durante a sessão; **Tentar carregar imagens novamente** também solicita os assets que falharam. Na galeria, **Tentar novamente** recria a prévia da carta. Não substituir o download autenticado por URLs públicas, desabilitar a segurança do navegador nem enfraquecer Rules para contornar CORS.

Se ainda houver erro, registre o código do SDK, status da requisição e a origem exata, sem copiar tokens ou URLs de download privadas. `storage/unauthorized` exige verificar sessão, papel, Rules publicadas e integração Storage/Firestore; `storage/object-not-found` exige verificar se o arquivo referenciado existe. O erro `startTime` em um script `VM...` do print não possui uma origem identificável pelo print: é necessário obter a URL/stack completa antes de atribuí-lo ao projeto.

## Reversão revisada

Para desfazer exclusivamente esta alteração, primeiro consulte o estado atual e confirme que não houve outras mudanças de CORS depois dela. Restaurar o backup inteiro também removeria mudanças posteriores; nesse caso, remova apenas a entrada acrescentada e preserve as novas configurações. Após revisar e autorizar a reversão, o backup original pode ser aplicado:

```bash
gcloud storage buckets update gs://cardgame-6fdcb.firebasestorage.app \
  --project=cardgame-6fdcb --cors-file=cors-before.json
```

Os arquivos gerados são backups da configuração do bucket, não do conteúdo das cartas. Não adicione credenciais ou saída de autenticação a esses arquivos nem ao repositório.
