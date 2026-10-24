# Framework

| Package | Description |
| --- | --- |
| [integration](integration/README.md) | Contracts owned by a consumer, implemented per provider kind |
| [database](database/README.md) | The abstract `database` kind, its `models` slot, queries and the `statement` keyword |
| [messaging](messaging/README.md) | Brokers, channels, consumers; `publish` keyword |
| [entities](entities/README.md) | Entity types, traits, their slots and the entity store |
| [entities-postgresql](entities-postgresql/README.md) | The entity store's queries in PostgreSQL, with revision history |
| [entity-states](entity-states/README.md) | The `state` trait: states models and transitions |
| [entity-events](entity-events/README.md) | An event per entity write, through the outbox |
| [entity-relations](entity-relations/README.md) | The `relations` slot and relation maintenance |
| [entity-relations-postgresql](entity-relations-postgresql/README.md) | Relation queries in PostgreSQL |
| [entities-http](entities-http/README.md) | REST endpoints for entities, through a checked gateway |
| [entity-states-http](entity-states-http/README.md) | `POST /entities/:entityType/:businessKey/transitions/:transition` |
| [search](search/README.md) | The abstract `search-engine` kind, search indexes and search queries |
| [entity-search](entity-search/README.md) | The `searchIndex` slot, indexing from entity events, search |
| [entity-search-http](entity-search-http/README.md) | `POST /entity-search/:entityType` |
| [security](security/README.md) | The principal as context: `principal-execution-node-wrapper`, `asSystem` |
| [users](users/README.md) | The `user` entity type: users of an external identity provider |
| [oauth](oauth/README.md) | OAuth 2.0 bearer tokens: the `authenticated` request middleware |
