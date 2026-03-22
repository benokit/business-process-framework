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
| `statesModel` | Optional finite-state model (`states` map + `transitions[]`) used by `transition` |
| `dataVersioning` | Optional `{ enabled, validFrom }` flags for temporal data versioning |
| `history` | Optional `{ enabled }` flag |
| `dimensions` | Arbitrary grouping metadata |

```json
{
    "type": "data",
    "id": "order",
    "data": {
        "dataSchema": { "!amount": "number", "!currency": "string" },
        "statesModel": {
            "states": { "draft": {}, "confirmed": {}, "cancelled": {} },
            "transitions": [
                { "name": "confirm",  "from": { "draft": true },     "to": { "confirmed": true } },
                { "name": "cancel",   "from": { "draft": true },     "to": { "cancelled": true } }
            ]
        }
    }
}
```

### `entity` service

| Method | Key input fields | Returns |
| --- | --- | --- |
| `create` | `entityType`, `businessKey`, `data`, `state?` | `entity-record` |
| `read` | `entityType`, `businessKey` | `entity-record` |
| `update` | `entityType`, `businessKey`, `version`, `data`, `state?` | `entity-record` |
| `delete` | `entityType`, `businessKey`, `version?` | `entity-record` |
| `transition` | `entityType`, `businessKey`, `transition` | `entity-record` |
| `amend` | `entityType`, `businessKey`, `data`, `validFrom?` | `entity-record` |
| `execute` | `entityType`, `businessKey`, `componentId`, `methodId`, `input?` | varies |

`create` and `update` validate `data` against the entity type's `dataSchema` before writing. `update` and `delete` use optimistic concurrency via `version`.

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
