# postgres-client

Shared PostgreSQL connection pool. Not a service element — imported directly by low-level JS modules that need database access.

## API

```js
import { connect, disconnect, getPool } from 'postgres-client';

await connect();          // initialises the pool; reads POSTGRES_URL env var
const pool = getPool();   // returns the active pg.Pool instance
await disconnect();       // drains and closes the pool
```

`POSTGRES_URL` default: `postgresql://admin:password@localhost:5432/app`.
