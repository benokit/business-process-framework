# entity-ownership

The `ownership` [trait](../entities/README.md#traits): the facts about an entity that access to it depends on, derived from its data at every write. The design is in [row-access](../../../design/row-access.md).

**Why.** "Which rows may this user see" must be answered the same way for a single read and for a search over millions of records, and a search engine can't run business rules. So the facts access depends on (region, departments, …) are derived from the record once, at write time, by a pure rule, and stored beside it. Both the store and the search index then filter on plain values, and callers can't forge them.

- The value of `data.ownership` is a flat map from a dimension to a primitive or to an array of one primitive type. Its configuration is `{ dimensions, rule }`: `dimensions` is the schema of the map (the keys are closed), `rule` a mapping from `{ entityType, businessKey, data }`, the record as the write leaves it, to the ownership. The rule is pure and sees nothing else.
- A dimension is a `string`, `number`, `integer` or `boolean`, or an array of one of them (`departments[]`). A string has no uppercase letters, since a search engine filter compares strings without case and the two answers must be the same.
- A class fixes the dimensions (`fixed.traits.ownership.configuration.dimensions`) and each entity type gives its rule, so no entity type can add a dimension.
- An entity type with ownership exposes the operation `deriveOwnership({ businessKey, revision, value })`, which the backfill uses to write the derived value: the kind `owned-entity-type` declares it, a kind with other traits declares it with the operation `derive` of the key `ownership`.
- Callers can't write it: `create` fails with `invalid` when `traits.ownership` is given, and no endpoint writes the key.
- The interceptor `derive-ownership` (the last fill of the slot `interceptors` of every entity type) applies the rule on `create` and on a trait write, checks the result against `<entityType>/ownership/dimensions` (`invalid` otherwise) and writes it with the write that caused it, so it lands in the same revision. A write that leaves the ownership unchanged writes nothing more. An entity type without the trait is untouched.

## Backfill

Because ownership is stored, a change to a rule, or the trait added to an entity type that has records, leaves the stored ownership as it was. `entity-ownership-backfiller.run({ entityType })` → `{ updated }` derives it again for every record, as the system principal, writing only the records whose ownership differs, so a second run updates none. The writes publish the entity events, so a search index follows. Run it as a migration, named for the change, after the tables:

```json
{ "id": "contract-ownership-2", "kind": "slot-fill", "data": { "target": "database", "slot": "migrations", "position": "last",
    "value": { "run": { "inputMap": { "entityType": "contract" }, "invoke": "entity-ownership-backfiller", "operation": "run" } } } }
```

Changing a scope or an access profile needs nothing of this: filters are built from them at query time.

[`bpf explain`](../../tools/README.md) shows an entity type's dimensions, rule and the scopes that apply to it, and a scope's dimensions and the entity types it applies to.

## Scopes

An `ownership-scope` is a named filter over the ownership: `{ filter }`, a mapping from `{ ownership, principal }` to true or false, with no effects and no `low`. The principal supplies values to compare with: `"#.principal.region"`, `"#.principal.userId"`. The framework restricts its properties to none but `userId` and `roles` ([security](../../platform/security/README.md)); an application declares the claims it uses as the schema `principal-claims`, against which `validate()` checks the scopes. [Access profiles](../entity-row-access/README.md) refer to scopes ([row-access](../../../design/row-access.md#5-access-profiles)).

```json
{ "id": "principal-claims", "kind": "schema", "data": { "region": "string", "regions[]": "string" } }
{ "id": "own-region", "kind": "ownership-scope", "data": { "filter": { "$eq": ["#.ownership.region", "#.principal.region"] } } }
{ "id": "german", "kind": "ownership-scope", "data": { "filter": { "$eq": ["#.ownership.region", "de"] } } }
{ "id": "motor", "kind": "ownership-scope", "data": { "filter": { "$includes": { "collection": "#.ownership.departments", "value": "motor" } } } }
```

- The forms are `$eq` and `$neq` (a scalar dimension and a value or a claim), `$includes` (an array dimension holds a value, or a scalar dimension is one of a list), `$and`, `$or` and `$not`. Ordering is left out: it fails on a missing value, where a scope must answer false.
- A value on the principal's side may be computed from it by a pure function: `{ "$func/hierarchy-subtree": { "hierarchy": "company-departments", "node": "#.principal.department" } }`. It may use only the principal (`validate()` reports one that reads the ownership) and is evaluated when the filter is built, so the filter reaching the store or the search engine is a plain predicate over the dimensions. A [`hierarchy`](../../platform/data-structures/README.md#hierarchy) element (department names nested by subordination) and `$func/hierarchy-subtree` serve organisational structures: the ownership holds one department and the scope resolves the departments a principal reaches from the static tree.
- `bindRows({ rows, principal })` builds the filter of a request: claims are replaced by their values (as values, never as code: a leading `#`, `@` or `\\` is escaped), what no dimension decides folds into `true` or `false`, and a claim with uppercase letters or of another shape (an array compared with `$eq`) matches nothing. A claim the principal lacks compares false.
- A dimension a record doesn't have compares false, and `$not` of that is true. The same holds in a search filter, so the filter run on a record and [`$func/meilisearch-filter`](../../adapters/meilisearch/README.md) over an index select the same records.
- `validate()` reports a form outside the subset, a path that isn't a dimension of any entity type's ownership, a value of another type than the dimension, a string with uppercase letters, `$eq` on an array dimension and `$includes` on a scalar. It also types each ownership rule against the entity type's record: a trait the entity type doesn't have, a body field a closed body schema doesn't have, a key that isn't a dimension, and a dimension with two types in two entity types.

```json
{ "id": "contract-class", "kind": "kind", "data": { "extends": "entity-type", "fixed": { "traits": { "ownership": { "configuration": { "dimensions": { "!region": "string", "departments[]": "string" } } } } } } }
{ "id": "motor-contract", "kind": "contract-class", "data": { "traits": { "ownership": { "configuration": { "rule": { "region": "#.data.body.region", "departments": ["#.data.body.team"] } } } } } }
```
