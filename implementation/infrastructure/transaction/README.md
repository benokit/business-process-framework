# transaction

PostgreSQL-backed transaction lifecycle. Provides two services.

## `transaction-low`

Low-level session management. Each method operates on a PostgreSQL client connection identified by a numeric `sessionId`.

| Method                | Key input fields | Returns         |
|-----------------------|------------------|-----------------|
| `beginTransaction`    | `options?`       | `{ sessionId }` |
| `commitTransaction`   | `sessionId`      | `{ sessionId }` |
| `rollbackTransaction` | `sessionId`      | `{ sessionId }` |

## `transaction`

High-level service. Begins a transaction, executes a program, commits on success, rolls back and rethrows on failure.

| Method                 | Key input fields                      | Returns             |
|------------------------|---------------------------------------|---------------------|
| `executeInTransaction` | `program`, `programInput?`, `config?` | result of `program` |

`program` is a single pipeline node or an array (same format as a service method implementation). `programInput` is passed as `#.input` to the program.

## Transaction propagation via `_ctx`

`executeInTransaction` stores the active session as `_ctx.transaction = { sessionId }` at the start of a transaction. Any low-level function in the same execution graph can read `_ctx.transaction.sessionId` to join the active transaction. This enables nested calls to reuse an existing session and allows multiple operations to share a single transaction without explicit plumbing.

To write to `_ctx` from a pipeline step:

```json
{ "name": "_ctx", "set": { "transaction": "#.txn" } }
```

## `inTransaction` pipeline keyword

This package registers an [execution node template](../../core/README.md#execution-node-templates) that adds `inTransaction` as a first-class pipeline keyword:

```json
{ "inTransaction": [ ... pipeline ... ] }
```

The node's input (after `inputMap`) becomes the sub-pipeline's `#.input`; the sub-pipeline's result is the node's output. Nested `inTransaction` nodes reuse the outermost transaction; sequential ones each start a fresh transaction.
