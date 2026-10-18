# http-server

Express HTTP server. Instance `http-server` (kind `express-http-server`) listens in its `start` hook on `port`, or the `http.port` app config (default 3000, `BPF__http__port`), and closes in `stop`. It starts last. `address()` → `{ port }`.

## http-endpoint

Each endpoint registers its route in its own `start` hook. Per request, the server invokes the endpoint's `handle` with `{ headers, params, query, body }`:

1. binds the `request` context (`{ correlation, receivedAt }`; `correlation` from `x-correlation-id`, or new), which this kind manages (P13), and `trace` (`{ correlation }`), which it manages as an `entry-point`;
2. runs the `requestMiddleware` slot around the action;
3. the action maps the request with `request` (default `#.body`), invokes the target, and maps `{ output, request }` with `response` (default `{ "body": "#.output" }`).

```json
{
    "id": "read-item",
    "kind": "http-endpoint",
    "data": {
        "method": "GET",
        "path": "/items/:id",
        "target": { "element": "items", "operation": "read" },
        "request": { "id": "#.params.id" },
        "response": { "headers": { "ETag": "#.output.revision" }, "body": "#.output" }
    }
}
```

A response is `{ status? (200), headers?, body? }`. A `CoreError` maps to a status by code (`invalid` 400, `unauthorized` 401, `forbidden` 403, `not-found` 404, `conflict` 409, else 500), with body `{ error: { code, message } }`.

## Request middleware

Fills of `http-endpoint`'s `requestMiddleware` slot (or of one endpoint's). A method receives the request as `#.input`; `{ "next": true }` continues with it (an `inputMap` changes it) and returns the response; not calling `next` short-circuits. Ordered like any slot (`position`, `after`, `before`).

```json
{
    "kind": "slot-fill",
    "data": {
        "target": "http-endpoint",
        "slot": "requestMiddleware",
        "position": "first",
        "value": { "if": "#.input.headers.x-block", "then": { "set": { "status": 403 } }, "else": { "next": true } }
    }
}
```
