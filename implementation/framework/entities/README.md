# entities

Keyed, revisioned business records, extensible by traits.

## entity-type

Each entity type is an instance of `entity-type`, or of a class: a kind that extends it, whose `defaults` its instances inherit.

```json
{ "id": "order", "kind": "entity-type", "data": { "bodySchema": { "!amount": "number" } } }
{ "kind": "slot-fill", "data": { "target": "order", "slot": "traits", "value": { "trait": "state", "configuration": { … } } } }
```

| Operation | Input | Output |
|---|---|---|
| `read` | `businessKey`, `revision?` (a past revision is rebuilt from history) | record |
| `list` | `limit?` (≤ 200), `offset?` | `{ items, total }` |
| `create` | `businessKey?`, `body`, `traits?` (input per trait) | record |
| `update` | `businessKey`, `revision`, `body` | record |
| `writeTrait` | `businessKey`, `revision?`, `trait`, `command`, `value` | record |
| `delete` | `businessKey`, `revision?` | the deleted record |
| `applyChange` | `change`, `storeOperation`, `storeInput` (the store input without `entityType`) | record; the write path of every write operation: guards, then in one transaction the store write through the interceptors and the reactions |
| `initialTraitValues` | `traits` (input per trait) | the initial value of every trait, as `create` writes it |

Record: `{ id, entityType, businessKey, revision, data, timestampUtc }`, where `data` maps each trait to its value: `body` is the business data, checked against `<id>/bodySchema` (added on load). Errors: `invalid` (body, missing business key, undeclared trait), `not-found`, `conflict` (duplicate key, revision mismatch).

## Traits

An entity is a set of traits, and `data` maps each trait to its value. `body`, the business data, is a trait like any other: it is one key of `data`, owned by its writer, written through a command (`update`), revisioned with the record and seen by guards, interceptors, reactions and events in the same way as `state` or any trait to come. It is special only in structure, because every entity has it: its schema is part of the entity type (`bodySchema`), and `create` and `update` are its operations on `entity-type`. Keeping one key per trait means traits never collide with business fields and add no columns.

- A trait is an element of a kind that extends `entity-trait`, with the schema of its `configuration`; its id is its key in `data`.
- An entity type uses a trait through a fill of the `traits` slot, `{ trait, configuration }`, on the type, its class or `entity-type`. Per trait, the most specific fill wins, so a type can replace the configuration of its class. `validate()` reports a use of an element that isn't a trait, a configuration that doesn't match the trait's schema, and a trait used twice on the same target.
- On `create`, each trait's `initialize({ entityType, configuration, input })` returns its initial value; `input` is `traits.<id>` of the create input.
- `update` is the command of `body`; it writes `body` only. Any other trait's value changes only through `writeTrait`, which the trait's own operations call with a `command`; every other key is carried over.
- Trait commands are operations of the trait's package, exposed by its own endpoints. `$func/entity-traits` maps an entity type's traits to their configuration.

The `state` trait is [entity-states](../entity-states/README.md).

## Slots

Fill them on `entity-type` (every entity type), on a class (all its instances) or on one entity type.

| Slot | Cardinality | Value | Runs |
|---|---|---|---|
| `traits` | many | `{ trait, configuration }` | see [Traits](#traits) |
| `businessKey` | one | method: create input → key | on `create` without `businessKey`; the most specific fill wins |
| `guards` | many | method: change → (throws to refuse) | before the transaction |
| `interceptors` | many | middleware around the store write: `#.input` is the store input, `next` writes | inside the transaction |
| `reactions` | many | method: change with `after` = the written record | inside the transaction, after the write; a failure rolls back |

A change is `{ operation: create | update | trait | delete, trait?, command?, value?, before?, after? }`: `create` carries `after` (`businessKey`, `data`), `update` and `trait` the written `trait` and its `value` (`update` writes `body`), `trait` also the `command`.

## Storage

`entity-database` (kind `entity-store`) writes PostgreSQL tables `entities` (`data` as one JSONB column) and `entity_history` (reverse JSON patches of `data` per revision), created as [models](../database/README.md#models). An update replaces one trait. It writes in the bound `transaction`, or in its own.
