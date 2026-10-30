# database

The abstract kind `database`. Implementations extend it (`postgresql-database`), so other kinds can depend on "a database" without naming one, e.g. `"lifecycle": { "startAfter": ["database"] }` or `{ "invoke": { "instanceOf": "database" }, "operation": "execute" }`. Databases start first.

The [abstract operations](../../core/README.md#interfaces):

- `execute(`[`sql-command`](elements/database.eson)` { command, parameters? })` → `{ rows, rowCount }`, in the session bound as `transaction`, else on its own (effect `write`); `read` the same for a statement that changes nothing (`read`), `executeIrreversible` for one whose change no rollback undoes (`irreversible`: a sequence number, a statement meant to run outside the transaction). Rows are JSON (times as ISO strings); a violated unique key fails with `unique-violation`.
- `begin({ isolation })` → `database-session` `{ sessionId }`, `commit(session)`, `rollback(session)`.

The kind `transaction-execution-node-wrapper` (an `execution-node-wrapper`) is the only manager of the context key `transaction`, a `database-session`; [transaction](../../platform/transaction/README.md) binds it.

## Migrations

The slot `migrations` holds what creates and changes database objects and seeds data, each a fill whose id names it: `{ "command": "…" }`, a command in the database's language (fills target its kind), or `{ "run": <method> }`, a pipeline (an entity created through its operations; fills target `database`). `validate()` reports a migration without an id, or with neither or both of `command` and `run`.

```json
{
    "id": "orders-table",
    "kind": "slot-fill",
    "data": { "target": "postgresql-database", "slot": "migrations", "value": { "command": "CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY)" } }
}
```

`database.migrate()` → `{ applied }` runs, in slot order, each migration whose id the table `migrations` doesn't record, and records it; a second run applies nothing. Use `after`/`before` when one migration needs another (an index after its table), `position: "last"` for data that needs every table. Schema changes are deliberate, one-time operations, so a start runs no migration (a replica or a restart must never alter a shared schema): [`bpf migrate`](../../tools/README.md) starts the application, migrates and stops, and tests call `migrate()` of [the postgresql test helpers](../../adapters/postgresql/test/helpers.js) after `start()`. Migrations don't run in a transaction: a failing one isn't recorded, so it runs again next time, and commands are best written to be repeatable (`IF NOT EXISTS`).

## Queries

A `query` is an [integration](../integration/README.md) with provider `database`: a logical operation of the module that needs it, with its contract and no dialect, implemented for each database kind by a fill on the query (in a package of its own, e.g. [sequence-generator-postgresql](../../adapters/sequence-generator-postgresql/README.md)). How many statements an implementation runs is its own concern.

The keyword `statement` runs one command on the database and outputs its rows: `statement` and `parameters` are mappings of the node's input, `row` an optional mapping of each row; `read: true` runs it with `read`, `irreversible: true` with `executeIrreversible`, so the [inferred effect](../../core/README.md#effects) is the statement's.

```json
{ "outputKey": "rows", "inputMap": "#.name", "statement": { "$str": ["SELECT nextval('", "#", "') AS value"] }, "irreversible": true, "row": { "value": { "$parseInt": "#.value" } } }
```

A long statement is best written in a `.sql` file of its package and composed in with [`/uri`](../../core/README.md#data-composition), in an element written with `/data`:

```json
{ "statement": { "/uri": "@business-framework/entities-postgresql/sql/update-at-revision.sql" }, "parameters": ["#.data", "#.before.id", "#.before.revision", "#.patch", "#.before.timestampUtc"] }
```
