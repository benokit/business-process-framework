# Infrastructure Services

| Package | Description |
| --- | --- |
| [`postgresql`](postgresql/README.md) | PostgreSQL connection pool and `db-driver-postgresql` service |
| [`sequence-generator`](sequence-generator/README.md) | Monotonically increasing integer counters per named sequence |
| [`http-server`](http-server/README.md) | Express HTTP server; routes from `http-endpoint` data elements |
| [`transaction`](transaction/README.md) | PostgreSQL transaction lifecycle; `inTransaction` pipeline keyword |
| [`messaging-nats`](messaging-nats/README.md) | NATS JetStream broker implementation |
| [`transactional-outbox`](transactional-outbox/README.md) | At-least-once delivery via PostgreSQL-backed outbox |
| [`logging`](logging/README.md) | Structured JSON logging; `log` pipeline keyword |
| [`cache`](cache/README.md) | In-memory L1 cache; `withCache` pipeline keyword |
| [`meilisearch`](meilisearch/README.md) | Meilisearch implementation of the `service/search-engine` interface |
