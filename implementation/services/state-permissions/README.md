# state-permissions

Who may modify an entity in a given state: a `state` dimension of the operation in [authorization](../authorization/README.md), checked where the record is known. The design is in [state-permissions](../../../design/state-permissions.md).

The permission state of a record is the value of one dimension of its [state trait](\1), `status` by default. A grant names it like any dimension:

```json
{ "id": "author-actor", "kind": "actor", "data": { "grants": [
    { "area": "entities", "resource": "document", "action": "read" },
    { "area": "entities", "resource": "document", "action": ["create", "update"], "state": "draft" },
    { "area": "states", "resource": "document", "action": "submit" }
] } }
```

- The dimension `state` (fill `state-dimension`) is decided later: an endpoint doesn't name it, the boundary lets every value through (the request passes if the role could do it in some permission state), and the values are the permission states of every entity type ([authorization](../authorization/README.md#operations)).
- The authorization binds the operation of the request as `_ctx.operation`. The guard `refuse-forbidden-states` (slot `guards`, last, so row access answers first) sets its `state` to the permission state of the record as it is and asks `$func/permits` with the roles of the user; otherwise `forbidden`. `refuse-forbidden-initial-states` (slot `reactions`) does the same for the state a record is created in, rolling the transaction back.
- **Not checked:** reads and searches, which are row access ([entity-row-access](../../entity/entity-row-access/README.md)); a call without a principal or an operation, and the `system` principal; a record of another entity type than the operation's `resource`, since a business operation is judged by its own resource.
- The permission state is computed from the current state at every check, never stored: changing the permission dimension applies at once.
- `validate()` reports a grant whose `state` no entity type it grants declares, and a `state` on a grant of `query`, `read` or `search`. The permission dimension is checked by [entity-states](../../entity/entity-states/README.md#permission-states).
- `bpf explain` of an entity type shows, per permission state, the roles that permit updating it (the operation `entities` / `update`) and each of its transitions.
