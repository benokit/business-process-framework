# http-server

Express HTTP server. Instance `http-server` (kind `express-http-server`) listens in its `start` hook on its `port` setting (default 3000, `BPF__http_server__port`), and closes in `stop`. It starts last. `address()` → `{ port }`.

## http-endpoint

Each endpoint registers its route in its own `start` hook. Per request, the server invokes the endpoint's `handle` with `{ headers, params, query, body }`:

1. binds the `trace` context (`{ correlation }`, from `x-correlation-id` or new), which it manages as an `entry-point`;
2. runs the `requestMiddleware` slot around the action;
3. the action maps the request with `request` (default `#.body`), invokes the target, and maps `{ output, request }` with `response` (default `{ "body": "#.output" }`).

The target's operation must exist, and a `GET` endpoint's target changes nothing: `validate()` reports one with `write` or `irreversible` [effects](../../core/README.md#effects), with the trace.

Every endpoint states what it does for authorization: `operation`, a mapping from the request to the logical operation it performs, or `public: true`; `validate()` reports an endpoint with neither or both. [authorization](../../framework/authorization/README.md) defines and enforces operations.

```json
{
    "id": "read-item",
    "kind": "http-endpoint",
    "data": {
        "method": "GET",
        "path": "/items/:id",
        "target": { "element": "items", "operation": "read" },
        "operation": { "area": "items", "resource": "item", "action": "read" },
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
