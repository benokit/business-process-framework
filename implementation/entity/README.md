# Entity

The entity store and the traits and features built on it: states, versions, ownership, row access, events, relations, search.

| Package | Description |
| --- | --- |
| [entities](entities/README.md) | Entity types, traits, their slots and the entity store |
| [entity-events](entity-events/README.md) | An event per entity write, through the outbox |
| [entity-ownership](entity-ownership/README.md) | The `ownership` trait: access-relevant facts of an entity, derived from its data at every write by a rule |
| [entity-relations](entity-relations/README.md) | The `relations` slot and relation maintenance |
| [entity-row-access](entity-row-access/README.md) | Access permissions: access profiles say which rows a user reaches; guards, reactions and a search filter apply them |
| [entity-search](entity-search/README.md) | The `searchIndex` slot, indexing from entity events, search |
| [entity-states](entity-states/README.md) | The `state` trait: states models and transitions |
| [entity-versions](entity-versions/README.md) | The `versionable` trait: a timeline of segments of an entity, with `put`, `remove` and `resolve` |
