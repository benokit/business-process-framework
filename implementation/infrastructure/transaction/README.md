# transaction

PostgreSQL transactions as scoped context.

- Kind `transaction-manager`, instance `transaction` (`isolation`: `read committed`, `repeatable read` or `serializable`): `begin()` → `{ sessionId }`, `commit({ sessionId })`, `rollback({ sessionId })`.
- Kind `transaction-execution-node-wrapper` (an `execution-node-wrapper`) is the only manager of the context key `transaction`.
- Keyword `inTransaction` (instance `in-transaction`): runs its pipeline in the caller's context with `transaction` bound, commits on success, rolls back and rethrows on failure. Inside an enclosing transaction it joins it; sequential nodes each start their own.

```json
{ "inTransaction": [ { "invoke": "contract", "operation": "update" }, { "publish": "contract-events" } ] }
```

`inSession(_ctx, client => …)` runs work in the bound session, or in a transaction of its own when none is bound.

Code that uses the session works without it (autocommit). Native code gets the client for its `_ctx`:

```js
import { queryable } from '@business-framework/transaction';
queryable(_ctx).query(text, values); // the session's client, or the pool
```
