# transactional-outbox-postgresql

Implements the queries of [transactional-outbox](../../platform/transactional-outbox/README.md) for `postgresql-database`: table `transactional_outbox`, with partial indexes on pending messages and group heads, created as [models](../../platform/database/README.md#migrations). `outbox-insert` writes in the bound transaction; every other query is `irreversible`, since the processor runs them on their own.
