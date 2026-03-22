# Business Services

Domain-level services built on the framework's core infrastructure. Each package provides declarative element definitions (`.eson` files) consumed by the framework runtime.

---

## `entities`

Generic entity lifecycle management. An entity is a versioned, keyed document belonging to a named entity type.

### Entity type definition

Each entity type is a `data` element whose `data` field conforms to the `entity-type-data` schema:

| Field | Description |
| --- | --- |
| `dataSchema` | CJSL schema validated against `data` on every `create` and `update` |
| `statesModel` | Optional finite-state model (see below) used by `transition` |
| `dataVersioning` | Optional `{ enabled, validFrom }` flags for temporal data versioning |
| `history` | Optional `{ enabled }` flag |
| `dimensions` | Arbitrary grouping metadata |

### States model and transitions

`statesModel` defines the valid states and transitions for an entity type:

```json
{
    "states": { "draft": ["open", "closed"], "status": ["pending", "approved"] },
    "transitions": {
        "approve": {
            "from": { "status": ["pending"] },
            "to":   { "status": "approved" }
        },
        "close": {
            "from": { "status": ["pending", "approved"] },
            "to":   { "draft": "closed" }
        }
    },
    "initialStates": {
        "default": { "dimensions": { "status": "pending", "draft": "open" } },
        "open":    { "dimensions": { "status": "pending", "draft": "open" } }
    }
}
```

**`initialStates`** is an optional map of name → initial `entity-state-data` object. When an entity is created, the `initialState` input field selects the preset by name; if omitted, the `"default"` key is used. If neither the named preset nor `"default"` exists, the entity is created with an empty state.

**Entity state** is stored separately from `data` as an `entity-state-data` object:

```json
{ "dimensions": { "status": "pending", "draft": "open" }, "fromTransition": "submit" }
```

- `dimensions` — a map of dimension name → current value (all values are strings)
- `fromTransition` — name of the last transition that produced this state

**Transition definition** (schema `entity-type-transition`):

| Field | Type | Description |
| --- | --- | --- |
| `from` | `{dim: [string]}` | Required pre-conditions. Each entry maps a dimension to its set of allowed values. A dimension absent from `from` is a wildcard (any current value is accepted). |
| `to` | `{dim: string}` | Post-state. Each entry sets the named dimension to the given value. Dimensions absent from `to` are carried forward unchanged from the current state. |

When `transition` is called:

1. The named transition is looked up in `transitions`; throws `"transition is not defined"` if absent.
2. Every dimension listed in `from` is checked — the entity's current value for that dimension must appear in the allowed array; throws `"transition failed"` if any check fails.
3. The new state is formed by merging `to` onto the current `dimensions` (carry-forward).
4. The entity is updated with the new state inside a transaction.

Example entity type definition:

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

### `entity` service

| Method | Key input fields | Returns |
| --- | --- | --- |
| `create` | `entityType`, `businessKey`, `data`, `initialState?` | `entity-record` |
| `read` | `entityType`, `businessKey` | `entity-record` |
| `update` | `entityType`, `businessKey`, `revision`, `data` | `entity-record` |
| `delete` | `entityType`, `businessKey`, `revision?` | `entity-record` |
| `transition` | `entityType`, `businessKey`, `transition` | `entity-record` |
| `amend` | `entityType`, `businessKey`, `data`, `validFrom?` | `entity-record` |
| `execute` | `entityType`, `businessKey`, `componentId`, `methodId`, `input?` | varies |

`create` and `update` validate `data` against the entity type's `dataSchema` before writing. `update` and `delete` use optimistic concurrency via `revision`.

### On-create event handlers

Services registered with `meta.kind = "entity-event-handler/on-create/{entityType}"` are automatically invoked within the same transaction as `create`. Each handler must expose a single method `action` that receives the created `entity-record` as input.

```json
{
    "type": "service",
    "id": "order-notify",
    "meta": { "kind": "entity-event-handler/on-create/order" },
    "interface": { "action": { "input": "@entity-record", "output": {} } },
    "implementation": { "action": [ ... ] }
}
```

Multiple handlers for the same entity type are all invoked; registration order is not guaranteed.

### On-update event handlers

Services registered with `meta.kind = "entity-event-handler/on-update/{entityType}"` are automatically invoked within the same transaction as `update`. Each handler must expose a single method `action` that receives the updated `entity-record` as input.

```json
{
    "type": "service",
    "id": "order-audit",
    "meta": { "kind": "entity-event-handler/on-update/order" },
    "interface": { "action": { "input": "@entity-record", "output": {} } },
    "implementation": { "action": [ ... ] }
}
```

Multiple handlers for the same entity type are all invoked; registration order is not guaranteed.

### On-transition event handlers

Services registered with `meta.kind = "entity-event-handler/on-transition/{entityType}"` are automatically invoked within the same transaction as `transition`. Each handler must expose a single method `action` that receives the transitioned `entity-record` (already at the new state) as input.

```json
{
    "type": "service",
    "id": "order-transition-notify",
    "meta": { "kind": "entity-event-handler/on-transition/order" },
    "interface": { "action": { "input": "@entity-record", "output": {} } },
    "implementation": { "action": [ ... ] }
}
```

Multiple handlers for the same entity type are all invoked; registration order is not guaranteed.

### Components

A component extends an entity with additional behaviour exposed through the `execute` method. It is declared as two data elements:

**Component** (`entity-component-data` schema):

| Field | Description |
| --- | --- |
| `entityType` | The entity type this component belongs to |
| `contextMapping` | LambdaJSON object mapping the entity record fields to the component service context |
| `componentService` | Id of the component service data element |

**Component service** (`entity-component-service-data` schema):

| Field | Description |
| --- | --- |
| `contextSchema` | Schema id validated against the mapped context |
| `service` | Id of the service that implements the component methods |

When `execute` is called, the entity record is read, `contextMapping` is applied to build a context object stored in `_ctx.entityContext`, and the specified `methodId` is dispatched to the component's service.
