# Infrastructure Services

## `entity-database`

Generic document store with optimistic concurrency. Each document carries an `id`, a unique `businessKey`, a `version`, and a `data` object.

| Method   | Key input fields                                    | Returns         |
|----------|-----------------------------------------------------|-----------------|
| `create` | `collection`, `businessKey`, `data`                 | `entity-record` |
| `read`   | `collection`, `id` **or** `businessKey`             | `entity-record` |
| `update` | `collection`, `id`/`businessKey`, `version`, `data` | `entity-record` |
| `delete` | `collection`, `id`/`businessKey`, `version?`        | `entity-record` |
| `list`   | `collection`, `filter?`, `sort?`, `limit?`, `skip?` | `{ records[] }` |

`businessKey` must be a non-empty string, unique per collection. `update` and `delete` use optimistic locking via `version`.

---

## `sequence-generator`

Monotonically increasing integer counter per named sequence.

| Method | Key input fields | Returns             |
|--------|------------------|---------------------|
| `next` | `sequence`       | `{ value: number }` |

---

## `http-server`

HTTP server. On `start`, all `endpoint` data elements are loaded and registered as routes. Each endpoint maps an HTTP method + path to a service method.

| Method  | Key input fields | Returns            |
|---------|------------------|--------------------|
| `start` | `port?`          | `{ port: number }` |
| `stop`  | —                | `{}`               |

Endpoint data elements shape: `{ method, path, controller: { service, method } }`.

---

## `transaction`

MongoDB-backed transaction lifecycle. Provides two services:

### `transaction-mongodb-low`

Low-level session management. Each method operates on a MongoDB `ClientSession` identified by a UUID `sessionId`.

| Method                | Key input fields | Returns              |
|-----------------------|------------------|----------------------|
| `beginTransaction`    | `options?`       | `{ sessionId }`      |
| `commitTransaction`   | `sessionId`      | `{ sessionId }`      |
| `rollbackTransaction` | `sessionId`      | `{ sessionId }`      |

`options` is passed directly to MongoDB's `session.startTransaction()` (e.g. `{ readConcern, writeConcern }`).

### `transaction-mongodb`

High-level service. Wraps a program in a transaction: begins, executes the program, commits on success, rolls back and rethrows on failure.

| Method                 | Key input fields       | Returns             |
|------------------------|------------------------|---------------------|
| `executeInTransaction` | `program`, `config?`   | result of `program` |

`program` is a single pipeline item or an array of items (same format as a service method implementation). `config` is passed as `options` to `beginTransaction`.

The program executes with the full outer context available, so steps within `program` can reference `#.txn` (the active `{ sessionId }`) and `#.input` (the original `executeInTransaction` input).

> **Note:** MongoDB transactions require a replica set or sharded cluster. They are not supported on a standalone `mongod`.
