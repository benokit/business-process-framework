# transaction

PostgreSQL transactions as scoped context.

- Kind `transaction-manager`, instance `transaction` (`isolation`: `read committed`, `repeatable read` or `serializable`): `begin()` → `{ sessionId }`, `commit({ sessionId })`, `rollback({ sessionId })`.
- Keyword `afterCommit` (instance `after-commit`): its pipeline runs after the bound transaction commits, or at once when no transaction is bound; a rollback drops it. Inside a joined transaction it runs after the outermost commit. It runs in registration order, with the node's input, the `self` of the code it is written in and the caller's context without `transaction`; pass outputs it needs through `inputMap`. The committed work has succeeded whatever the pipeline does: a failure is ignored, so the pipeline handles its own.
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
