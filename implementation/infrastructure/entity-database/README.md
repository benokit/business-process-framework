# entity-database

Generic document store with optimistic concurrency, full revision history, and business versioning. Each document carries an `id`, a unique `businessKey`, a `revision`, a `version`, a `data` object, and a `state` object. `data` and `state` are stored in separate JSONB columns so that FSM state transitions are decoupled from business data mutations.

## Methods

| Method   | Key input fields                                                   | Returns         |
|----------|--------------------------------------------------------------------|-----------------|
| `create` | `entityType`, `businessKey`, `data`, `state?`                      | `entity-record` |
| `read`   | `entityType`, `id`/`businessKey`, `revision?`                      | `entity-record` |
| `update` | `entityType`, `id`/`businessKey`, `revision`, `data?`, `state?`    | `entity-record` |
| `amend`  | `entityType`, `id`/`businessKey`, `revision`, `data`, `validFrom?` | `entity-record` |
| `delete` | `entityType`, `id`/`businessKey`, `revision?`                      | `entity-record` |

`businessKey` must be a non-empty string, unique per `entityType`. `update`, `amend`, and `delete` use optimistic locking via `revision`. `state` defaults to `{}` when omitted.

## `entity-record` shape

```json
{ "id": "uuid", "businessKey": "string", "revision": 1, "version": 1, "data": {}, "state": {}, "timestampUtc": "ISO string" }
```

## `revision` vs `version`

- **`revision`** — optimistic concurrency counter. Increments on every write (`update`, `amend`). Used for conflict detection.
- **`version`** — business version counter. Starts at `1` and increments only on `amend`. Identifies distinct business-meaningful snapshots of `data`.

## Point-in-time read

Passing `revision` to `read` reconstructs the entity as it was at that revision:

```json
{ "entityType": "order", "businessKey": "order-123", "revision": 2 }
```

- Omitting `revision` returns the current record.
- A past revision is reconstructed by applying stored reverse patches from newest to target.
- A future revision or `0` returns `null`.

## Revision history

Every `update` inserts a row into `entity_history` containing reverse JSON patches (RFC 6902) — separate `data_patch` and `state_patch` columns. Each patch is `compare(newValue, oldValue)` so applying it to a newer snapshot reconstructs the previous value.

## `amend` — business versioning

`amend` replaces `data` and snapshots the **previous** data into `entity_versions`. `state` is never touched.

- The current `data` is inserted into `entity_versions` with `valid_to = validFrom`.
- Both `revision` and `version` are incremented.
- `validFrom` is optional; when omitted `valid_to` is `null`.
- `amend` does **not** write to `entity_history`.

Each `entity_versions` row holds the data that was valid **up to** `valid_to`.

## `delete`

Removes the entity row and all associated `entity_history` and `entity_versions` rows atomically.

## Storage

| Table | Key columns | Purpose |
| --- | --- | --- |
| `entities` | `id`, `entity_type`, `business_key`, `revision`, `version`, `data`, `state`, `timestamp_utc` | Current entity state |
| `entity_history` | `id`, `entity_type`, `revision`, `data_patch`, `state_patch`, `timestamp_utc` | Reverse patches per revision |
| `entity_versions` | `id`, `entity_type`, `version`, `data`, `valid_to` | Whole data snapshots per business version |

All tables are created automatically on first use.
