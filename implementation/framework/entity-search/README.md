# entity-search

Full-text search for entities via pluggable `service/search-engine` implementations (e.g. `meilisearch`).

## Elements

| Element | Kind | Description |
| --- | --- | --- |
| `search-engine-interface` | data | Method interface shared by all `service/search-engine` implementations |
| `entity-search-index-data` | schema | Shape of `entity-search-index/{entityType}` element data |
| `index-entity-document` | executable | Shared logic: run mapping, enforce entity UUID as `id`, insert document |
| `entity-search-consumer` | message-consumer | Subscribes to `entity-events`; inserts or removes index documents on create/update/delete |
| `entity-search-indexer` | service | Internal handler invoked by the consumer |
| `entity-index-management` | service | `reindex(entityType)` — configures the index and bulk-loads existing entities |
| `entity-search` | service | `search({ entityIndex, query })` — delegates to the configured search engine |
| `entity-search-controller` | service | HTTP adapter for `entity-search` |
| `entity-search-endpoint` | http-endpoint | `POST /entity-search/:entityIndex` |

## HTTP

### Search

```
POST /entity-search/:entityIndex
Content-Type: application/json

{ "q": "...", "filter": "...", "sort": ["field:asc"], "limit": 20 }
```

`:entityIndex` is the element id of an `entity-search-index/{entityType}` element. The body is passed directly to the search engine, so any parameters supported by the engine (Meilisearch: `q`, `filter`, `sort`, `limit`, `offset`, `facets`, etc.) can be used.

## Defining an index

Add an `entity-search-index/{entityType}` element for each entity type you want indexed:

```json
{
    "kind": "entity-search-index/product",
    "id": "product-search-index",
    "data": {
        "searchEngine": "meilisearch",
        "indexName": "products",
        "indexConfiguration": {
            "settings": { "searchableAttributes": ["name", "description"] }
        },
        "mapping": [
            {
                "return": {
                    "id": "#.input.id",
                    "name": "#.input.data.name",
                    "description": "#.input.data.description"
                }
            }
        ]
    }
}
```

The `mapping` pipeline receives an `entity-record` as `#.input`. The `id` field in the returned document is always overridden with the entity UUID — it does not need to be set explicitly, but `#.input.id` is the conventional value to use if included.

## Reindexing

Call `entity-index-management.reindex` to configure the search index and bulk-load all existing entities of a given type:

```json
{ "entityType": "product" }
```

This is typically called once after deploying a new index definition, or to recover from index drift.

## Automatic indexation

`entity-search-consumer` listens on the `entity-events` channel. On every entity create, update, transition, or amend it maps the current entity record and upserts the document. On delete it removes the document by entity UUID.

No additional configuration is needed — the consumer activates automatically when consumers are started and at least one `entity-search-index/{entityType}` element is loaded.
