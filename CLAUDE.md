# Business Process Framework

## Architecture

The framework is built around **elements** — typed, declarative JSON objects loaded from `.eson` files. There are three element types:

- **`schema`** — compact JSON Schema (via `@benokit/js-cjsl`) used for input/output validation
- **`data`** — named data blobs; used to define service interfaces and implementations
- **`service`** — binds an interface (data element) to an implementation (data element)

Elements are loaded at startup via `loadElements(paths)` from `core/elements-loader` and registered globally. Services are invoked via `execute(serviceId, methodName, input)` from `core/service`, which validates input against the interface schema before dispatching.

## Schema syntax (compact JSON Schema / CJSL)

| Notation | Meaning |
|---|---|
| `"!field"` | required field |
| `"field"` | optional field |
| `"!field="` | required field with fixed value |
| `"@schemaId"` | reference to another schema element |
| `"field[]"` | array field |
| `"field{}"` | map field |
| `"$data#1": [...]` | one-of (discriminated union) |
| `"data#&": [s1, s2]` | allOf (merged schemas) |

## Implementation layout

```
implementation/
  core/                          # Framework runtime
    src/
      elements-loader.js         # loadElements(paths) — scans dirs for .eson files
      elements-registry.js       # registerElement / getElement
      service.js                 # execute(serviceId, method, input)
      schema.js                  # validateSchema — wraps ajv + CJSL
      data.js                    # getData / getDataOfKind
    elements/
      types.eson                 # Schema definitions for element types
      data-service.eson          # Built-in `data` service (getData, getDataOfKind)

  infrastructure/
    README.md                    # Service interface reference
    entity-database/             # Generic document store (CRUD + businessKey)
    http-server/                 # HTTP server (Express); routes from `endpoint` data elements
    sequence-generator/          # Monotonic integer counters per named sequence
    mongodb-client/              # Shared MongoDB connection (connect/disconnect/getCollection)
```

## Implementation patterns

### Defining a service

1. Declare input/output schemas and an interface data element in an `.eson` file.
2. Declare an implementation data element mapping method names to either:
   - `low` — direct JS function call: `{ "module": "pkg/path", "functionName": "fn" }`
   - `service` — delegate to another service: `{ "id": "svc", "method": "m" }`
   - a pipeline array for multi-step methods
3. Declare a `service` element referencing the interface and implementation.

### Implementation pipelines

A method implementation can be an array of steps. Each step may have:
- `inputMap` — lambdajson expression mapping context to step input (`#.input` = pass-through)
- `outputMap` — lambdajson expression mapping step output
- `name` — stores step output in context under this key for later steps
- Control flow: `if/then/else`, `switch`, `forEach`, `try/catch`, `throw`, `return`, `set`
- `execute` — executes its value (a single item or pipeline array) inline, passing the current input (after `inputMap`) as context. Primarily useful with `dynamic` to inject pipelines at runtime.
- `dynamic` — lambdajson expression evaluated against the full context; its result is merged into the item (overriding any same-named keys) with `dynamic` removed, and the merged item is then executed as a normal static step. `inputMap` and `outputMap` on the outer item are not part of the dynamic object — they are resolved in the static execution phase after the merge. Use this to select a service, method, or any other item property at runtime based on context.

### JS modules (low-level functions)

Low-level functions receive a single plain object argument and return a value (or throw a string on error). They are imported dynamically by the runtime via `item.low.module`.

## Running tests

Tests use **Mocha + Chai**. Each infrastructure package has its own `package.json` with `"test": "mocha --exit"`.

MongoDB-dependent tests require a running instance. Start one with:
```
docker compose -f environments/docker-compose.yml up -d
```
Default URL: `mongodb://admin:password@localhost:27017/admin` (override via `MONGODB_URL` env var). Tests skip gracefully when MongoDB is unreachable.

## Key conventions

- `.eson` files contain arrays of element objects (or a single object).
- `!` prefix on a schema key = required field.
- Service errors are thrown as strings (not Error objects).
- `entity-record` shape: `{ id, businessKey, version, data }` — `id` and `businessKey` both uniquely identify a document within a collection. `businessKey` is a required non-empty string on create.
- Optimistic concurrency: `update` and `delete` require `version` and fail if it doesn't match.
