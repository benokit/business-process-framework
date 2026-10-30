# entity-versions

The `versionable` [trait](../entities/README.md#traits): the part of an entity that varies in time, as a timeline of segments. What holds for the whole entity (owner, retention, state) stays in its own traits and in `body`, so nothing is copied across versions. The design is in [versionable](../../../design/versionable.md).

- The trait `versionable` has cardinality `many` and is configured by `{ schema }`, the schema of a segment. One entity holds several timelines, each under its own `key`.
- `data.<key>` maps the start of a segment (`YYYY-MM-DD`, a real date) to the segment. A segment ends where the next begins, the first key is the beginning and the timeline is never empty. The last segment is stored in full, every earlier one as the backward JSON Patch that turns the next segment into it (the [patch](../entities/src/patch.js) the revision history uses).
- On `create`, `traits.<key>` is the first version `{ validFrom, data }`; without it, or with `data` that doesn't match the schema, `create` fails with `invalid`.

| Operation of `entity-versions` | Input | Effect |
|---|---|---|
| `put` | `entityType`, `businessKey`, `revision`, `key`, `validFrom`, `data` | `validFrom` greater than the last key splits the timeline, equal replaces the last segment, less is `invalid`; `data` is checked against the schema |
| `remove` | `entityType`, `businessKey`, `revision`, `key`, `validFrom` | removes the last segment; `validFrom` must be the last key (`conflict` otherwise), and the only segment can't be removed (`invalid`) |
| `resolve` | `entityType`, `businessKey`, `key`, `at?` | `{ validFrom, data }` of the segment valid at `at`, the last one without it; `not-found` before the first key |

Both writes run through `writeTrait` with the command `put` or `remove`, so the `revision` check, guards, reactions and events apply. A write touches the last two segments only, and reading the last segment applies no patch. `put` with an existing last key is a correction nothing undoes; a process that must be annullable splits and removes the key it created.

```json
{ "id": "policy", "kind": "entity-type", "data": { "traits": { "pricing": { "trait": "versionable", "configuration": { "schema": { "!premium": "number", "currency": "string" } } } } } }
```
