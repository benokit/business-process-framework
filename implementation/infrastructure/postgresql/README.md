# postgresql

Kind `postgresql-database` (a [`database`](../../framework/database/README.md), so it starts first), instance `default-postgresql-database`. Its `start` hook opens the pool with the `postgresql` section of the app config (`{ url }`, default `postgresql://admin:password@localhost:5432/app`, override with `BPF__postgresql__url`), then runs the database's [`models`](../../framework/database/README.md#models); `stop` closes it.

It implements the operations of `database`: a session is a client of the pool, `execute` runs on the bound session's client or on the pool. Parameters are positional (an array, `$1`, `$2`, …) or named (an object, `:name` placeholders, which may repeat). An unknown session fails with `unknown-session`. Timestamps come back as ISO strings, and error `23505` as `unique-violation`.

Native packages get the client for their `_ctx`, or the pool:

```js
import { getPool, queryable } from '@business-framework/postgresql';
queryable(_ctx).query(text, values); // the bound session's client, or the pool
```

`getPool()` fails with `not-connected` before `start`.
