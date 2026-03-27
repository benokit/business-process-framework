# Infrastructure Services

| Package | Description |
| --- | --- |
| [`entity-database`](entity-database/README.md) | Generic document store: CRUD, revision history, business versioning |
| [`sequence-generator`](sequence-generator/README.md) | Monotonically increasing integer counters per named sequence |
| [`http-server`](http-server/README.md) | Express HTTP server; routes from `endpoint` data elements |
| [`postgres-client`](postgres-client/README.md) | Shared PostgreSQL connection pool |
| [`transaction`](transaction/README.md) | PostgreSQL transaction lifecycle; `inTransaction` pipeline keyword |
| [`messaging`](messaging/README.md) | Broker-agnostic messaging facade; `publish` pipeline keyword |
| [`messaging-nats`](messaging-nats/README.md) | NATS JetStream broker implementation |
| [`transactional-outbox`](transactional-outbox/README.md) | At-least-once delivery via PostgreSQL-backed outbox |
| [`logging`](logging/README.md) | Structured JSON logging; `log` pipeline keyword |
