# Business Process Framework

## Architecture

The framework is built around **elements** — typed, declarative JSON objects loaded from `.eson` files. There are three element types:

- **`schema`** — compact JSON Schema (via `@benokit/js-cjsl`) used for input/output validation
- **`data`** — named data blobs; used to define service interfaces and implementations
- **`service`** — binds an interface (data element) to an implementation (data element)

Elements are loaded at startup via `loadElements(paths)` from `core/elements-loader` and registered globally. Services are invoked via `execute(serviceId, methodName, input, _ctx?)` from `core/service`, which validates input against the interface schema before dispatching. `_ctx` is an optional shared context object (default `{}`) that propagates through the entire execution graph — across service calls, pipelines, and control flow structures.

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
      service.js                 # execute(serviceId, method, input, _ctx?)
      schema.js                  # validateSchema — wraps ajv + CJSL
      data.js                    # getData / getDataOfKind
    elements/
      types.eson                 # Schema definitions for element types
      data-service.eson          # Built-in `data` service (getData, getDataOfKind)

  infrastructure/
    README.md                    # Navigation index — links to per-package READMEs
    entity-database/             # Generic document store (CRUD + businessKey); PostgreSQL, single `entities` table
    http-server/                 # HTTP server (Express); routes from `endpoint` data elements
    sequence-generator/          # Monotonic integer counters per named sequence; native PostgreSQL sequences
    postgres-client/             # Shared PostgreSQL connection pool (connect/disconnect/getPool)
    transaction/                 # PostgreSQL-backed transactions; inTransaction pipeline keyword
    messaging/                   # Broker-agnostic messaging facade (publish/startConsuming/stopConsuming)
    messaging-nats/              # NATS JetStream broker implementation
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
- Control flow: `if/then/else`, `switch`, `forEach`, `try/catch/finally`, `throw`, `return`, `set`
- `execute` — executes its value (a single item or pipeline array) inline, passing the current input (after `inputMap`) as context. Primarily useful with `dynamic` to inject pipelines at runtime.
- `dynamic` — lambdajson expression evaluated against the full context; its result is merged into the item (overriding any same-named keys) with `dynamic` removed, and the merged item is then executed as a normal static step. `inputMap` and `outputMap` on the outer item are not part of the dynamic object — they are resolved in the static execution phase after the merge. Use this to select a service, method, or any other item property at runtime based on context.
- **custom keywords** — any keyword defined by a registered `execution-node-template` data element (see [Execution node templates](#execution-node-templates)).

#### Pipeline context and node input shape

The pipeline context always has the shape `{ _ctx, input, ...namedSteps }`:

- `_ctx` — shared object that propagates through the whole execution graph (initialized to `{}` at the top-level `execute` call). Mutations to `_ctx` are visible immediately to all subsequent steps and to nested service calls.
- `input` — the method input as passed to `execute`.
- `namedSteps` — results of previous steps that had a `name`.

Every node executor receives a `{ _ctx, input }` object:

- **Without `inputMap`**: the node receives the full context (`_ctx`, `input`, and all named steps).
- **With `inputMap`**: the mapping expression is evaluated against the full context; its result is wrapped as `{ _ctx: context._ctx, input: <mapped result> }`. Inside that node (and for `service` calls it delegates to), `#.input` refers to the mapped result.

#### `set` merge behaviour

When a `set` step uses `name` and a property with that name already exists in the context **as a plain object**, the result is **merged** into the existing value (lodash deep merge) rather than replaced. This enables incremental accumulation of properties under a single name across multiple steps.

This is the standard way to write to `_ctx`:

```json
{ "name": "_ctx", "set": { "transaction": "#.txn" } }
```

Because `_ctx` is always a plain object, subsequent `set` steps targeting `_ctx` will always merge.

### JS modules (low-level functions)

Low-level functions receive a single `{ _ctx, input, ...namedSteps }` argument (the full pipeline context, or `{ _ctx, input }` when an `inputMap` is present) and return a value (or throw a string on error). They are imported dynamically by the runtime via `item.low.module`. The function can read `_ctx` to access cross-cutting state (e.g. a transaction session ID) and `input` to access the method-level input.

### Execution node templates

A `data` element with `meta.kind = "execution-node-template"` registers a new pipeline keyword. See [core/README.md](implementation/core/README.md#execution-node-templates) for the full spec. In brief:

```json
{
    "type": "data",
    "id": "my-node-template",
    "meta": { "kind": "execution-node-template" },
    "data": {
        "keyword": "myKeyword",
        "implementation": [ ... ]
    }
}
```

The template's `implementation` receives `{ _ctx, input, node }` where `input` is the node's input after `inputMap` and `node` is the full pipeline item. `inputMap`/`outputMap` are handled externally and are not the template's concern. The `transaction` package uses this to provide the `inTransaction` keyword — see [transaction/README.md](implementation/infrastructure/transaction/README.md#intransaction-pipeline-keyword).

## LambdaJSON internals

Source: `implementation/node_modules/lambdajson-js/src/` (`js-compiler.js`, `primitives.js`).

### Context and references

- `"#"` — entire input value
- `"#.field"` / `"#.a.b"` — lodash path into input (lodash `get`)
- `"@name"` — read a variable from the `$let` scope
- `"\\literal"` — escape: produces the string `literal` verbatim

### Expression classification (compiler decision tree)

An object is compiled as one of three forms, checked in order:

1. **Primitive** — ≤2 keys, ALL keys are registered primitives (e.g. `$head`, `$filter`, `$let`+one other primitive). Handled by `compilePrimitive`.
2. **Function call** — ≤2 keys, ALL keys start with `$`, but NOT all are registered primitives (i.e. the non-`$let` key is a `$let`-defined operator). Handled by `compileFunction`; looks up the operator in the current `$let` vars at runtime.
3. **Plain object** — everything else. Compiled key-by-key; `$`-prefixed keys have no special meaning here — `$let` defined in a plain object does NOT propagate to sibling keys.

### `$let` scope rules

`$let` only propagates its vars to sibling expressions when the object is classified as a **Primitive** or **Function call** (cases 1–2 above). The correct pattern is always `{ "$let": {...}, "$someOperator": ... }` with exactly two keys.

`$`-prefixed keys in `$let` store the compiled function unevaluated (making it callable as an operator); non-`$`-prefixed keys are evaluated immediately and stored as values (accessible via `@name`).

### Defining a reusable operator with `$let`

```json
{
    "$let": { "$fallback": { "$head": { "$filter": { "_predicate": "#", "_collection": "#" } } } },
    "$in": {
        "field1": { "$fallback": ["#.preferred", "#.default"] },
        "field2": { "$fallback": ["#.preferred", "#.default"] }
    }
}
```

`$in` (and `$return`) are identity primitives — they pass the value through unchanged. They exist specifically to pair with `$let` when the output is an object literal rather than a single primitive call.

**`_fn` is NOT a standalone lambda.** It is only a named argument key used inside specific primitives (`$map`, `$apply`, etc.) via `parsePrimitiveArgs`. Defining `{ "_fn": { ... } }` in `$let` compiles to an object, not a callable function.

### Available primitives (selected)

| Primitive | Signature | Notes |
| --- | --- | --- |
| `$head` | `array → first` | First element |
| `$tail` | `array → rest` | All but first |
| `$filter` | `{ _predicate, _collection? }` | `_predicate` receives each element as `#` |
| `$map` | `{ _fn, _over? }` | `_fn` receives each element as `#.` sub-fields |
| `$let` | — | Variable scope declaration; always paired with another `$` key |
| `$in` / `$return` | passthrough | Identity; used to pair with `$let` for object output |
| `$apply` | `{ _fn, _to? }` | Applies `_fn` to result of `_to` |
| `$` | expression | Creates a closure: `v => expr(v)` |

## Documentation structure

READMEs are organised as a directed graph. Each level owns a specific scope; detail lives at the lowest relevant node.

### Philosophy — rules to follow when writing or updating docs

1. **One owner per fact.** Each piece of information lives in exactly one README. All other files that need to reference it use a markdown link — never copy the prose.
2. **Detail at the leaf, summary at the root.** Package READMEs contain full detail. Index READMEs (`infrastructure/README.md`, `business/README.md`) contain only a table with one-line descriptions and links.
3. **No duplicate examples.** If a pattern repeats (e.g. multiple event-handler hooks), document it once with a table of variants and a single representative example.
4. **Update the owner, not the reference.** When a feature changes, update the owning README. Any referencing README that links to it automatically stays correct.
5. **Add a per-package README for every new package** — even a minimal one (method table + one-liner). Add a row to the parent index at the same time.

## Running tests

Tests use **Mocha + Chai**. Each infrastructure package has its own `package.json` with `"test": "mocha --exit"`.

PostgreSQL-dependent tests require a running instance. NATS-dependent tests require NATS with JetStream. Both skip gracefully when unavailable. Start all infrastructure with:
```
docker compose -f environments/docker-compose.yml up -d
```

- PostgreSQL default: `postgresql://admin:password@localhost:5432/app` (override via `POSTGRES_URL`)
- NATS default: `nats://localhost:4222` (override via `NATS_URL`)

## Key conventions

- `.eson` files contain arrays of element objects (or a single object).
- `!` prefix on a schema key = required field.
- Service errors are thrown as strings (not Error objects).
- `entity-record` shape: `{ id, businessKey, revision, data, state }` — `id` and `businessKey` both uniquely identify a document within a collection. `businessKey` is a required non-empty string on create. `state` is a separate JSONB field decoupled from `data`, defaults to `{}`.
- Optimistic concurrency: `update` and `delete` require `revision` and fail if it doesn't match.
