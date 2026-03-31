# middleware

Generic middleware runner. Executes an ordered list of middlewares before invoking a final action.

## middleware-runner

A reusable `executable` data element that chains middlewares and calls an action when the list is exhausted.

### Input

| Field | Type | Description |
|---|---|---|
| `middlewares` | `object[]` | Ordered list of middleware data elements |
| `action` | `object` | Pipeline node to execute after all middlewares pass |
| `input` | `object` | The request/payload forwarded to the action |
| `context` | `object?` | Arbitrary context object (e.g. endpoint id, tenant) passed to every middleware |

Each middleware receives `{ context, input, next }`, where `next` is a node that continues the chain.

## middleware-wrap

Collects all middleware elements of a given kind, sorts them by `ordering`, and returns a resolved pipeline node that wraps the provided `action`. The caller is not responsible for gathering middlewares.

### Input

| Field | Type | Description |
|---|---|---|
| `middlewareKind` | `string` | The `kind` used to query middleware elements |
| `action` | `object` | Pipeline node to invoke after all middlewares pass |
| `context` | `object?` | Arbitrary context object forwarded to every middleware |

### Returns

A pipeline node (ready to `execute`) that, when called with any `input`, runs through the collected middlewares and then calls `action`.

### Usage

```json
{
    "name": "wrappedAction",
    "inputMap": {
        "middlewareKind": "my-middleware",
        "action": { "\\$literal": { "service": { "id": "my-service", "method": "handle" } } },
        "context": "#.input.context"
    },
    "executeRef": "middleware-wrap"
},
{
    "inputMap": "#.input.request",
    "execute": "#.wrappedAction"
}
```

### Middleware element shape (`middleware-runner`)

```json
{
    "type": "data",
    "id": "my-middleware",
    "kind": "middleware",
    "data": {
        "ordering": 10,
        "implementation": [
            {
                "inputMap": "#.input.input",
                "execute": "#.input.next"
            }
        ]
    }
}
```
