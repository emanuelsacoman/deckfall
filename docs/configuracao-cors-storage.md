# Configuração CORS para imagens do editor

O editor baixa imagens com `getBlob()` do SDK Firebase Storage e cria URLs temporárias no navegador. Esse download direto exige CORS no bucket. Uma resposta sem `Access-Control-Allow-Origin` para `http://localhost:4200` impede o navegador de entregar a imagem ao editor, inclusive quando o servidor responde `206 Partial Content`. [Documentação de download do Firebase](https://firebase.google.com/docs/storage/web/download-files).

Os dois arquivos de environment locais apontam para o projeto `cardgame-6fdcb` e o bucket `cardgame-6fdcb.firebasestorage.app`. Esses nomes são configuração pública; não substitua o bucket por um nome terminado em `appspot.com`. A consulta inicial, em 11/10/2026, confirmou `cors: []` e `metageneration: "1"`. Após autorização explícita do proprietário, somente CORS foi atualizado para permitir `GET` de `http://localhost:4200`, com `maxAgeSeconds:3600`; a consulta posterior confirmou essa entrada e `metageneration:"2"`. Nenhuma Rule, IAM, ACL ou deploy foi alterado. Backups e proposta permanecem em `.local-tools/storage-cors-before-apply.json`, `storage-cors-proposed.json` e `storage-cors-after.json`, ignorados pelo Git.

Um teste OPTIONS sem credenciais no endpoint Firebase confirmou status 200 e cabeçalhos que aceitam GET/Authorization/Range e a origem (`Access-Control-Allow-Origin:*`). O teste usou um caminho de diagnóstico sem baixar arquivos; não representa um teste da sessão administrativa ou do download de uma imagem real. A consulta limitada a um nome sob `cards/` não forneceu um objeto para testar; não inferir daí que a imagem do relato não existe.

O exemplo [storage.cors.example.json](config/storage.cors.example.json) libera somente `GET` para `http://localhost:4200`. Não aplique esse arquivo diretamente sobre uma configuração desconhecida: a atualização define a lista completa de CORS e poderia remover origens já usadas. O procedimento abaixo conserva todas as entradas existentes e adiciona a origem local quando necessário.

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

O próximo comando valida o bucket consultado, cria o backup da lista original e prepara a lista proposta. Todas as entradas atuais, inclusive origens, métodos, cabeçalhos e tempos de cache, são preservadas. Uma entrada existente que já permita `GET` para a origem local ou `*` evita a duplicação.

```bash
python3 - <<'PY'
import json
from pathlib import Path

bucket = "cardgame-6fdcb.firebasestorage.app"
origin = "http://localhost:4200"
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
      else "Proposta preparada: adicionar GET para http://localhost:4200.")
PY
```

Confira a diferença e guarde `bucket-before.json` e `cors-before.json` antes de aplicar:

```bash
diff -u cors-before.json cors-proposed.json
```

`diff` retorna código 1 quando encontra diferenças; isso é esperado para a adição. Se os arquivos forem iguais, investigue a requisição real, a origem usada e possíveis permissões de leitura antes de alterar o bucket. `http://127.0.0.1:4200`, outras portas e domínios de hospedagem são origens diferentes e não são acrescentados por este procedimento.

## Aplicar somente quando a alteração remota estiver autorizada

A instrução atual em [AGENTS.md](../AGENTS.md) é “Não faça deploy nem altere produção nesta fase”. A alteração descrita acima foi uma exceção específica autorizada pelo proprietário. Essa autorização não se estende a novas origens, Rules, IAM ou deploy. Os comandos Google Cloud abaixo são um roteiro para futuras alterações revisadas; a aplicação desta tarefa usou o cliente autenticado da CLI Firebase contra a API oficial, com corpo somente `{cors:...}` e precondição `ifMetagenerationMatch=1`. CORS é uma propriedade remota do bucket, mesmo quando a origem adicionada é apenas `localhost`.

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

Entre com o usuário administrador, abra uma carta existente com imagem e confira na aba Network do navegador se a resposta aceita a origem `http://localhost:4200`. Experimente editar, salvar e exportar PNG: baixar a imagem é necessário para o canvas e a exportação. CORS não concede autorização; as Rules continuam exigindo a sessão e o perfil administrativo.

Se ainda houver erro, registre o código do SDK, status da requisição e a origem exata, sem copiar tokens ou URLs de download privadas. `storage/unauthorized` exige verificar sessão, papel, Rules publicadas e integração Storage/Firestore; `storage/object-not-found` exige verificar se o arquivo referenciado existe. O erro `startTime` em um script `VM...` do print não possui uma origem identificável pelo print: é necessário obter a URL/stack completa antes de atribuí-lo ao projeto.

## Reversão revisada

Para desfazer exclusivamente esta alteração, primeiro consulte o estado atual e confirme que não houve outras mudanças de CORS depois dela. Restaurar o backup inteiro também removeria mudanças posteriores; nesse caso, remova apenas a entrada acrescentada e preserve as novas configurações. Após revisar e autorizar a reversão, o backup original pode ser aplicado:

```bash
gcloud storage buckets update gs://cardgame-6fdcb.firebasestorage.app \
  --project=cardgame-6fdcb --cors-file=cors-before.json
```

Os arquivos gerados são backups da configuração do bucket, não do conteúdo das cartas. Não adicione credenciais ou saída de autenticação a esses arquivos nem ao repositório.
