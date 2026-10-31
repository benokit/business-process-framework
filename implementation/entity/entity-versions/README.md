# entity-versions

The `versionable` [trait](../entities/README.md#traits): the part of an entity that varies in time, as a timeline of segments. What holds for the whole entity (owner, retention, state) stays in its own traits and in `body`, so nothing is copied across versions. The design is in [versionable](../../../design/versionable.md).

- The trait `versionable` has cardinality `many` and is configured by `{ schema }`, the schema of a segment. One entity holds several timelines, each under its own `key`.
- `data.<key>` maps the start of a segment (`YYYY-MM-DD`, a real date) to the segment. A segment ends where the next begins, the first key is the beginning and the timeline is never empty. The last segment is stored in full, so the common read (the current terms) applies nothing, and every earlier one as the backward JSON Patch that turns the next segment into it, so history costs only what changed (the [patch](../entities/src/patch.js) the revision history uses).
- On `create`, `traits.<key>` is the first version `{ validFrom, data }`; without it, or with `data` that doesn't match the schema, `create` fails with `invalid`.

| Operation | Input | Effect |
|---|---|---|
| `putSegment` of the entity type | `businessKey`, `revision`, `key`, `validFrom`, `data` | `validFrom` greater than the last key splits the timeline, equal replaces the last segment, less is `invalid`; `data` is checked against the schema |
| `removeSegment` of the entity type | `businessKey`, `revision`, `key`, `validFrom` | removes the last segment; `validFrom` must be the last key (`conflict` otherwise), and the only segment can't be removed (`invalid`) |
| `resolve` of `entity-versions` | `entityType`, `businessKey`, `key`, `at?` | `{ validFrom, data }` of the segment valid at `at`, the last one without it; `not-found` before the first key |

The writes are operations the entity type exposes: they run the operations `put` and `remove` of the `versionable` trait on the key (`traitOperation`). The kind `versionable-entity-type` declares them; a kind with other traits declares them itself. An entity type without them has no way to write a timeline, and `invalid` is the answer to a key that holds no versionable trait.

```json
{ "id": "policy", "kind": "entity-type", "data": { "traits": { "pricing": { "trait": "versionable", "configuration": { "schema": { "!premium": "number", "currency": "string" } } } } } }
```
