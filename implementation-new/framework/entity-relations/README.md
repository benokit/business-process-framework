# entity-relations

Directed relations between entities, maintained on every write ([P11](../../../design/postulates.md): a package adds a slot to a kind it doesn't own).

- Declares the slot `relations` on `entity-type` (many methods). Each rule receives the written record and returns `{ relations: [{ targetEntityType, targetEntityBusinessKey, relationType }] }`.
- A `reactions` fill on `entity-type` runs all rules after `create`, `update` and `transition`, inside the transaction, and writes the minimal changes with `entity-relation-database.setRelations`. Targets must exist (`not-found` otherwise); duplicates are ignored. Deleting an entity deletes its relations (`ON DELETE CASCADE`).
- `relationsOf({ sourceEntityId })` → `[{ targetEntityId, relationType }]`.

```json
{
    "kind": "slot-fill",
    "data": {
        "target": "construction",
        "slot": "relations",
        "value": { "set": { "relations": [{ "targetEntityType": "party", "targetEntityBusinessKey": "#.input.data.policyholder", "relationType": "policyholder" }] } }
    }
}
```
