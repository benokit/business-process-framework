# entities

Generic entity lifecycle management. An entity is a keyed, versioned document belonging to a named entity type.

## Entity type definition

Each entity type is a `data` element:

```json
{
    "type": "data",
    "id": "order",
    "data": {
        "dataSchema": { "!amount": "number", "!currency": "string" },
        "statesModel": {
            "states": { "status": ["draft", "confirmed", "cancelled"] },
            "transitions": {
                "confirm": { "from": { "status": ["draft"] },              "to": { "status": "confirmed" } },
                "cancel":  { "from": { "status": ["draft", "confirmed"] }, "to": { "status": "cancelled" } }
            },
            "initialStates": {
                "default": { "dimensions": { "status": "draft" } }
            }
        }
    }
}
```

| Field | Description |
| --- | --- |
| `dataSchema` | CJSL schema validated against `data` on `create` and `update` |
| `statesModel` | Optional finite-state model; used by `transition` |
| `dataVersioning` | Optional `{ enabled, validFrom }` flags |
| `history` | Optional `{ enabled }` flag |
| `dimensions` | Arbitrary grouping metadata |

## States model

`statesModel` declares valid states and transitions:

- **`states`** — map of dimension name → allowed values array.
- **`transitions`** — named transitions, each with:
  - `from` — maps dimension → allowed values. A dimension absent from `from` is a wildcard.
  - `to` — maps dimension → new value. Dimensions absent from `to` carry forward unchanged.
- **`initialStates`** — optional map of name → initial state object. `"default"` is used when `initialState` is not supplied on `create`. If neither exists, the entity is created with empty state.

**Entity state** shape:

```json
{ "dimensions": { "status": "draft" }, "fromTransition": "confirm" }
```

When `transition` is called:

1. Looks up the named transition; throws `"transition is not defined"` if absent.
2. Checks all `from` dimensions against current state; throws `"transition failed"` if any mismatch.
3. Merges `to` onto current `dimensions`.
4. Writes the new state inside a transaction.

## `entity` service

| Method | Key input fields | Returns |
| --- | --- | --- |
| `create` | `entityType`, `businessKey`, `data`, `initialState?` | `entity-record` |
| `read` | `entityType`, `businessKey` | `entity-record` |
| `update` | `entityType`, `businessKey`, `revision`, `data` | `entity-record` |
| `delete` | `entityType`, `businessKey`, `revision?` | `entity-record` |
| `transition` | `entityType`, `businessKey`, `transition` | `entity-record` |
| `amend` | `entityType`, `businessKey`, `revision`, `data`, `validFrom?` | `entity-record` |
| `execute` | `entityType`, `businessKey`, `componentId`, `methodId`, `input?` | varies |

- `create` and `update` validate `data` against `dataSchema`.
- `update` and `delete` use optimistic concurrency via `revision`.
- `amend` validates `data` against `dataSchema` and uses optimistic concurrency via `revision` (same as `update`). `state` is never modified. See [entity-database](../../infrastructure/entity-database/README.md#amend--business-versioning) for storage details.

## Event handlers

Handlers are invoked within the same transaction as their triggering method. Each handler is a `service` element with a single `action` method that receives the result `entity-record` as input. All matching handlers are invoked; registration order is not guaranteed.

| Event | `kind` | Triggering method |
| --- | --- | --- |
| on-create | `entity-event-handler/on-create/{entityType}` | `create` |
| on-update | `entity-event-handler/on-update/{entityType}` | `update` |
| on-amend | `entity-event-handler/on-amend/{entityType}` | `amend` |
| on-transition | `entity-event-handler/on-transition/{entityType}` | `transition` |

```json
{
    "type": "service",
    "id": "order-notify",
    "kind": "entity-event-handler/on-create/order",
    "interface": { "action": { "input": "@entity-record", "output": {} } },
    "implementation": { "action": [ ... ] }
}
```

## Components

A component extends an entity type with additional methods accessible via `execute`.

**Component** (`entity-component-data` schema):

| Field | Description |
| --- | --- |
| `entityType` | Entity type this component belongs to |
| `contextMapping` | LambdaJSON expression mapping the entity record to a context object stored in `_ctx.entityContext` |
| `componentService` | Id of the component service data element |

**Component service** (`entity-component-service-data` schema):

| Field | Description |
| --- | --- |
| `contextSchema` | Schema id validated against the mapped context |
| `service` | Id of the service implementing the component methods |

When `execute` is called, the entity record is read, `contextMapping` is applied to build a context stored in `_ctx.entityContext`, and `methodId` is dispatched to the component's service.
