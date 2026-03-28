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
