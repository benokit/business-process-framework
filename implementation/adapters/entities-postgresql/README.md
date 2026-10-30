# entities-postgresql

Implements the entity store's queries of [entities](../../entity/entities/README.md) for `postgresql-database`: table `entities` (`data` as one JSONB column) and `entity_history` (the reverse JSON patch of `data` for each revision, so `read-entity` rewinds to a past revision), created as [models](../../platform/database/README.md#migrations). `update-entity` and `delete-entity` are each one statement that applies only at `before.revision`; deleting removes the history too.
