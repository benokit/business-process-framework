# search

The abstract kind `search-engine` (starts first). An engine kind extends it and provides:

| Operation | Input | Output |
|---|---|---|
| `configureIndex` | `{ indexName, settings? }` | — |
| `deleteIndex` | `{ indexName }` | — |
| `insertDocument` | `{ indexName, document }` (with `id`) | — |
| `removeDocument` | `{ indexName, id }` | — |
| `search` | [`search-query`](elements/search.eson) `{ indexName, query?, filter?, sort?, offset?, limit? }` | [`search-result`](elements/search.eson) `{ hits, total, offset, limit }` |

See [meilisearch](../../infrastructure/meilisearch/README.md).
