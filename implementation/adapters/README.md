# Adapters

Packages that bind a technology (PostgreSQL, NATS, Meilisearch, HTTP) to an abstraction of `platform` or `entity`. They depend on what they implement; nothing depends on them but tests and the application.

| Package | Description |
| --- | --- |
| [entities-http](entities-http/README.md) | REST endpoints for entities, through a checked gateway |
| [entities-postgresql](entities-postgresql/README.md) | The entity store's queries in PostgreSQL, with revision history |
| [entity-relations-postgresql](entity-relations-postgresql/README.md) | Relation queries in PostgreSQL |
| [entity-search-http](entity-search-http/README.md) | `POST /entity-search/:entityType` |
| [entity-states-http](entity-states-http/README.md) | `POST /entities/:entityType/:businessKey/transitions/:transition` |
| [meilisearch](meilisearch/README.md) | Meilisearch search engine |
| [messaging-nats](messaging-nats/README.md) | NATS JetStream broker |
| [postgresql](postgresql/README.md) | Connection pool owned by the `default-postgresql-database` element's lifecycle; `execute` |
| [sequence-generator-postgresql](sequence-generator-postgresql/README.md) | Sequences as PostgreSQL sequences |
| [transactional-outbox-postgresql](transactional-outbox-postgresql/README.md) | Outbox queries in PostgreSQL |
