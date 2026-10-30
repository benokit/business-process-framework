# data-structures

General static data structures for elements, and the pure functions that read them.

## hierarchy

A `hierarchy` is an element `{ tree }`: a tree of names, each name mapped to an object of its children (`{}` for a leaf). Names are unique in the tree and lowercase, so a name identifies a node.

```json
{ "id": "company-departments", "kind": "hierarchy", "data": { "tree": { "sales": { "emea": { "de": {}, "fr": {} }, "apac": {} }, "finance": {} } } }
```

- `$func/hierarchy-subtree({ hierarchy, node })` → the node and every node below it, in depth-first order (`[]` for a node the tree doesn't have, or none given).
- `validate()` reports a name that is in the tree twice, one with uppercase letters, and a tree of another shape.

A scope of [entity-ownership](../../entity/entity-ownership/README.md#scopes) uses it to resolve the departments a principal heads.
