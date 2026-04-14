# database-modeling

Service for creating database objects from declarative `data-model` elements. Decouples schema creation from the business logic that operates on those schemas.

## data-model elements

Define database objects as elements of kind `data-model/{db-type}`:

```json
{
    "kind": "data-model/postgresql",
    "id": "my-table",
    "data": {
        "command": "create-my-table",
        "order": 10
    }
}
```

- `command` — id of an `.eson.sql` element containing the DDL command
- `order` — execution order (ascending); lower values run first

The corresponding SQL file `create-my-table.eson.sql` holds the raw DDL:

```sql
CREATE TABLE IF NOT EXISTS my_table (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid()
)
```

## database-modeling service

Method `createModels` collects all `data-model/{dbType}` elements, sorts them by `order`, and executes each command through the matching `db-driver-{dbType}` service.

```js
await execute('database-modeling', 'createModels', { dbType: 'postgresql' });
```

Load `elements/database-modeling.eson` and the relevant driver elements (e.g. `postgresql/elements/postgresql.eson`) before calling this service.
