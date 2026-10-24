# entity-relations

Directed relations between entities, maintained on every write. The package declares its slot on `entity-type`, a kind it doesn't own.

- Declares the slot `relations` on `entity-type` (many methods). Each rule receives the written record and returns `{ relations: [{ targetEntityType, targetEntityBusinessKey, relationType }] }`.
- A `reactions` fill on `entity-type` runs all rules after every write but a delete, inside the transaction, and makes them the source's relations with the [query](../database/README.md#queries) `set-entity-relations`. Targets must exist (`not-found` otherwise); duplicates are ignored. Deleting an entity deletes its relations.
- The query `entity-relations-of({ sourceEntityId })` → `[{ targetEntityId, relationType }]`.
- Implementation: [entity-relations-postgresql](../entity-relations-postgresql/README.md).

```json
{
    "kind": "slot-fill",
    "data": {
        "target": "construction",
        "slot": "relations",
        "value": { "set": { "relations": [{ "targetEntityType": "party", "targetEntityBusinessKey": "#.input.data.body.policyholder", "relationType": "policyholder" }] } }
    }
}
```
