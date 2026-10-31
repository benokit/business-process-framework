# Versionable entities

Status: **implemented** in [entity-versions](../implementation/entity/entity-versions/README.md) and [entities](../implementation/entity/entities/README.md) (R6.5, R6.3), and demonstrated by the demo's contracts and amendments. The work is R6.3 and R6.5 in [refactoring-plan.md](refactoring-plan.md). Entities and traits are in [entities](../implementation/entity/entities/README.md).

## 1. The model

A versionable entity is **one object with a time-dependent part**. It is not a set of copies. What holds for the whole object (owner, retention, entity state, deletion) stays in the traits it is in today, written once and owned by one writer. Only the part that varies in time lives in a timeline, so no fact is ever repeated across versions and no version competes with another to be the correct one.

| | Is | Lives in | Written by |
|---|---|---|---|
| time-invariant | owner, retention, state, the invariant `body` | its traits | their own commands |
| time-varying | a segment per validity period | a `versionable` trait | `put`, `remove` |

`revision` and validity are different axes: `revision` is transaction time (what the system knew when, rebuilt from history), a segment's start is valid time (what is true when). `read` at a `revision` and `resolve` at a date compose; neither knows the other.

## 2. Timeline

The value of the trait is a map from the start of a segment to the segment:

```json
"pricing": {
  "2025-01-01": [ { "op": "replace", "path": "/premium", "value": 100 } ],
  "2025-07-01": [ { "op": "replace", "path": "/premium", "value": 110 } ],
  "2026-03-01": { "premium": 120, "currency": "EUR" }
}
```

- **Keys** are dates, `YYYY-MM-DD`, a real calendar date. Order is the order of the sorted keys; the storage order of an object is never relied on.
- **A segment ends where the next begins**; the last is open-ended. Overlaps and gaps cannot be written. There is no `validTo`.
- **The first key is the beginning.** No segment exists before it, `resolve` before it is `not-found`. Its value may be `{}`. The timeline is never empty.
- **The last segment is stored in full, every earlier one as a delta**: a JSON Patch (RFC 6902) that turns the next segment into this one, the same backward patch the history keeps. The current read applies no patch, an older one applies one patch per segment passed. A delta shows what this segment had where the next differs, not the change someone made; a forward diff is computed on demand.
- **No clock.** All segments are active; the current one is the last. Nothing in the framework knows what time it is. A caller that has a notion of time passes the date.

## 3. Commands

| Command | Input | Effect |
|---|---|---|
| `put` | `validFrom`, `data` (the full segment) | `validFrom` greater than the last key: split, the last segment becomes a delta and the new one is the full last. Equal: replace the last segment. Less: `invalid` |
| `remove` | `validFrom` | `validFrom` must be the last key (`conflict` otherwise); the previous segment becomes the full last one. The only segment can't be removed (`invalid`) |
| `resolve` | `at?` | the segment valid at `at`, the last one without it; `not-found` before the first key |

A replace is a split with an infinitely small left interval, so `put` is one rule: the key is not less than the last. Either way every earlier segment keeps its content; only the stored delta of the previous one is recomputed, against the new last segment. Segments are validated against the configured `schema` when written, never when read.

A write touches at most the last two segments: the timeline is append-only at its end. `put` and `remove` are operations of the trait: they run through the node `traitOperation`, so the optimistic `revision`, guards, interceptors, reactions and events apply as for any trait.

## 4. Processes that change a versionable entity

A process that changes the entity is a separate entity with its own states (a contract and its amendments). Its effect is a command on the timeline: activating an amendment is a `put` with a new, greater key, and it keeps that key; annulling it is a `remove` of that key. The trait owns the order: when a later amendment is still active, the last key is a different one and the `remove` fails with `conflict`, so annulments happen in the reverse order of activations without the process tracking its siblings. A `put` at the same key replaces what is there, and nothing restores it apart from reading an earlier `revision`: it is a correction by the owner of the data, a process that must be annullable splits.

## 5. Trait assignments with a key

A trait is addressed by its key in `data`, and today the key is the trait's id. One entity needs several timelines when fields change on independent schedules, each with its own schema, so the key becomes a parameter of the assignment:

```json
{ "trait": "versionable", "key": "pricing", "configuration": { "schema": { "!premium": "number" } } }
```

- `key` defaults to the trait's id, so every existing assignment is unchanged. A key is lowercase letters and digits in segments joined by `-`, because it is used in paths.
- A trait declares its **cardinality**: `one` fixes the key to the trait's id (`state`), `many` requires a key, unique on the entity type (`versionable`). `validate()` reports a missing or repeated key, a key on a `one` trait, and a key used by two traits (`body` is the trait with the key `body`).
- The most specific assignment wins per key. A change, a command and `$func/entity-traits` carry the key and the trait's id; a trait operation receives its key to find its configuration.
- Timelines are independent. A rule that spans two of them belongs to a guard on the entity type.

## 6. Open

- **Merge patch** costs less to apply than JSON Patch but can't carry `null` or an array change; history needs those. Both use one small patch module, so the format can change in one place once a benchmark on a realistic segment shows a gain.
- Rewinding history and reading an old segment share one `applyAll`: one clone, patches applied in place.
