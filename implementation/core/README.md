# Business framework core

High level programming building blocks are called elements.
Elements are represented as JSON objects, stored in `*.eson` files.

Elements are of three possible types:

- `schema`
- `data`
- `service`

Each element has an `id` and an optional `meta` object for identification and classification. The framework recognises one reserved property inside `meta`:

- `kind` — a string tag used to group elements within a type (e.g. all services that represent a particular category). Elements without a `kind` are still fully functional; `kind` is purely for querying.

## Schema

A `schema` element specifies a shape of data. The supported schema language is the compact schema language: <https://github.com/benokit/compact-json-schema-language>. All schemas are loaded into a global runtime register from which they can be retrieved at any point for data validation. Schemas can be reused using reference by `id`.

Required fields are prefixed with `!`. Example: `{ "!name": "string", "age": "number" }`.

## Data

A `data` element holds arbitrary data. A data element can be composed from other data elements using reserved keywords:

- `/ref`: embeds the referenced data element's value by id
- `/merge`: deep-merges an array of data objects into one
- `/literal`: takes data as-is, bypassing keyword evaluation

Data is lazily evaluated and cached on first access.

## Service

A `service` element represents a callable unit with an API and I/O side effects. It consists of:

- `interface`: method definitions, each with `input` and `output` schemas (compact schema language)
- `implementation`: method implementations keyed by method name

### Method implementation

A method implementation is either a single item or a pipeline (array of items). Available item keywords:

| Keyword | Description |
| --- | --- |
| `set` | Evaluates a lambdaJSON expression; result is the item output |
| `return` | Evaluates a lambdaJSON expression and returns it as the method output |
| `service` | Calls another service: `{ "id": "...", "method": "..." }` |
| `low` | Calls a host JS function: `{ "module": "...", "functionName": "..." }` |
| `execute` | Executes a pipeline (single item or array) inline with the current input as context; primarily useful with `dynamic` to inject pipelines at runtime |
| `if` / `then` / `else` | Conditional branch; `then` is required, `else` is optional |
| `switch` | Multi-branch: `{ "value": <expr>, "cases": { "<val>": <impl>, ..., "default": <impl> } }` |
| `forEach` | Applies an implementation to each element of the input array |
| `try` / `catch` | Error handling; if `try` body throws, `catch` body executes |
| `throw` | Evaluates a lambdaJSON expression and throws the result as an error |
| `dynamic` | Evaluates a lambdaJSON expression against the full context; the result is merged into the item (with `dynamic` removed) and the merged item is executed as a normal static item |

### Per-item modifiers

Any item (regardless of keyword) accepts these optional fields:

- `name` — captures the item's output into the execution context under this key for use by later steps
- `inputMap` — lambdaJSON expression evaluated against the current context; its result is passed as the item's input instead of the full context
- `outputMap` — lambdaJSON expression applied to the item's raw output before it is stored or returned

When `dynamic` is used, `inputMap` and `outputMap` belong to the outer item, not to the dynamic object. The `dynamic` expression is evaluated first against the full context; only then does `inputMap` (from the merged item) narrow the input for the resolved executor.

### Execution context

The execution context is an object available throughout a method's pipeline:

- `input` — the method's validated input value
- `<name>` — the output of any preceding pipeline item that carries a `name`

All branch keywords (`if`, `switch`, `execute`) pass the full context into their bodies (or the `inputMap` result if one is present). Two special cases:

- **`forEach`**: each iteration starts a fresh context `{ input: <element> }` — named steps from the outer pipeline are not visible inside the `forEach` body.
- **`try/catch`**: the `catch` body receives `{ context, error }` where `context` is the full execution context at the time of the throw and `error` is the thrown value. Outer named steps are accessible as `#.context.<name>`.

If no `return` is present, the method returns the output of the last executed item.

### Mapping functions

Pure functions are written in lambdaJSON: <https://github.com/benokit/json-programming-language>.

The context object is bound to `#`. Examples: `#.input.x` (field from method input), `#.step1.value` (output of the named step `step1`).

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

## Runtime API

```js
import { loadElements }          from 'core/elements-loader';
import { execute }               from 'core/service';
import { getElement, getElements } from 'core/elements-registry';

// Load all *.eson files from one or more directory trees.
await loadElements(['./elements', './app/elements']);

// Call a service method.
const result = await execute(serviceId, methodName, input);

// Retrieve a single element by type and id.
const element = getElement(type, id);

// Retrieve all elements of a given type, optionally filtered by meta.kind.
const allServices  = getElements('service');
const kindFiltered = getElements('service', 'my-kind');
```

## Example

```json
{
    "type": "service",
    "id": "math",
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
            { "name": "lo", "set": { "$return": "#.input.min" } },
            {
                "if":   { "$gt": ["#.input.value", "#.input.max"] },
                "then": { "return": { "$return": "#.input.max" } },
                "else": {
                    "if":   { "$lt": ["#.input.value", "#.lo"] },
                    "then": { "return": { "$return": "#.lo" } },
                    "else": { "return": { "$return": "#.input.value" } }
                }
            }
        ]
    }
}
```
