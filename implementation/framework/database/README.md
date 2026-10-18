# database

The abstract kind `database`. Implementations extend it (`postgresql-database`), so other kinds can depend on "a database" without naming one, e.g. `"lifecycle": { "startAfter": ["database"] }` or `{ "invoke": { "instanceOf": "database" }, "operation": "execute" }`. Databases start first.

The [abstract operation](../../core/README.md#interfaces) `execute(`[`sql-command`](elements/database.eson)` { command, parameters? })` → `{ rows, rowCount }`.

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
