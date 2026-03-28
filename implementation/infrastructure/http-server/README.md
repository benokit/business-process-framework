# http-server

Express HTTP server. On `start`, all `http-endpoint` data elements are loaded and registered as routes. Each endpoint maps an HTTP method + path to a service method.

## Methods

| Method  | Key input fields | Returns            |
|---------|------------------|--------------------|
| `start` | `port?`          | `{ port: number }` |
| `stop`  | —                | `{}`               |

## http-endpoint data elements

```json
{
    "type": "data",
    "id": "create-order",
    "kind": "http-endpoint",
    "data": {
        "method": "POST",
        "path": "/orders",
        "controller": { "service": "entity", "method": "create" }
    }
}
```

## http-middleware data elements

Middlewares are executed in ascending `ordering` before the endpoint controller. Each middleware receives `{ endpointId, httpRequest, next }` as input, where `next` is a pipeline node that continues the chain (and ultimately calls the controller).

```json
{
    "type": "data",
    "id": "error-handler",
    "kind": "http-middleware",
    "data": {
        "ordering": 10,
        "implementation": [
            {
                "try": {
                    "inputMap": "#.input.httpRequest",
                    "execute": "#.input.next"
                },
                "catch": {
                    "throw": "#.error"
                }
            }
        ]
    }
}
```
