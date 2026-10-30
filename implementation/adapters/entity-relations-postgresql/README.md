# entity-relations-postgresql

Implements the queries of [entity-relations](../../entity/entity-relations/README.md) for `postgresql-database`: table `entity_relations`, whose rows are deleted with their entities (`ON DELETE CASCADE`). `set-entity-relations` checks the targets, then removes and adds relations in one statement.
