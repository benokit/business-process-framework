# Shared Packages

Cross-cutting packages used by infrastructure, security, and other layers.

| Package | Description |
| --- | --- |
| [`definitions`](definitions/README.md) | Schema elements defining the shapes of core framework building blocks |
| [`messaging`](messaging/README.md) | Broker-agnostic messaging facade; `publish` pipeline keyword |
| [`middleware`](middleware/README.md) | Generic middleware runner; chains middlewares before a final action |
| [`database`](database/README.md) | Creates database objects from declarative `db-model` elements |
| [`entities`](entities/README.md) | Generic entity lifecycle management backed by a persistent document store |
| [`security/users`](security/users/README.md) | User entity type with username as business key; `set-password` and `validate-password` component methods |
| [`security/authorization-basic`](security/authorization-basic/README.md) | JWT login endpoint (`POST /login`) and Bearer token HTTP middleware |
| [`entity-search`](entity-search/README.md) | Full-text search for entities; event consumer, reindex, and search services |
