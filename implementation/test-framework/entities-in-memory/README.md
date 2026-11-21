# entities-in-memory

A fake of the [entity store](../../entity/entities/README.md) that keeps its records in memory, for [scenarios](../scenarios/README.md): the entity types, traits, guards and reactions run for real, only the storage is replaced, so a scenario needs no database and can write, update and read in several steps (a stub that answers from a mapping has no memory).

`entityStore()` returns a fresh store as stubs, `{ 'entity-database': { create, read, update, delete }, 'list-entities': { run } }`, answering like [entities-postgresql](../../adapters/entities-postgresql/README.md): `duplicate`, `not-found` (also for a revision the entity never had) and `stale` (an update or delete of a record that is no longer at the revision of `before`), the history of every revision for `read` at a revision, `values` merged over `before.data`, and `list` newest first. A conformance test runs one script of operations against both stores and expects the same answers.

Element: `in-memory-entity-store-stub-set`, a `stub-set` whose `fakes` is `entityStore`, a new store for every scenario.

```json
{ "stubSets": ["in-memory-entity-store-stub-set"], "packages": ["entities", "entities-in-memory"] }
```

It also stubs `transaction`: `begin` takes a snapshot of the store, `rollback` restores it and `commit` drops it, so a write that a failing reaction rolls back is gone. Savepoints are not stubbed, and the conformance test doesn't cover transactions.
