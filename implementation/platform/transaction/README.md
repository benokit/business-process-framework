# transaction

Transactions as scoped context, on the sessions of the bound [`database`](../../platform/database/README.md).

- Kind `transaction-manager`, instance `transaction` (`isolation`: `read committed`, `repeatable read` or `serializable`): `begin()` → `{ sessionId }`, `commit({ sessionId })`, `rollback({ sessionId })`, through the database's.
- Keyword `afterCommit` (instance `after-commit`, [`effects.defers`](../../core/README.md#effects)): its pipeline runs after the bound transaction commits, or at once when no transaction is bound; a rollback drops it. Inside a joined transaction it runs after the outermost commit. It runs in registration order, with the node's input, the `self` of the code it is written in and the caller's context without `transaction`; pass outputs it needs through `inputMap`. The committed work has succeeded whatever the pipeline does: a failure is ignored, so the pipeline handles its own.
- Keyword `inTransaction` (instance `in-transaction`, a [`transaction-execution-node-wrapper`](../../platform/database/README.md)): runs its pipeline in the caller's context with `transaction` bound, commits on success, rolls back and rethrows on failure. Inside an enclosing transaction it joins it; sequential nodes each start their own. Its pipeline may only have `read`, `write` and `trace` [effects](../../core/README.md#effects): `validate()` reports an `irreversible` effect it reaches, unless it runs under `afterCommit`.

```json
{ "inTransaction": [ { "invoke": "contract", "operation": "update" }, { "publish": "contract-events" } ] }
```
