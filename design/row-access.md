# Row access

Status: **implemented** (R11), demonstrated by the demo's contracts ([demo](../demo/README.md#row-access)). Which records of an entity type a user reaches, apart from what they may do. The work is R11 in [refactoring-plan.md](refactoring-plan.md). It uses the traits of [entities](../implementation/framework/entities/README.md).

## 1. Two kinds of permission

What a user may **do** and which **data** they may do it to are different questions, answered by different permissions that are assigned separately and combine freely:

| | Process permission | Access permission |
|---|---|---|
| Says | which operations: `{ area, resource, action }` | which rows of which entity types: `{ resource, scopes }` |
| Element | `actor` (module), `role` (application) | `access-profile` (application) |
| Held by the user as | `roles` | `access` |
| Checked | at the boundary, per request ([authorization](../implementation/framework/authorization/README.md)) | at the entity, per record ([entity-row-access](../implementation/framework/entity-row-access/README.md)) |
| Needs | the endpoint's operation | the entity type and the user's context |

A process permission names no row, an access permission no operation. The underwriter role is one set of operations whoever holds it; the German and the French underwriter differ only in the access profile assigned beside it. A role never multiplies by region, nor does a profile by process. Both only add: roles' operations unite, profiles' rows unite, and nothing prevails over anything ([no deny](../implementation/framework/authorization/README.md#design)). A request needs both: a permitted operation, and rows within the access.

Three parts make access work:

| | Is | Lives in | Changed by |
|---|---|---|---|
| **ownership** | the facts about a record that access depends on | a trait of the entity | the ownership rule, never a caller |
| **scope** | a named filter over ownership and principal: true or false for a record | an element | the application |
| **access profile** | the scopes of the rows reached per entity type | an element | the application |

An entity type with an ownership trait is governed: a user with no profile that reaches it reaches none of its rows. An entity type without one is not governed. Access is explicit on purpose: a forgotten assignment shows nothing and never everything.

## 2. Ownership

A trait (a kind extending `entity-trait`, cardinality `one`) whose value is a flat map from a **dimension** to a primitive: string, number, boolean, or an array of items of one primitive type.

- **The dimensions are fixed by a kind.** An application declares a class (a kind extending `entity-type`) that fixes `traits.ownership.configuration.dimensions` (`region`, `owner`, `department`), each with its type; the entity types of the class give their rule. An entity type can't add a dimension, since `fixed` admits no other value. A closed set of typed names is what lets `validate` check scopes, and what lets a store and a search index hold the values as columns, `jsonb` paths or filterable attributes.
- **Strings are lowercase.** A search engine compares strings in a filter without case, so the ownership accepts none with uppercase letters and a scope names none: the filter on a record and the filter on an index must select the same records.
- **Only primitives.** No nesting and no mixed arrays, so every comparison translates to a search filter without a case of its own.
- **A missing dimension is absent, and a comparison with an absent value is false.** `$not` of it is true. This is defined once, so the in-memory evaluator and the search engine agree.

## 3. The ownership rule

The configuration of the trait has a `rule`: a mapping from the record to the ownership, run at every write, so ownership is a function of the data and never drifts from it.

```json
{ "id": "contract", "kind": "entity-type", "data": { "traits": {
    "ownership": { "configuration": { "rule": {
        "region": "#.data.body.region",
        "department": "#.data.body.department",
        "owner": "#.data.body.underwriter"
    } } } } } }
```

- **Input.** `{ entityType, businessKey, data }`: the record as it will be after the write, `data` mapping every trait to its value. The rule is pure and sees nothing else, in particular not `_ctx.user`: otherwise ownership would change with whoever writes last. "Owned by the creator" is data (a field of the body, or a trait that records the creator at `create`), which the rule maps.
- **Output.** The ownership, checked against the dimensions of the kind; a value of the wrong type or an undeclared dimension is `invalid`.
- **Checked by `validate`.** The data-flow check follows the paths of the rule through the body schema and the traits of the entity type, so a rule reading a field the body doesn't have is reported when the elements load.
- **Not writable.** The trait has no command for a caller and no HTTP endpoint. Only the middleware writes it.

### The middleware

A generic `interceptor` fill on `entity-type` ([slots](../implementation/framework/entities/README.md#slots)), present on every entity type that configures an ownership trait. Inside the transaction and around the store write, it computes the rule on the record the write produces and writes the ownership with it.

- **`create`:** the interceptor adds the ownership key to the created `data`, so the record is born with it.
- **A trait write or `delete`:** the ownership is recomputed from the record after the write. It is stored only if it differs (deep equality), so a write that changes nothing the rule reads leaves it alone.
- **One revision.** The ownership key changes with the write that caused it, in the same revision. The store's `update` replaces one key of `data`, so it takes a map of keys (a small extension), or the interceptor makes the second update without a revision bump; to settle when implementing.
- **Every path.** Because it sits in `applyChange`, `writeTrait`, `put`, a state transition and a version `put` all pass through it, and no module writes ownership or forgets to.
- **A rule changes, the stored ownership doesn't.** Ownership is stored, since the filters run against it. Changing a rule (or adding the trait to a type with records) needs a backfill that recomputes every record; its writes publish the entity events, which reindex the search. Changing a scope or a grant needs neither, since filters are built at query time. The backfill is `entity-ownership-backfiller.run`, which the application names in a migration for the change; it writes only the records whose ownership differs, so it can run again.

## 4. Scopes

```json
{ "id": "de", "kind": "scope", "data": { "filter": { "$eq": ["#.ownership.region", "de"] } } }
{ "id": "eu", "kind": "scope", "data": { "filter": { "$includes": { "collection": ["de", "fr", "it"], "value": "#.ownership.region" } } } }
```

- **The filter language** is a subset of LambdaJSON: `$eq` and `$neq` (a scalar dimension and a value), `$includes` (an array dimension holds a value, or a scalar dimension is one of a list), `$and`, `$or`, `$not`, literals and paths into `ownership`. No effects, no `low`, no ordering (it fails on a missing value, where a scope answers false).
- **It sees the pair `{ ownership, principal }`.** A scope composes primitive filters, each comparing a dimension of the ownership with a value: a literal or a property of the principal (`ownership.region = principal.region`, `ownership.owner = principal.userId`, a dimension among `principal.regions`). Which scopes a user reaches comes only from their access profiles; the principal only supplies the values the scopes compare with, so "own records" and "my region" are scopes, and one profile serves every region.
- **The principal is open.** The framework restricts nothing but `userId`, `roles` and `access`: any property is a claim, as the users or the identity provider supply it (the properties of a `user` besides `subject` are the claims of the principal). An application states them by declaring the schema `principal-claims`; `validate` checks the paths and types of scopes against it, and does not check the claims of a principal without one. Checking the claims of a user against it is still to come.
- **Computed values.** A value on the principal's side may be computed from it by a pure function, e.g. the departments below the principal's: `$func/hierarchy-subtree` over a static [`hierarchy`](../implementation/framework/data-structures/README.md#hierarchy) element (a tree of names). It may use only the principal. An organisation is then one department in the ownership and a tree that is read when the request runs: restructuring edits the tree, with no backfill.
- **Binding.** The filter of a request is built from the context: `#.principal.…` and the computed values are replaced by their values, and what no dimension decides folds into a constant (`true`, `false`). What reaches the search engine is a plain predicate over the dimensions, and `false` means no hit. A claim is a value, never code (a string that starts with `#`, `@` or `\\` is escaped), one with uppercase letters or of another shape (an array where a scalar is compared) matches nothing, and a missing claim compares false, so `$not` of it is true. The guard evaluates the same bound filter.
- **Closed.** A path into `ownership` names a dimension of the kind, one into `principal` a claim; `validate` reports an unknown one, a comparison of the wrong type, an operator outside the subset.
- **Two evaluators, one meaning.** The mapping itself run on one record, and `$func/meilisearch-filter`, a translator to the filter of the search engine. A test runs both over the same records and requires equal results.
- **A scope on a dimension the entity type doesn't have** matches nothing, so it grants nothing and excepts nothing.

## 5. Access profiles

```json
{ "id": "regional-contracts-access-profile", "kind": "access-profile", "data": {
    "permissions": [{ "resource": "insurance-contract-type", "scopes": ["own-region"], "except": [{ "scopes": ["confidential"] }] }] } }
{ "id": "senior-regional-contracts-access-profile", "kind": "access-profile", "data": {
    "profiles": ["regional-contracts-access-profile"],
    "permissions": [{ "resource": "insurance-contract-type", "scopes": ["own-region"] }] } }
```

- A permission names the entity types it reaches in `resource` (an entity type, a class above entity types, a list of them, or none for all) and the rows in `scopes`: `[a, b]` the rows matching a or b, `"*"` all rows. `except` takes `{ scopes }`: the rows of the permission are its scopes minus the excepted ones. A profile `profiles` includes other profiles, at any depth.
- The user holds the names in `access`, beside `roles`: two lists of the same user, assigned by whoever administers them, the principal carrying both.
- `rowAccess({ entityType, profiles })` returns `null` when no profile of the user reaches the entity type, `true` when a permission reaches all rows, otherwise the filter: the OR over the permissions that reach it of their scopes' filters (`$or`), `$not` for the excepted ones. It reads only elements, and is bound to the principal's claims ([§4](#4-scopes)).
- A profile that names an unknown entity type or scope, or includes itself, is reported by `validate()`.

## 6. Enforcement

At the entity operations, not only at HTTP, so relations, versions, events and states can't go around it. The `system` principal is not filtered.

### The calculation

Access is calculated from the current context, never stored with the user: `_ctx.user` → its `access` profiles (and the profiles they include) → the permissions that reach the entity type → their scopes, bound to the principal → evaluated on the ownership of the record. The operation plays no part: process permissions were checked at the boundary.

- **One pure function**, `rowAccess({ entityType, profiles })` ([§5](#5-access-profiles)), returns the filter of the rows the profiles reach for the entity type.
- **A generic guard** on `entity-type` (a fill of the `guards` slot) takes `_ctx.user`, binds the filter to its claims and refuses (`not-found`) a record it doesn't cover. It needs only the effects `read` and `trace` that guards may have. A call without a principal (a message consumer, a start), the `system` principal and an entity type without the ownership trait are not governed. Every governed type is governed whatever the request is about: a record of one entity type read while another is being changed (a governed type read by a transition) is checked against the user's access too; a process that must read what the user may not acts as the system.
- **`read` runs the guards too.** The `guards` slot is extended to the `read` operation: after the store read, the guards run with the change `{ operation: "read", before: <the record> }`, before the record is returned. The generic guard is then the one enforcement point for a single record, on reads and on writes (which read the record first), and every path that reads an entity (relations, versions, states) goes through it.
- **`search` is the only collection read.** The entity type has no `list` and no endpoint lists a type, so no query has to be filtered through the store; the store keeps `list` for a backfill or a reindex, run as the system, which no request reaches. The one-slot `searchRows` of `entity-type`, declared by `entity-search` and filled by `entity-row-access`, gives the tree, which the engine translates and applies besides the filter of the request; that keeps `total`, `limit` and `offset` right. The document in the index carries the `ownership`.
- **Creating and handing over.** A guard runs before the interceptor writes the ownership, so the ownership a write produces isn't in its change. The check on the record as it will be (`after`) is a `reaction`, which runs after the write and rolls the transaction back; the guard checks the record as it is (`before`).

| Path | Enforcement |
|---|---|
| `read` | the guard evaluates the expression on the record; not covered: `not-found`, never `forbidden`, so existence is not revealed |
| `search` | the expression is translated to the search filter, so `total`, `limit` and `offset` are right; the index holds the ownership dimensions as filterable attributes |
| `writeTrait`, `delete` | the record as it is (`before`) must be covered |
| `create`, and a write that changes ownership | the record as it will be (`after`) must be covered too, so nobody creates or hands over a record they could not change; checked by a reaction (see above) |
| related entities, versions, events | through the same `read` guard |

## 7. Validation and explanation

`validate()` reports: a scope with an unknown dimension, a type mismatch or an operator outside the subset; an access profile naming an unknown entity type or scope or including itself; a rule that reads a path the entity type doesn't have, or whose output doesn't match the dimensions; an ownership trait configured without a rule.

`bpf explain` shows, for a scope, the dimensions it reads, the entity types it applies to and the access profiles that name it; for an entity type, its dimensions, rule and scopes that apply, and the access profiles that reach it.

## 8. Open points

- **Historic reads.** A read at a past revision is judged by the ownership that revision had, so the region a record left can still read what it was then. Judging by the current ownership needs the current record beside the past one: to decide.
- **Rule changes aren't detected.** Nothing tells a rule changed since the last backfill; the application adds a migration with a new id, as for any data change.
