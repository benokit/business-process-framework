# database

Service for creating database objects from declarative `db-model` elements. Decouples schema creation from the business logic that operates on those schemas.

## Interfaces

`driver.eson` defines two abstract method interfaces used by driver and search-engine implementations:

| Element | Description |
| --- | --- |
| `db-driver-interface` | Method interface shared by all `db-driver-{dbType}` implementations (`execute`) |
| `search-engine-interface` | Method interface shared by all `service/search-engine` implementations (`configureIndex`, `deleteIndex`, `insertDocument`, `removeDocument`, `search`) |

## db-model elements

Define database objects as elements of kind `db-model/{db-type}`:

```json
{
    "kind": "db-model/postgresql",
    "id": "my-table",
    "/data": {
        "command": { "/ref": "create-my-table" },
        "order": 10
    }
}
```

- `command` — the DDL command itself (any type accepted by the driver); use `{ "/ref": "element-id" }` to reference a command stored in another element
- `order` — execution order (ascending); lower values run first

A common pattern is to keep the SQL in a separate `.eson.sql` file, which the elements-loader registers as an element whose `data` is the raw DDL string:

```sql
-- create-my-table.eson.sql
CREATE TABLE IF NOT EXISTS my_table (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid()
)
```

The `db-model` element then references it with `/ref`. Alternatively, the command can be inlined directly in `data`.

## database service

Method `createModels` collects all `db-model/{dbType}` elements, sorts them by `order`, and executes each command through the matching `db-driver-{dbType}` service.

```js
await execute('db-modeling', 'createModels', { dbType: 'postgresql' });
```

Load `elements/modeling.eson` from the `@business-framework/database` package and the relevant driver elements (e.g. `postgresql/elements/postgresql.eson`) before calling this service.

## db-access service

Provides a generic query execution layer for use inside pipelines. Resolves the `db-driver-{dbType}` service at runtime and forwards the query and parameters as a driver command. Returns whatever the driver returns.

```js
await execute('db-access', 'get', {
    dbType: 'postgresql',
    query: 'SELECT * FROM orders WHERE status = $1',
    parameters: { '1': 'pending' }
});
```

**Use cases:**

- **Custom queries** — aggregations, joins, full-text search, or any query not covered by the entity layer.
- **Reporting** — bulk reads that return arbitrary result shapes.
- **Driver-agnostic pipelines** — when `dbType` is supplied at runtime from configuration rather than being hardcoded, the same pipeline step works across database backends.
- **Direct DML** — one-off inserts or updates outside the entity lifecycle (e.g. bulk migrations, seed data).

Load `elements/access.eson` from the `@business-framework/database` package alongside the matching driver elements before calling this service.
