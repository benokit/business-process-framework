# entities

Keyed, revisioned business records, extensible by traits.

## entity-type

Each entity type is an instance of `entity-type`, or of a class: a kind that extends it, with its own fills (`businessKey`, `traits`).

```json
{ "id": "order", "kind": "entity-type", "data": { "traits": { "body": { "configuration": { "schema": { "!amount": "number" } } }, "state": { "configuration": { … } } } } }
```

| Operation | Input | Output |
|---|---|---|
| `read` | `businessKey`, `revision?` (a past revision is rebuilt from history) | record |
| `list` | `limit?` (≤ 200), `offset?` | `{ items, total }` |
| `create` | `businessKey?`, `traits` (input per trait, `body` among them) | record |
| `writeTrait` | `businessKey`, `revision`, `key`, `command`, `value` | record |
| `delete` | `businessKey`, `revision` | the deleted record |
| `applyChange` | `change`, `revision?` | record; the write path of every write operation: guards, then in one transaction the store write the change implies (`create` writes `after`; `trait` sets `key` to `value` on `before`; `delete` removes `before`) through the interceptors, and the reactions |
| `initialTraitValues` | `traits` (input per trait) | the initial value of every trait, as `create` writes it |

Writes are optimistic, and every write that changes a record names the `revision` it applies to. `writeTrait` and `delete` read the record (`before`) outside the transaction; the given `revision` must be `before.revision`, guards decide on `before`, and the store writes only if the record is still at that revision. Otherwise the write fails with `conflict`, so it never applies to a version the caller or the guards didn't see.

Record: `{ id, entityType, businessKey, revision, data, timestampUtc }`, where `data` maps each trait to its value; `body`, the business data, is the value of the trait `body`, checked against `<id>/body/schema`. Errors: `invalid` (a trait value, missing business key, undeclared trait), `not-found`, `conflict` (duplicate key, revision mismatch).

## Traits

An entity is a set of traits, and `data` maps each trait to its value. `body`, the business data, is the trait `body` (the kind `body-trait`, configured by `{ schema }`): one key of `data`, owned by its writer, written through its command `put`, revisioned with the record and seen by guards, interceptors, reactions and events in the same way as `state` or any trait to come. `entity-type` declares it (`fixed.traits.body`), so every entity type has it, and names no trait. Keeping one key per trait means traits never collide with business fields and add no columns.

- A trait is an element of a kind that extends `entity-trait`, with the schema of its `configuration` and its `cardinality`: `one` (the default) or `many`.
- A use is `{ trait?, configuration }` under a key of the `traits` property of an entity type's data. The `key` is where the value lives in `data`. `trait` may be left out when the key is the id of a trait of cardinality `one` (`body`, `state`); a trait of cardinality `many` is named and needs a key of its own, so an entity can hold it several times, each with its own configuration. The configuration is checked against the schema the trait declares.
- A key's effective use is the deep union of its contributions, as `fixed` unites values: the same path with a different value is a conflict, nothing replaces anything. The contributions are the `fixed.traits` of the kind chain (the specification of a class, with its defaults), the `traits` of the entity type's data (what the entity type configures, and, when it has no class, its own traits), and fills of the `traits` slot, `{ trait?, key?, configuration }` with a required `configuration`, which inject a trait or specialise a use by adding paths. A key introduced only by a fill is closed to the entity type's data: if the trait matters to the business, the kind declares it.
- `validate()` reports a conflict between contributions, a configuration that doesn't match the trait's schema, an element that isn't a trait, a key used by two traits or twice on the same target, a missing key on a `many` trait or a key on a `one` trait, a key that isn't lowercase letters and digits in segments joined by `-` (a key is used in paths, so a dot would break them), a closed key in the data, and a schema with one field both optional and required.
- On `create`, each trait's `initialize({ entityType, key, configuration, input })` returns its initial value; `input` is `traits.<id>` of the create input.
- A value changes only through `writeTrait`, which the trait's own operations call with its `key` and a `command`; every other key is carried over. `entity-bodies.put({ entityType, businessKey, revision, value })` is the command of `body`: it checks `value` against `<entityType>/body/schema` and writes the key `body`.
- Trait commands are operations of the trait's package, exposed by its own endpoints. `$func/entity-traits` maps an entity type's keys to `{ trait, configuration }`.

The `state` trait is [entity-states](../entity-states/README.md).

## Slots

Fill them on `entity-type` (every entity type), on a class (all its instances) or on one entity type.

| Slot | Cardinality | Value | Runs |
|---|---|---|---|
| `traits` | many | `{ trait?, key?, configuration }` | see [Traits](#traits) |
| `businessKey` | one | method: create input (`traits.body` is the business data) → key | on `create` without `businessKey`; the most specific fill wins |
| `guards` | many | method: change → (throws to refuse); [effects](../../core/README.md#effects) `read` and `trace` only | before the transaction |
| `interceptors` | many | middleware around the store write: `#.input` is `{ operation, input }` (the store operation and its input), `next` writes; a changed `input` is written, a changed `operation` is ignored | inside the transaction |
| `reactions` | many | method: change with `after` = the written record | inside the transaction, after the write; a failure rolls back; no `irreversible` effects outside `afterCommit` (the outbox defers delivery so) |

A change is `{ operation: create | trait | delete, key?, command?, value?, before?, after? }`: `create` carries `after` (`businessKey`, `data`), `trait` the written `key`, its `value` and the `command`.

## Storage

`entity-database` (kind `entity-store`) runs the store operations `create`, `read` (at an optional `revision`), `update({ before, key, value })` (replaces one key of `data`), `delete({ before })` and `list`, each through its [query](../database/README.md#queries) (`create-entity`, `read-entity`, `update-entity`, `delete-entity`, `list-entities`), which owns the contract. `update` and `delete` apply only at `before.revision` (`conflict` otherwise); the store writes in the bound `transaction`, if any. Implementation: [entities-postgresql](../entities-postgresql/README.md).
