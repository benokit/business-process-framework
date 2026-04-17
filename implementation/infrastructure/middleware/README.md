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

Sorts the provided middleware array by `ordering` and returns a resolved pipeline node that wraps the provided `action`. The caller is responsible for collecting the middleware elements beforehand.

### Input

| Field | Type | Description |
|---|---|---|
| `middlewares` | `object[]` | Array of middleware data elements to wrap with |
| `action` | `object` | Pipeline node to invoke after all middlewares pass |
| `context` | `object?` | Arbitrary context object forwarded to every middleware |

### Returns

A pipeline node (ready to `execute`) that, when called with any `input`, runs through the sorted middlewares and then calls `action`.

### Usage

```json
{
    "outputKey": "middlewareItems",
    "getElementsOfKind": "my-middleware",
    "outputMap": "#.items"
},
{
    "outputKey": "wrappedAction",
    "inputMap": {
        "middlewares": "#.middlewareItems",
        "action": { "\\$literal": { "service": "my-service", "method": "handle" } },
        "context": "#.input.context"
    },
    "method": "middleware-wrap"
},
{
    "inputMap": "#.input.request",
    "execute": "#.wrappedAction"
}
```

### Middleware element shape (`middleware-runner`)

```json
{
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
