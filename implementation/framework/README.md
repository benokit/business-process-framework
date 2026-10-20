# Framework

| Package | Description |
| --- | --- |
| [database](database/README.md) | The abstract `database` kind and its `models` slot |
| [messaging](messaging/README.md) | Brokers, channels, consumers; `publish` keyword |
| [entities](entities/README.md) | Entity types, traits, their slots and the entity store |
| [entity-states](entity-states/README.md) | The `state` trait: states models and transitions |
| [entity-events](entity-events/README.md) | An event per entity write, through the outbox |
| [entity-relations](entity-relations/README.md) | The `relations` slot and relation maintenance |
| [entities-http](entities-http/README.md) | REST endpoints for entities, through a checked gateway |
| [entity-states-http](entity-states-http/README.md) | `POST /entities/:entityType/:businessKey/transitions/:transition` |
| [search](search/README.md) | The abstract `search-engine` kind |
| [entity-search](entity-search/README.md) | The `searchIndex` slot, indexing from entity events, search |
| [entity-search-http](entity-search-http/README.md) | `POST /entity-search/:entityType` |
| [security](security/README.md) | The principal as context: `user-scope`, `asSystem` |
| [users](users/README.md) | The `user` entity type: users of an external identity provider |
| [oauth](oauth/README.md) | OAuth 2.0 bearer tokens: the `authenticated` request middleware |
