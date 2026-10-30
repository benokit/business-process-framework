# postgresql

Kind `postgresql-database` (a [`database`](../../platform/database/README.md), so it starts first), instance `default-postgresql-database`. Its `start` hook opens the pool with its `url` setting (default `postgresql://admin:password@localhost:5432/app`, override with `BPF__postgresql_database__url`); `stop` closes it. It creates nothing at start: [migrations](../../platform/database/README.md#migrations) do.

It implements the operations of `database`: a session is a client of the pool, `execute` runs on the bound session's client or on the pool. Parameters are positional (an array, `$1`, `$2`, …) or named (an object, `:name` placeholders, which may repeat). An unknown session fails with `unknown-session`. Timestamps come back as ISO strings, and error `23505` as `unique-violation`.

Native packages get the client for their `_ctx`, or the pool:

```js
import { getPool, queryable } from '@business-framework/postgresql';
queryable(_ctx).query(text, values); // the bound session's client, or the pool
```

`getPool()` fails with `not-connected` before `start`.
