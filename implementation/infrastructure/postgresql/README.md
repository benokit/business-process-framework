# postgresql

PostgreSQL connection pool and database driver service.

## postgres-client

Shared connection pool. Imported directly by packages that need raw database access.

```js
import { connect, disconnect, getPool } from '@business-framework/postgresql';

await connect();          // initialises the pool; reads postgresUrl from app config
const pool = getPool();   // returns the active pg.Pool instance
await disconnect();       // drains and closes the pool
```

The connection URL is read from `appConfig.postgresUrl` (see [App config](../../runtime/README.md#app-config)). The default value is defined in `elements/postgresql.eson` via the `app-config/postgresql` element. Override it by loading an additional `app-config/postgresql` element with the desired `postgresUrl` before calling `connect()`.

## db-driver-postgresql service

Element `db-driver-postgresql` (kind: `service/db-driver/postgresql`) exposes a single `execute` method for running SQL commands. Used by the `db-modeling` service to create database objects.

Load `elements/postgresql.eson` to register the service.

### execute

| Field | Type | Description |
| --- | --- | --- |
| `command` | string (required) | SQL command to execute |
| `parameters` | map (optional) | Named or positional query parameters |

Returns the raw `pg.Result` object (`{ rows, rowCount, command, ... }`).

**Positional parameters** — pass an array; values map directly to `$1`, `$2`, … in order:

```js
{ command: 'SELECT * FROM orders WHERE status = $1', parameters: ['pending'] }
```

**Named parameters** — use `:name` placeholders; the driver replaces each with `$n` in order of appearance:

```js
{ command: 'SELECT * FROM orders WHERE status = :status AND type = :type',
  parameters: { status: 'pending', type: 'online' } }
```
