# entity-search

Full-text search over entities, kept up to date from [entity-events](../entity-events/README.md).

- Declares the one-slot `searchIndex` on `entity-type`: `{ searchEngine, indexName, settings?, mapping }` (`searchEngine` is an [element reference](../../core/README.md#interfaces)), where `mapping` is a method from an entity record to a document (its `id` is always the entity id).
- On start, after every [`search-engine`](../search/README.md), `entity-search` configures the index of every entity type that has one.
- The consumer `entity-search-indexer` (channel `entity-events`) inserts the mapped record on every write and removes it on delete. A record already deleted when its event arrives is skipped, and so are events of entity types this process doesn't define.
- `entity-search.reindex({ entityType })` configures the index and loads the first 200 records; `entity-search.search({ entityType, query?, filter?, sort?, offset?, limit? })` → `{ hits, total, offset, limit }` (`not-found` without an index); `configureIndex({ entityType })` and `indexRecord({ index, record })` are the steps both use.

```json
{
    "kind": "slot-fill",
    "data": {
        "target": "construction",
        "slot": "searchIndex",
        "value": {
            "searchEngine": { "instanceOf": "search-engine" },
            "indexName": "construction-contracts",
            "settings": { "searchableAttributes": ["project"] },
            "mapping": { "set": { "project": "#.input.data.body.project" } }
        }
    }
}
```
