# database

The abstract kind `database`. Implementations extend it (`postgresql-database`), so other kinds can depend on "a database" without naming one, e.g. `"lifecycle": { "startAfter": ["database"] }` or `{ "invoke": { "instanceOf": "database" }, "operation": "execute" }`. Databases start first.

The [abstract operations](../../core/README.md#interfaces):

- `execute(`[`sql-command`](elements/database.eson)` { command, parameters? })` → `{ rows, rowCount }`, in the session bound as `transaction`, else on its own (effect `write`); `executeIrreversible` the same, for a statement whose change no rollback undoes (a sequence number).
- `begin({ isolation })` → `database-session` `{ sessionId }`, `commit(session)`, `rollback(session)`.

The kind `transaction-execution-node-wrapper` (an `execution-node-wrapper`) is the only manager of the context key `transaction`, a `database-session`; [transaction](../../infrastructure/transaction/README.md) binds it.

## Models

The slot `models` holds the commands that create database objects (`{ "command": "…" }`); a database runs them, in slot order, when it starts. Commands are written in the database's language, so fills target its kind:

```json
{
    "id": "orders-table",
    "kind": "slot-fill",
    "data": { "target": "postgresql-database", "slot": "models", "value": { "command": "CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY)" } }
}
```

Use `after`/`before` between fills when one command needs another (an index after its table).

## Queries

A `query` is an [integration](../integration/README.md) with provider `database`: a logical operation of the module that needs it, with its contract and no dialect, implemented for each database kind by a fill on the query (in a package of its own, e.g. [sequence-generator-postgresql](../../infrastructure/sequence-generator-postgresql/README.md)). How many statements an implementation runs is its own concern.

The keyword `statement` runs one command on the database and outputs its rows: `statement` and `parameters` are mappings of the node's input, `row` an optional mapping of each row; `irreversible: true` runs it with `executeIrreversible`.

```json
{ "outputKey": "rows", "inputMap": "#.name", "statement": { "$join": { "_strings": ["SELECT nextval('", "#", "') AS value"] } }, "row": { "value": { "$parseInt": "#.value" } } }
```
