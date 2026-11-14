# entity-relations-postgresql

Implements the queries of [entity-relations](../../entity/entity-relations/README.md) for `postgresql-database`: table `entity_relations`, whose rows are deleted with their source (`ON DELETE CASCADE`) and keep their target from being deleted (`ON DELETE RESTRICT`, set by the migration `entity-relations-restrict-target`, which the table's creation precedes). `set-entity-relations` checks the targets, then removes and adds relations in one statement.
