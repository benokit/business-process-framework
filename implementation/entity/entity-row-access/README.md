# entity-row-access

Access permissions: which rows of an entity type a user reaches, apart from what they may do. The design is in [row-access](../../../design/row-access.md).

A **process permission** (an [actor or role](../../services/authorization/README.md), held by the user as `roles`) says which operations a user may perform. An **access permission** (an `access-profile`, held as `access`) says which rows they reach. They are assigned separately and combine freely: one process role serves users of every region, and a profile says which.

```json
{ "id": "regional-contracts-access-profile", "kind": "access-profile", "data": {
    "permissions": [{ "resource": "contract", "scopes": ["own-region"], "except": [{ "scopes": ["confidential"] }] }] } }
{ "id": "senior-regional-contracts-access-profile", "kind": "access-profile", "data": {
    "profiles": ["regional-contracts-access-profile"], "permissions": [{ "resource": "contract", "scopes": ["own-region"] }] } }
```

- A permission names the entity types it reaches in `resource` (an entity type or a class, a list, or none for all) and the rows in `scopes` (`[a, b]` the rows matching a or b, `"*"` all); `except` takes `{ scopes }`. A profile includes other profiles with `profiles`. The scopes are [`ownership-scope`](../entity-ownership/README.md#scopes) elements.
- The user holds the names of profiles in `access`, as they hold `roles` ([users](../../services/users/README.md), [security](../../platform/security/README.md)). Profiles only add: the rows of a user are the union of the rows of their profiles, and a profile a user lacks, or one that doesn't reach the entity type, reaches nothing.
- `validate()` reports a permission that names a resource that is no entity type or class, a scope that is none, or a profile that includes itself. `bpf explain` shows, for a scope, the profiles that name it, and for an entity type, the profiles that reach it.

Access is calculated from the context of the call: `_ctx.user` → its `access` profiles (and the ones they include) → the permissions that reach the entity type → their scopes' filters bound to the claims of the principal → evaluated on the `ownership` of the record. The operation plays no part.

| Fill on `entity-type` | Slot | Does |
|---|---|---|
| `hide-uncovered-records` | `guards` | on `read`, `trait` and `delete`, the record as it is must be reached, otherwise `not-found`, so a hidden record can't be told from a missing one |
| `refuse-uncovered-results` | `reactions` | on `create` and `trait`, the record as the write left it must be reached, otherwise `forbidden` and the transaction is rolled back, so nobody creates or hands over a record they could not change |
| `search-only-covered-records` | `searchRows` | the search of [entity-search](../entity-search/README.md) is filtered by the same rows, as a filter in the engine's language |

- **Governed:** an entity type with the [ownership](../entity-ownership/README.md) trait, for a user with a principal who is not `system`. Not governed: a call without a principal (a message consumer, a start), the `system` principal, and an entity type without the trait. A record of any governed type is checked, whichever request reads it; a process that must read what the user may not acts as the system.
- **A past revision** is judged by the ownership it had.
- The bound filter is run on the ownership of one record, and translated for the search engine, so both select the same records. A filter bound to `false` finds nothing, one bound to `true` adds no filter. The index must hold the ownership: `indexRecord` adds `ownership` to the document, and the index declares its dimensions filterable (`filterableAttributes: ["ownership.region"]`).
