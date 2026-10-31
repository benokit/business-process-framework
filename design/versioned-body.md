# Versioned body

Replaces the `versionable` trait and its package `entity-versions` (R6.3), which kept the part of an entity that varies in time apart from the `body`. The split cost a mapping between the document a user works with and the two traits, two writes for one change (F53, [multi-trait-writes](multi-trait-writes.md)), a list of the keys that vary that could drift from the schema, and every consumer reading two places. The entity's data is one document, and its history is a property of that document.

## 1. The model

The trait `body` has two modes. In the default mode its value is the body. With `versioned` in its configuration its value is a **timeline of bodies**:

```json
"body": { "configuration": { "schema": { "…": "the whole body" }, "versioned": { "validFrom": "/startDate" } } }
```

- `schema` describes the whole body, every version of it. Nothing about the body is split by whether it varies.
- `versioned.validFrom` is a JSON pointer into the body: the field that says from when this version is valid. The entity declares it; the framework forces no name.
- A version is exactly the body that was written. The field stays in it (the key of a version is derived from the field when it is written, never the other way round), so reading a version needs no reassembly.

## 2. Timeline

`data.body` maps the start of a version, `YYYY-MM-DD`, to the version.

- **Order** is the order of the sorted keys; the storage order of an object is never relied on. A version ends where the next begins; the last is open-ended; the timeline is never empty.
- **The last version is stored in full, every earlier one as the backward JSON Patch** that turns the next version into it (the patch the revision history uses), so history costs what changed and the common read applies nothing.
- **A body without a date** (the field is absent or null) is keyed by the marker `undated`, which sorts before every date and is **replaced** by the first real date given, by `put` or by `amend`. It lets a draft exist before anybody knows the start. The marker is never a version someone amended from.
- **No clock.** The last version is the current one; nothing in the framework knows what time it is. A caller that has a notion of time passes the date.

## 3. Operations of the trait

| Operation | Input | Effect |
|---|---|---|
| `initialize` | the body | checks it against the schema; the first version, keyed by its date or `undated` |
| `put` | `value`, the body | the correction of what is there (the entity operation `update`): replaces the timeline by one version of the body, whose date may change. A timeline of several versions is `conflict`: it changes by `amend` |
| `amend` | `validFrom`, `patch` | a new last version: the last one transformed by `patch` (a JSON Patch, RFC 6902: `add`, `remove`, `replace`, `move`, `copy`, `test`), with the field at the pointer set to `validFrom`, checked against the schema. A patch that doesn't apply is `invalid`. `validFrom` must not be before the last key (`conflict`). At the last key it replaces that version (the earlier versions keep their content); when the last is `undated` it is replaced |
| `remove` | `validFrom` | removes the last version; `validFrom` must be the last key (`conflict`), the only version can't be removed (`invalid`) |

Only `put` is on the generic entity operation `update`, and which states allow it is the model's `operations` (a contract: draft). `amend` and `remove` are not exposed by `entity-type`; an entity that is amended declares operations that run them (`traitOperation`), as `versioned-entity-type` of [entity-amendments](../implementation/entity/entity-amendments/README.md) does. In a body that is not versioned, `amend` and `remove` are `invalid`.

## 4. What everyone else sees

Every record that leaves an operation, and everything a guard, an interceptor or a reaction receives, has its versioned body **resolved to the last version**. `data.body` is the plain body there, so a rule, a guard or a search document is written against the body, whether it is versioned or not, and an ownership rule derives from the body the write leaves. The raw timeline is what the store holds and what the trait operations see (`value`).

- `read` takes `at`: the version valid at that date (`not-found` before the first), the last one without it. With `revision` the two compose: `revision` is transaction time, `at` is valid time.
- The last version is the only basis of an amendment: a process that amends reads the last, never an earlier one.
- A rule must not depend on a version other than the last: the derived values (ownership) are stored when a write happens, and nothing writes when a date passes.

## 5. Processes

The package [entity-amendments](../implementation/entity/entity-amendments/README.md) is the process below as a framework piece; an application with a different process writes its own on `amend` and `remove`.

A process that changes a versioned entity is a separate entity with its own states (a contract and its amendments). Its effect is `amend` with the effective date and a patch; annulling it is `remove` of that date. An amendment at the date of the last version corrects that version, and a later `remove` drops it whole: a process that must be able to restore what it replaced amends from a later date. The framework's part of an amendment's state is the dimension `versionStatus` (`pending`, `applied`, `discarded`); the process around it, with its own states and names, is the application's. The trait owns the order: a later amendment makes the last key another one and the `remove` fails with `conflict`, so annulments run in the reverse order of activations without the process tracking its siblings. What an amendment may change is the schema of the amendment type's own data, not a split of the body. Whether an amendment is possible now is the entity's model: the state `operations` list `applyAmendment` for the states it is possible in, and no operation of the framework asks a separate question.

## 6. Events, validation

- An entity event carries `versions`, the map from each versioned key to the start of its last version after the write (`undated` for a body without a date), beside `commands`: a consumer learns which version the write produced, and for a `remove` the version now current.
- `validate()` reports a pointer that is no field of the body schema and a field that is not a date, so a typo can't turn every body into `undated` silently.
- The stored record (what `entity-database` returns, the timeline) and the record an operation returns (the body of the last version) share the schema `entity-record`. Code outside `entity-type` that reads the store directly gets the timeline: it should read `data.state`, the ledger and the like, which are not versioned, or go through `read`.

## 7. Decided, and left out

- **No second timeline under another key.** The `versionable` trait could hold several; nothing needs it. A trait with a timeline of its own can be added when a use case shows up.
- **The marker is not a date.** Where a real date is needed, the entity requires the field in its schema.
- **Merge patch** costs less to apply than JSON Patch but can't carry `null` or an array change; history needs those. Both use one small patch module, so the format can change in one place once a benchmark on a realistic version shows a gain.
- **Foundation, not features.** What the framework guarantees is robust ordering (the revision check), cheap history, a plain body for every consumer and the two time axes. A listing of the versions, queries as of a date in search and relations, and conveniences for a retroactive correction are for an implementation to add on top; the last is deliberately not offered out of the box, because it rewrites history in the middle and a correction there is a decision of the process (remove the versions after it, amend, apply them again).
- **The current date is not the framework's** ([P23](postulates.md), F54): `read` without `at` is the last version.
