# search

The abstract kind `search-engine` (starts first). It declares these [abstract operations](../../core/README.md#interfaces), which an engine kind implements. `settings`, `filter` and `sort` are in the engine's own language (`rows` is a filter tree over the document, in LambdaJSON, which the engine translates and applies besides `filter`), as SQL is for a [database](../database/README.md):

| Operation | Input | Output |
|---|---|---|
| `configureIndex` | `{ indexName, settings? }` | — |
| `deleteIndex` | `{ indexName }` | — |
| `insertDocument` | `{ indexName, document }` (with `id`) | — |
| `removeDocument` | `{ indexName, id }` | — |
| `search` | [`search-request`](elements/search.eson) `{ indexName, query?, filter?, rows?, sort?, offset?, limit? }` | [`search-result`](elements/search.eson) `{ hits, total, offset, limit }` |

A `search-index` is an index, independent of the engine: its id is the index name, and it lives in the single or bound `search-engine`, as a query runs on the single or bound database. Its slot `implementations` holds the engine's settings for it (`{ provider: <engine kind>, settings? }`); in `start`, after the engines, the index configures itself with the settings for the most specific kind of that engine, or with none. Its operations `insertDocument({ document })`, `removeDocument({ id })` and `search({ query?, filter?, sort?, offset?, limit? })` go to its engine, so callers name the index, never the engine.

```json
{ "id": "party-search-index", "kind": "search-index", "data": {} }
{ "kind": "slot-fill", "data": { "target": "party-search-index", "slot": "implementations", "value": { "provider": "meilisearch-engine", "settings": { "filterableAttributes": ["partyType"] } } } }
```

A `search-query` is an [integration](../integration/README.md) with provider `search-engine` and output `search-result` by default: a logical search with its own input contract (parameters named for what they mean, such as `generalSearch` for free text over every searchable attribute), owned by the module or application that needs it and implemented for each engine kind in the engine's language. Expose one with an endpoint of its own.

```json
{ "id": "parties-by-type-search-query", "kind": "search-query", "data": { "input": { "!partyType": "string", "generalSearch": "string" } } }
```

See [meilisearch](../../adapters/meilisearch/README.md).
