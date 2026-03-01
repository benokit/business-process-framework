# entity-database

CRUD persistence for versioned entity records. Provides a db-agnostic interface schema and a MongoDB service implementation.

## Abstractions (`elements/entity-database.eson`)

### `entity-record` schema

The shape returned by all operations.

| Field | Type | Description |
|---|---|---|
| `id` | string | Database-assigned identifier |
| `version` | number | Monotonically incremented on each write |
| `data` | object | Arbitrary entity payload |

### `entity-database-interface` schema

Defines the service contract. Any database adapter must implement these five methods:

| Method | Input | Output |
|---|---|---|
| `create` | `collection`, `data` | `entity-record` |
| `read` | `collection`, `id` | `entity-record` |
| `update` | `collection`, `id`, `version`, `data` | `entity-record` |
| `delete` | `collection`, `id`, `version?` | `entity-record` |
| `list` | `collection`, `filter?`, `sort?`, `limit?`, `skip?` | `{ records[] }` |

`update` uses optimistic concurrency — the call fails if the stored `version` does not match. `delete` accepts an optional `version` for the same check.

`list` applies equality filters and sort directives against the entity's `data` fields.

## MongoDB service (`elements/entity-database-mongodb.eson`)

| Element | Type | Id |
|---|---|---|
| Implementation pipeline | `data` | `entity-database-mongodb-implementation` |
| Service | `service` | `entity-database-mongodb` |

The implementation data element can be extended via data composition without modifying this package:

```json
{
    "type": "data",
    "id": "my-implementation",
    "data": {
        "/merge": [
            { "/ref": "entity-database-mongodb-implementation" },
            { "create": { "..." } }
        ]
    }
}
```

### Connection

The MongoDB client reads connection details from environment variables:

| Variable | Default |
|---|---|
| `MONGODB_URL` | `mongodb://admin:password@localhost:27017/admin` |
| `MONGODB_DB` | `test-db` |
