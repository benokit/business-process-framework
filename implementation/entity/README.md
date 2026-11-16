# Entity

The entity store and the traits and features built on it: states, validations, versions, amendments, ownership, row access, events, relations, search.

| Package | Description |
| --- | --- |
| [entities](entities/README.md) | Entity types, traits, their slots and the entity store |
| [entity-amendments](entity-amendments/README.md) | Amendments of an entity with a versioned body as entities of their own: propose, apply, revert, discard, with a ledger of one open amendment, as one trait |
| [entity-events](entity-events/README.md) | An event per entity write, through the outbox |
| [entity-ownership](entity-ownership/README.md) | The `ownership` trait: access-relevant facts of an entity, derived from its data at every write by a rule |
| [entity-tasks](entity-tasks/README.md) | The `task` trait: a work item a process asks the user space for, closed by the process on a fact, never by a user |
| [entity-processes](entity-processes/README.md) | Durable processes: the `process-definition` kind, a graph of named steps with waits (in progress, [design](../../design/durable-processes.md)) |
| [entity-relations](entity-relations/README.md) | The `relations` slot and relation maintenance |
| [entity-row-access](entity-row-access/README.md) | Access permissions: access profiles say which rows a user reaches; guards, reactions and a search filter apply them |
| [entity-search](entity-search/README.md) | The `searchIndex` slot, indexing from entity events, search |
| [entity-states](entity-states/README.md) | The `state` trait: states models and transitions |
| [entity-validations](entity-validations/README.md) | The `validation` trait: the errors of business validations, applied at every change, and the delegate `onValidation` that tells the configurator |
