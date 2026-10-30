# entity-search

Full-text search over entities, kept up to date from [entity-events](../entity-events/README.md).

- Declares the one-slot `searchIndex` on `entity-type`: `{ index, mapping }`, where `index` is a [`search-index`](../search/README.md) (which holds its engine settings) and `mapping` a method from an entity record to a document (its `id` is always the entity id).
- The consumer `entity-search-indexer` (channel `entity-events`) inserts the mapped record on every write and removes it on delete. A record already deleted when its event arrives is skipped, and so are events of entity types this process doesn't define.
- `entity-search.reindex({ entityType })` loads the first 200 records from the store; `entity-search.search({ entityType, query?, offset?, limit? })` → `{ hits, total, offset, limit }` is full-text search (`not-found` without an index); `indexRecord({ index, record })` is the step indexing uses. `indexRecord` adds `ownership` to the document when the record has it. The one-slot `searchRows` of `entity-type` (a method from `{ entityType }` to a filter tree, `null` for none) restricts `search`: [entity-row-access](../entity-row-access/README.md) fills it. A search with a filter or a sort is a [search query](../search/README.md), in the engine's language.

```json
{
    "kind": "slot-fill",
    "data": {
        "target": "construction",
        "slot": "searchIndex",
        "value": {
            "index": "construction-contracts",
            "mapping": { "set": { "project": "#.input.data.body.project" } }
        }
    }
}
```
