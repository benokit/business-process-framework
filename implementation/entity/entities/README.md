# entities

Keyed, revisioned business records, extensible by traits.

## entity-type

Each entity type is an instance of `entity-type`, or of a class: a kind that extends it, with its own fills (`businessKey`, `traits`).

```json
{ "id": "order", "kind": "entity-type", "data": { "traits": { "body": { "configuration": { "schema": { "!amount": "number" } } }, "state": { "configuration": { … } } } } }
```

| Operation | Input | Output |
|---|---|---|
| `read` | `businessKey`, `revision?` (a past revision is rebuilt from history), `at?` | record, its [versioned body](#versioned-body) resolved to the version valid at `at`, the last without it; the fills of `guards` that are on `read` run on the loaded record (private `load`, which every write passes through too) as a change `{ operation: "read", before: record }` |
| `create` | `businessKey?`, `traits` (input per trait, `body` among them) | record |
| `update` | `businessKey`, `revision`, `value` | record; checks `value` against `<id>/body/schema` and writes the trait `body` |
| `delete` | `businessKey`, `revision` | the deleted record |
| `applyChange` (private) | `change`, `revision?` | record; the write path of every write operation: the guards on the operation of the change, then the [derivation](#derived-traits) of the traits (not on `delete`), then in one transaction the store write the change implies (`create` writes `after` as derived; `trait` sets the key of each of its `commands` and of the derived commands to the command's `value` on `before`, in one revision; `delete` removes `before`) through the interceptors, and the reactions |
| `derive` | `businessKey`, `revision?` | record; applies the [derivation](#derived-traits) to the stored record and writes the commands it gives as one `trait` change; the record as it is, without a new revision, when nothing is stale (a backfill after a rule changed) |
| `applyTraitOperations` (private) | `businessKey`, `revision?`, `entityOperation`, `operations` (`[{ key, operation, input }]`) | record; runs the trait operation of each item against the record as it is and writes their commands as one `trait` change (`invalid` for a key given twice, a key without a trait, or a trait without the operation). The nodes `traitOperation` and `traitOperations` call it |
| `initialTraitValues` | `traits` (input per trait) | the initial value of every trait, as `create` writes it |

Writes are optimistic, so no lock is held while a caller thinks and two users can't silently overwrite each other. Every write that changes a record names the `revision` it applies to. The `traitOperation` and `traitOperations` nodes and `delete` read the record (`before`) outside the transaction; the given `revision` must be `before.revision`, guards decide on `before`, and the store writes only if the record is still at that revision. Otherwise the write fails with `conflict`, so it never applies to a version the caller or the guards didn't see.

Record: `{ id, entityType, businessKey, revision, data, timestampUtc }`, where `data` maps each trait to its value; `body`, the business data, is the value of the trait `body`, checked against `<id>/body/schema`. Errors: `invalid` (a trait value, missing business key, undeclared trait), `not-found`, `conflict` (duplicate key, revision mismatch).

## Traits

An entity is a set of traits, and `data` maps each trait to its value. `body`, the business data, is the trait `body` (the kind `plain-body-trait`, configured by `{ schema }`): one key of `data`, owned by its writer, written through its command `put`, revisioned with the record and seen by guards, interceptors, reactions and events in the same way as `state` or any trait to come. `entity-type` fixes no trait: an entity type declares the traits it has, and an entity without business data has no `body`. Keeping one key per trait means traits never collide with business fields and add no columns, so a feature (states, versions, ownership) is added to an entity type by configuration, not by a schema change.

- A trait is an element of a kind that extends `entity-trait`, with the schema of its `configuration` and its `cardinality`: `one` (the default) or `many`.
- A use is `{ trait?, configuration }` under a key of the `traits` property of an entity type's data. The `key` is where the value lives in `data`. `trait` may be left out when the key is the id of a trait of cardinality `one` (`body`, `state`); a trait of cardinality `one` lives under its `key` (data of the trait element, the id of the trait unless given), so another trait may take over a key by declaring it, as `versioned-body` declares `body`: a contribution that names it replaces the default of the key, and two traits that don't declare the key stay a conflict; a trait of cardinality `many` is named and needs a key of its own, so an entity can hold it several times, each with its own configuration. The configuration is checked against the schema the trait declares.
- A key's effective use is the deep union of its contributions, as `fixed` unites values: the same path with a different value is a conflict, nothing replaces anything. The contributions are the `fixed.traits` of the kind chain (the specification of a class, with its defaults), the `traits` of the entity type's data (what the entity type configures, and, when it has no class, its own traits), and fills of the `traits` slot, `{ trait?, key?, configuration }` with a required `configuration`, which inject a trait or specialise a use by adding paths. A key introduced only by a fill is closed to the entity type's data: if the trait matters to the business, the kind declares it.
- `validate()` reports a conflict between contributions, a configuration that doesn't match the trait's schema, an element that isn't a trait, a key used by two traits or twice on the same target, a missing key on a `many` trait or a key on a `one` trait other than its own, a key that isn't lowercase letters and digits in segments joined by `-` (a key is used in paths, so a dot would break them), a closed key in the data, and a schema with one field both optional and required.
- On `create`, each trait's `initialize({ entityType, key, configuration, input })` returns its initial value; `input` is `traits.<id>` of the create input.
- A value changes only through an **operation of the trait**, which is private to the entity. A trait declares operations (`put`, `amend` and `remove` of `body`, `transition` of `state`), each of which takes `{ entityType, key, configuration, value, input }` (`value` is what the key holds now, `input` what the caller gave) and returns the trait command `{ command, value }` to write. The `value` is what the store writes to the key, whole; the `command` is **metadata of the change**: it is stored nowhere, and guards, interceptors, reactions and events see it in the change. The core keeps no history of commands: a feature that needs one (an audit trail, an append-only timeline) persists it from a reaction or an event consumer. The node `traitOperation: { key, operation }` runs one on the trait use under `key` (`inputMap`: `businessKey`, `revision`, `input`, and the `key` if it comes from the input) and writes the result through `applyChange`, so guards, interceptors, reactions and the `revision` check apply. The node `traitOperations: [{ key, operation, input }]` runs several and writes them as **one change**: one store write, one revision, one set of guards, reactions and events, and the operation's name as the `entityOperation` that the model's `operations` by state judge; each item's `key` and `input` are mappings over the `inputMap`, and a trait appears once. A guard or reaction finds the command of one trait in a change with `$func/change-command`. It is valid only in an operation of a kind extending `entity-type`: what an entity exposes is the entity's own decision, and a kind declares operations whose pipelines run trait operations. The kind `entity-type` exposes `update` (the operation `put` of `body`), `create`, `read` and `delete`; a kind adds the others, such as `transition` in `stateful-entity-type`. Every other key of `data` is carried over.
- Nothing applies a trait operation to an entity that doesn't expose it: a caller invokes the operation of the entity type, and only the HTTP adapters dispatch by route ([entities-http](../../adapters/entities-http/README.md), [entity-states-http](../../adapters/entity-states-http/README.md)). `$func/entity-traits` maps an entity type's keys to `{ trait, configuration }`.
- What the record shows is the trait's **view**: an optional mapping `view` in the data of the trait element, from `{ entityType, key, configuration, value, at }` to the value shown (the value itself when absent). `$func/viewed-record` applies the views of an entity type's traits to a record, `$func/viewed-change` to the `before` and `after` of a change. The records an operation returns (`read` takes `at`, which every view receives; the writes none) and the records that guards, reactions and the search index see are viewed, in the schema `viewed-entity-record`; the stored record (`entity-record`, what `entity-database` returns and a trait operation gets as `value`) is not. A view is pure and sees only its own value.

### Derived traits

A trait may declare an operation `derive`, which takes `{ entityType, key, configuration, record }` (`record` is `{ entityType, businessKey, data }` as the write leaves it) and returns a trait command for its own key, or `null` when its value stays. `applyChange` folds the derives over the traits, in the order of `$func/entity-traits`: each sees the record with the commands so far applied (the caller's, the `initialize` values on `create`, and the earlier derives'), so the output of one is visible to the next. The commands of the derives join the change's, in the same revision. A trait that offers another way to change its value sees the command already given for its key and decides what to do with it: nothing in the framework reconciles the two (the rule "a write changes a trait once" binds the caller's operations only). The kind `entity-type` exposes `derive`, which runs the fold over a stored record. [entity-ownership](../entity-ownership/README.md) is such a trait.

### Versioned body

The trait `versioned-body` (the kind `versioned-body-trait`, which takes over the key `body`: an entity type names it, `"body": { "trait": "versioned-body", … }`) adds a mode: with `versioned: { validFrom }` in its configuration (`validFrom` is a JSON pointer to the field of the body that says from when it is valid, e.g. `/startDate`) its value is a timeline of bodies, keyed by that date, the last in full and earlier ones as backward patches. A body without the date is keyed `undated`, until a date replaces it.

- `create` and `update` take the plain body: `update` corrects what is there and replaces a timeline of one version (its date may change); once amended, `update` is `conflict`. The operations `amend({ validFrom, patch })` (`patch` is a JSON Patch of the last version) and `remove({ validFrom })` of the trait add and drop the last version; an entity that is amended exposes them through operations of its own (`traitOperation`). The state model's `operations` says in which states.
- Every record an operation returns, and the records that guards, interceptors and reactions see (`before`, `after`), carry the body of the last version, so a rule is written against the body whether it is versioned or not. The raw timeline is what the store holds and what a trait operation gets as `value`. Its view is the version valid at `at`, the last without one; `read` at an `at` before the first version is `not-found`.
- The schema `<id>/body/schema` describes the whole body, every version of it.

The `state` trait is [entity-states](../entity-states/README.md).

## Slots

Fill them on `entity-type` (every entity type), on a class (all its instances) or on one entity type.

| Slot | Cardinality | Value | Runs |
|---|---|---|---|
| `traits` | many | `{ trait?, key?, configuration }` | see [Traits](#traits) |
| `businessKey` | one | method: create input (`traits.body` is the business data) → key | on `create` without `businessKey`; the most specific fill wins |
| `guards` | many | method: change → (throws to refuse); [effects](../../core/README.md#effects) `read` and `trace` only; discriminator `operation`, a fill says with `on` which operations it judges ([slots](../../core/README.md#slots)) | before the transaction |
| `interceptors` | many | middleware around the store write: `#.input` is `{ operation, input }` (the store operation and its input), `next` writes; a changed `input` is written, a changed `operation` is ignored; see [what an interceptor may change](#what-an-interceptor-may-change) | inside the transaction |
| `reactions` | many | method: change with `after` = the written record | inside the transaction, after the write; a failure rolls back; no `irreversible` effects outside `afterCommit` (the outbox defers delivery so) |

A change is one of four variants by its `operation` (`entity-change`): `create` carries `after` (`businessKey`, `data`), `trait` the `before` record and the written `commands` (`{ key, command, value }`), `delete` and `read` the `before` record; reactions see `after` as the written record. The input of a guard fill that is `on` some operations has only their fields, so a guard `on: ["read"]` that reads `commands` is reported by `validate()`. `entityOperation` (any variant) names the operation of the entity type that causes a `trait` or `delete` change (`update`, `putSegment`, `delete`, …), so that a guard can decide on what the entity exposes and not on the trait it ends in.

### Order of a write

1. `load` reads the record and runs the guards `on` `read`: whether a record is visible is decided here, once, for `read`, `derive` and every write, before anything computes on it (a hidden record is `not-found`, never an `invalid` from a trait operation).
2. The operation computes its commands (trait operations) and calls `applyChange`.
3. `applyChange` checks the `revision`, runs the guards `on` the operation of the change (`create`, `trait` or `delete`), folds the [derivation](#derived-traits), then in one transaction writes through the interceptors and runs the reactions.

A guard without `on` judges every operation, so it runs in step 1 and again in step 3.

### What an interceptor may change

Interceptors run after the [derivation](#derived-traits), so a derive sees the record the traits produced and not what an interceptor writes after it. An interceptor that changes a trait value in `input` stores a value no trait operation, guard or derive saw: the schema check of the trait is skipped, and a derived fact (ownership) that reads the value stays as it was derived from the old one. Keep interceptors to what wraps the write (measuring, tracing, rejecting, adding columns of the store); to adjust a value before it is stored, write it with a trait operation or compute it in a `derive`.

## Storage

`entity-database` (kind `entity-store`) runs the store operations `create`, `read` (at an optional `revision`), `update({ before, values })` (replaces the keys of `data` that `values` maps), and `delete({ before })`, each through its [query](../../platform/database/README.md#queries) (`create-entity`, `read-entity`, `update-entity`, `delete-entity`), which owns the contract; the operations of the kind declare the same schemas (`entity-create-input`, `entity-key`, `entity-update-input`, `entity-delete-input`, output `entity-record`), so another store implements typed operations. The query `list-entities` is not a store operation: a backfill or a reindex, run as the system, calls it to enumerate the records of a type (`entityType`, `limit`, `offset`; `{ items, total }`). `update` and `delete` apply only at `before.revision` (`conflict` otherwise); the store writes in the bound `transaction`, if any. Implementation: [entities-postgresql](../../adapters/entities-postgresql/README.md).
