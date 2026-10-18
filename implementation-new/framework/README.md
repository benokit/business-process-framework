# Framework

| Package | Description |
| --- | --- |
| [database](database/README.md) | The abstract `database` kind and its `models` slot |
| [messaging](messaging/README.md) | Brokers, channels, consumers; `publish` keyword |
| [entities](entities/README.md) | Entity types, their slots and the entity store |
| [entity-events](entity-events/README.md) | An event per entity write, through the outbox |
| [entity-relations](entity-relations/README.md) | The `relations` slot and relation maintenance |
| [entities-http](entities-http/README.md) | REST endpoints for entities, through a checked gateway |
| [search](search/README.md) | The abstract `search-engine` kind |
| [entity-search](entity-search/README.md) | The `searchIndex` slot, indexing from entity events, search |
| [entity-search-http](entity-search-http/README.md) | `POST /entity-search/:entityType` |
