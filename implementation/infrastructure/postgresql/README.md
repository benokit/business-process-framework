# postgresql

PostgreSQL connection pool and database driver service.

## postgres-client

Shared connection pool. Imported directly by packages that need raw database access.

```js
import { connect, disconnect, getPool } from '@business-framework/postgresql';

await connect();          // initialises the pool; reads POSTGRES_URL env var
const pool = getPool();   // returns the active pg.Pool instance
await disconnect();       // drains and closes the pool
```

`POSTGRES_URL` default: `postgresql://admin:password@localhost:5432/app`.

## db-driver-postgresql service

Element `db-driver-postgresql` (kind: `service/db-driver/postgresql`) exposes a single `execute` method for running SQL commands. Used by the `db-modeling` service to create database objects.

Load `elements/postgresql.eson` to register the service.

### execute

| Field | Type | Description |
| --- | --- | --- |
| `command` | string (required) | SQL command to execute |
| `parameters` | map (optional) | Reserved for future parameterised queries |
