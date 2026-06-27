# server

Bootstrap entry point for the framework application.

## bootstrap.js

Startup sequence:

1. Glob all `node_modules/@business-framework/*/elements` directories and any paths passed as CLI arguments, then call `loadElements`.
2. Execute every `on-startup` element in load order.
3. Ensure the admin user exists (`ADMIN_USERNAME` / `ADMIN_PASSWORD` / `ADMIN_EMAIL`, defaults `admin` / `admin` / `admin@localhost`).
4. Start the HTTP server on `PORT` (default `3000`).

Shutdown on `SIGTERM` / `SIGINT` stops the HTTP server gracefully.

## on-startup kind

Any element with `kind: "on-startup"` is executed once during step 2, before the HTTP server opens. Use it to perform warm-up work that depends on loaded elements — configuring external services, seeding data, validating state, etc.

```json
{
    "kind": "on-startup",
    "data": [
        { "..." : "pipeline nodes" }
    ]
}
```

`data` is a standard pipeline (a single node or an array of nodes). It receives an empty input `{}` and runs with an empty context. The startup items run sequentially in the order elements were loaded; if any item throws the process exits with a non-zero code.
