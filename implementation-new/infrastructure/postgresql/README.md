# postgresql

Kind `postgresql-database`, instance `postgresql`. Its `start` hook opens the pool with the `postgresql` section of the app config (`{ url }`, default `postgresql://admin:password@localhost:5432/app`, override with `BPF__postgresql__url`); `stop` closes it.

`execute({ command, parameters? })` → `{ rows, rowCount }`. Parameters are positional (an array, `$1`, `$2`, …) or named (an object, `:name` placeholders, which may repeat).

Native packages use the pool directly:

```js
import { getPool } from '@business-framework/postgresql';
```

`getPool()` fails with `not-connected` before `start`.
