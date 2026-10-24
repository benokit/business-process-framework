# Infrastructure

| Package | Description |
| --- | --- |
| [logging](logging/README.md) | Structured JSON logging; `log` keyword |
| [cache](cache/README.md) | In-memory cache; `withCache` wrapper |
| [postgresql](postgresql/README.md) | Connection pool owned by the `default-postgresql-database` element's lifecycle; `execute` |
| [sequence-generator](sequence-generator/README.md) | Named sequences; `nextFromSequence` keyword |
| [sequence-generator-postgresql](sequence-generator-postgresql/README.md) | Sequences as PostgreSQL sequences |
| [transaction](transaction/README.md) | Transactions as scoped context; `inTransaction` wrapper |
| [http-server](http-server/README.md) | Express server; `http-endpoint` kind with request middleware |
| [messaging-nats](messaging-nats/README.md) | NATS JetStream broker |
| [transactional-outbox](transactional-outbox/README.md) | At-least-once delivery committed with the business transaction |
| [transactional-outbox-postgresql](transactional-outbox-postgresql/README.md) | Outbox queries in PostgreSQL |
| [meilisearch](meilisearch/README.md) | Meilisearch search engine |
