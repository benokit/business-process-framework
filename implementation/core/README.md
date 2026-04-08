# Business framework core

High level programming building blocks are called elements.
Elements are represented as JSON objects, stored in `*.eson` files.

Every element has a `data` object (with element-specific properties), and optional `id`, `kind`, and `meta` fields.

An element without an `id` is **anonymous**. Anonymous elements cannot be retrieved by id via `getElement`, but they are fully indexed by kind and appear in `getElementsOfKind` results just like named elements. This is useful for kinds that are always consumed as a collection (e.g. configuration fragments, rule sets) where individual addressability is not needed.

- `kind` — a hierarchical string tag used to classify and query elements. Hierarchy levels are separated by `/` (e.g. `"entity-component/on-update"`). Querying by a kind prefix returns all elements whose kind starts with that prefix — so `getElementsOfKind("entity-component")` returns elements with kinds `"entity-component"`, `"entity-component/on-update"`, `"entity-component/on-transition"`, etc. Elements without a `kind` are still fully functional.

## Data composition

An element's data can be provided either inline as a `data` object, or lazily via a `/data` key. When `/data` is present and `data` is absent, the value is evaluated on first access and cached.

Inside a `data` or `/data` value, three composition keywords are available:

| Keyword | Description |
| --- | --- |
| `/ref` | Embeds another element's `data` by id: `{ "/ref": "elementId" }` |
| `/merge` | Deep-merges an array of data objects: `{ "/merge": [{...}, {...}] }` |
| `/literal` | Takes the value as-is, bypassing keyword evaluation: `{ "/literal": {...} }` |

## Pipeline execution

The framework can execute any data that represents a valid pipeline — a single node object or an array of nodes. Pipelines are not tied to any specific element kind: the `service` kind uses them to implement methods, `execution-node-template` elements use them as keyword bodies, and the `method` node keyword executes a pipeline stored in any element's `data` directly.

### Nodes

A pipeline node is a plain object whose keys determine what the executor does. Available node keywords:

| Keyword | Description |
| --- | --- |
| `set` | Evaluates a lambdaJSON expression; result is the node output |
| `return` | Evaluates a lambdaJSON expression and terminates the immediate containing pipeline, returning the result. Propagates through branch nodes (`if`, `switch`, `try`) but is bounded by sub-method invocations (`service`, `method`, `execute`). |
| `exit` | Evaluates a lambdaJSON expression and terminates the entire execution stack, returning the result from the root service invocation. Propagates through all nodes including `try/catch`. |
| `service` | Calls another service. Sibling `method` is required: `{ "service": "serviceId", "method": "methodName" }` |
| `call` | Loads the element with the given id and executes its `data` as a pipeline: `{ "call": "elementId" }` |
| `getElement` | Retrieves an element by id. The keyword value is a lambdaJSON expression that evaluates to the id string: `{ "getElement": "#.input.someId" }` |
| `getElementsOfKind` | Retrieves all elements of a given kind. The keyword value is a lambdaJSON expression that evaluates to the kind string: `{ "getElementsOfKind": "my-kind" }`. Returns `{ items: [element, ...] }` |
| `low` | Calls a host JS function: `{ "module": "...", "functionName": "..." }`. The function receives `{ _ctx, input }` — see [Calling convention for `low` functions](#calling-convention-for-low-functions) |
| `execute` | Evaluates a lambdaJSON expression against the full context; the result is used as a pipeline (single node or array) to execute inline. Use `{ "$literal": <pipeline> }` to pass a static pipeline. |
| `if` / `then` / `else` | Conditional branch; `then` is required, `else` is optional |
| `switch` | Multi-branch: `{ "value": <expr>, "cases": { "<val>": <impl>, ..., "default": <impl> } }` |
| `forEach` | Applies an implementation to each element of the input array |
| `try` / `catch` / `finally` | Error handling; if `try` body throws, `catch` body executes (optional); `finally` body always executes after `try` and `catch` regardless of outcome, and its return value is discarded |
| `throw` | Evaluates a lambdaJSON expression and throws the result as an error |
| `validateSchema` | Validates the node's `input` against a CJSL schema (inline object or `"@schemaId"` reference). Throws a string error if invalid; returns `input` unchanged on success. Use `inputMap` to select which part of the context to validate |
| `getRandom` | Generates a random UUID string |
| `log` | Writes a structured log entry: `{ "log": "<message>", "level": "<level>", "context": {...} }` — registered by the `logging` package; see [`log` pipeline keyword](../infrastructure/logging/README.md#log-pipeline-keyword) |
| `publish` | Publishes a message to a channel: `{ "publish": { "channel": "<id>", "envelope": {...} } }` — registered by the `messaging` package; see [`publish` pipeline keyword](../infrastructure/messaging/README.md#publish-pipeline-keyword) |
| `inTransaction` | Wraps a pipeline in a PostgreSQL transaction: `{ "inTransaction": [...] }` — registered by the `transaction` package; see [`inTransaction` pipeline keyword](../infrastructure/transaction/README.md#intransaction-pipeline-keyword) |
| `withCache` | Wraps pipeline execution with caching: `{ "withCache": { "cache": "<id>", "key": ..., "compute": ... } }` — registered by the `cache` package; see [`withCache` pipeline keyword](../infrastructure/cache/README.md#withcache-pipeline-keyword) |
| `nextFromSequence` | Fetches the next value from a named sequence: `{ "nextFromSequence": "<sequenceName>" }` — registered by the `sequence-generator` package; see [`nextFromSequence` pipeline keyword](../infrastructure/sequence-generator/README.md#nextfromsequence-pipeline-keyword) |

### Per-node modifiers

Any node (regardless of keyword) accepts these optional fields:

- `outputKey` — captures the node's output into the execution context under this key for use by later steps
- `inputMap` — lambdaJSON expression evaluated against the current context; its result is passed as the node's input instead of the full context
- `outputMap` — lambdaJSON expression applied to the node's raw output before it is stored or returned

A node with no executor keyword is a **pure-transform node**: it produces no side effects and its value (fed into `outputMap`, or captured by `outputKey`) is the `inputMap` result when `inputMap` is present, or the full context otherwise. This is useful for reshaping context between steps, and enables a pattern for evaluating a stored lambdaJSON expression dynamically via `execute`:

```json
{ "outputKey": "key", "execute": { "outputMap": "#.node.myKeyword.keyExpr" } }
```

`execute` evaluates the expression `{ "outputMap": "#.node.myKeyword.keyExpr" }` to produce a dynamic pipeline node whose `outputMap` is the stored expression; since that node has no executor keyword, the stored expression is evaluated against the current context and returned as the result.

### Execution context

The execution context is an object available throughout a pipeline:

- `input` — the validated input value passed to the pipeline
- `<outputKey>` — the output of any preceding pipeline node that carries an `outputKey`

All branch keywords (`if`, `switch`) pass the full context into their bodies (or the `inputMap` result if one is present). For `execute`, the expression is evaluated against the full context and the resulting pipeline runs with the `inputMap` result (or full context if no `inputMap`). Two special cases:

- **`forEach`**: each iteration starts a fresh context `{ input: <element> }` — named steps from the outer pipeline are not visible inside the `forEach` body.
- **`try/catch/finally`**: the `catch` body receives `{ context, error }` where `context` is the full execution context at the time of the throw and `error` is the thrown value. Outer steps captured with `outputKey` are accessible as `#.context.<outputKey>`. The `finally` body always runs after the `try`/`catch` phase with the original context; it is useful for cleanup (e.g. clearing `_ctx` state). Its return value is discarded. `catch` and `finally` are both optional, but at least one must be present.

If neither `return` nor `exit` is present, the pipeline returns the output of the last executed node.

### Mapping functions

LambdaJSON expressions are used throughout pipelines for all value computation: <https://github.com/benokit/json-programming-language>.

The context object is bound to `#`. Examples: `#.input.x` (field from pipeline input), `#.step1.value` (output of the step with `outputKey: "step1"`).

To call a host JS function as a custom lambdaJSON primitive, use the `$low` key inside any lambdaJSON expression:

```json
{
    "return": {
        "$low": { "$double": { "module": "./math.js", "functionName": "double" } },
        "$double": "#.input"
    }
}
```

`$low` registers named primitives that are available only within that expression. Each primitive wraps the host function as a unary lambdaJSON operator.

### Calling convention for `low` functions

A `low` pipeline node calls an exported JS function. The function always receives a single argument: **`{ _ctx, input }`** — the same nodeInput object the executor works with.

- `input` is the result of `inputMap` (if present on the node), otherwise the full execution context.
- `_ctx` is the shared context propagated through the execution graph.

```js
// module: ./math.js
export function double({ input }) {
    return input * 2;
}
```

```json
{ "inputMap": "#.input.value", "low": { "module": "./math.js", "functionName": "double" } }
```

If you need multiple fields, pass them via `inputMap` and destructure from `input`:

```js
export function add({ input: { a, b } }) {
    return a + b;
}
```

```json
{ "inputMap": { "a": "#.input.a", "b": "#.input.b" }, "low": { "module": "./math.js", "functionName": "add" } }
```

The function's return value becomes the node's output (before any `outputMap` is applied).

## Element kinds

The framework recognizes four built-in `kind` values that trigger automatic registration effects when elements are loaded. All other `kind` values — including the conventional `service` kind — are treated as plain data elements with no automatic side effects.

### schema

A `schema` element specifies a shape of data. Its `data` is registered as a named CJSL schema in a global runtime register from which it can be retrieved at any point for data validation. Schemas can be reused using reference by `id`.

The supported schema language is the compact schema language: <https://github.com/benokit/compact-json-schema-language>. Required fields are prefixed with `!`. Example: `{ "!name": "string", "age": "number" }`.

### service

A `service` element embodies a named, callable API — a set of methods each with a defined input/output contract and an implementation. Its `data` contains:

- `interface`: method definitions, each with `input` and `output` schemas (compact schema language). May be an inline object or an element id string.
- `implementation`: method implementations keyed by method name. May be an inline object or an element id string.

Each method's implementation is a pipeline — a single node or an array of nodes — executed by the framework's pipeline engine (see [Pipeline execution](#pipeline-execution)).

### pure-function

A `pure-function` element declares a named, reusable lambdaJSON function. Its `data` is a lambdaJSON expression in which `#` refers to the function's argument:

```json
{
    "kind": "pure-function",
    "id": "double",
    "data": { "$multiply": ["#", 2] }
}
```

Pure functions are invoked inside any lambdaJSON expression with the `$func/<id>` primitive. The value is the argument expression, which is itself evaluated as lambdaJSON before being passed to the function:

```json
{ "return": { "$func/double": "#.input.n" } }
```

All registered pure functions are globally available in every lambdaJSON expression — no import step is required at the call site. Functions are compiled lazily on first invocation and the result is cached.

### execution-node-template

An `execution-node-template` element extends the pipeline engine with a new keyword. Its `data` contains:

- `keyword`: the keyword string that activates this template in a pipeline node.
- `implementation`: a pipeline executed when the keyword is encountered.

```json
{
    "id": "my-node-template",
    "kind": "execution-node-template",
    "data": {
        "keyword": "myKeyword",
        "implementation": [ ... ]
    }
}
```

When a pipeline node carries the registered keyword, the executor runs the template's `implementation` pipeline with the following context:

| Context key | Value |
| --- | --- |
| `#.input` | The node's input — result of `inputMap`, or the full context input if no `inputMap` is present |
| `#.node` | The full pipeline node object (keyword value and any sibling properties) |
| `#._ctx` | The shared execution context |

`inputMap` and `outputMap` on the outer pipeline node are applied by the standard executor before and after the template runs; the template does not need to handle them.

For a real-world example see [`inTransaction`](../infrastructure/transaction/README.md#intransaction-pipeline-keyword) in the `transaction` package.

### injection

An `injection` element redirects element lookups at runtime — an IoC mechanism for substituting one element for another without changing the callsites.

Its `data` is an array of `{ into, inject }` pairs:

```json
{
    "kind": "injection",
    "id": "my-injections",
    "data": [
        { "into": "entity-service", "inject": "my-entity-service" }
    ]
}
```

After loading this element:

- `getElement("entity-service")` returns `my-entity-service` (the injected element).
- `getElement("/entity-service")` returns `entity-service` directly, bypassing injection. The `/` prefix is the escape hatch for direct registry access.
- `getElementsOfKind(kind)` excludes elements that are injection targets (`into` ids), so only the concrete replacements appear in listings.

## Runtime API

```js
import { loadElements }             from 'core/elements-loader';
import { execute }                  from 'core/execution';
import { getElement, getElementsOfKind } from 'core/elements-registry';

// Load all *.eson files from one or more directory trees.
await loadElements(['./elements', './app/elements']);

// Call a service method.
const result = await execute(serviceId, methodName, input);

// Retrieve a single element by id.
const element = getElement(id);

// Retrieve all elements of a given kind (or kind prefix).
// Passing a kind prefix returns all elements whose kind starts with that prefix.
const allServices  = getElementsOfKind('service');                   // { items: [...] }
const kindFiltered = getElementsOfKind('entity-component');          // exact + all children
const childrenOnly = getElementsOfKind('entity-component/on-update'); // subtree only
```

## Example

```json
{
    "kind": "service",
    "id": "math",
    "data": {
        "interface": {
            "add": {
                "input":  { "!a": "number", "!b": "number" },
                "output": "number"
            },
            "clamp": {
                "input":  { "!value": "number", "!min": "number", "!max": "number" },
                "output": "number"
            }
        },
        "implementation": {
            "add": {
                "return": { "$sum": ["#.input.a", "#.input.b"] }
            },
            "clamp": [
                { "outputKey": "lo", "set": "#.input.min" },
                {
                    "if":   { "$gt": ["#.input.value", "#.input.max"] },
                    "then": { "return": "#.input.max" },
                    "else": {
                        "if":   { "$lt": ["#.input.value", "#.lo"] },
                        "then": { "return": "#.lo" },
                        "else": { "return": "#.input.value" } }
                    }
                }
            ]
        }
    }
}
```
