# entities

Keyed, versioned business records.

## entity-type

Each entity type is an instance of `entity-type`, or of a class: a kind that extends it, whose `defaults` its instances inherit.

```json
{
    "id": "order",
    "kind": "entity-type",
    "data": {
        "dataSchema": { "!amount": "number" },
        "statesModel": {
            "states": { "status": ["draft", "confirmed"] },
            "transitions": { "confirm": { "from": { "status": ["draft"] }, "to": { "status": "confirmed" } } },
            "initialStates": { "default": { "status": "draft" } }
        }
    }
}
```

| Operation | Input | Output |
|---|---|---|
| `read` | `businessKey`, `revision?` (a past revision is rebuilt from history) | record |
| `list` | `limit?` (≤ 200), `offset?` | `{ items, total }` |
| `create` | `businessKey?`, `data`, `initialState?` | record |
| `update` | `businessKey`, `revision`, `data` | record |
| `transition` | `businessKey`, `revision?`, `transition` | record |
| `delete` | `businessKey`, `revision?` | the deleted record |

Record: `{ id, entityType, businessKey, revision, data, state: { dimensions, fromTransition? }, timestampUtc }`. Errors: `invalid` (data, missing business key, unknown transition), `not-found`, `conflict` (duplicate key, revision mismatch, transition not allowed from the current state).

On load, an entity type adds `<id>/dataSchema` and checks its states model (undeclared states are an error).

## Slots

Fill them on `entity-type` (every entity type), on a class (all its instances) or on one entity type.

| Slot | Cardinality | Value | Runs |
|---|---|---|---|
| `businessKey` | one | method: create input → key | on `create` without `businessKey`; the most specific fill wins |
| `guards` | many | method: change → (throws to refuse) | before the transaction |
| `interceptors` | many | middleware around the store write: `#.input` is the store input, `next` writes | inside the transaction |
| `reactions` | many | method: change with `after` = the written record | inside the transaction, after the write; a failure rolls back |

A change is `{ operation, transition?, before?, after? }`.

## Storage

`entity-database` (kind `entity-store`) writes PostgreSQL tables `entities` and `entity_history` (reverse JSON patches per revision), created as [models](../database/README.md#models). It writes in the bound `transaction`, or in its own.
