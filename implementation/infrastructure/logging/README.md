# logging

Structured JSON logging. Writes log entries to stdout (or stderr for `error`/`fatal` levels).

## `logging` service

| Method | Key input fields                    | Returns |
|--------|-------------------------------------|---------|
| `log`  | `message`, `level?`, `context?`     | `null`  |

Each entry is written as a single JSON line with the fields: `timestamp`, `level`, `message`, and any additional fields from `context` merged in at the top level.

`level` defaults to `'info'`. Supported levels: `trace`, `debug`, `info`, `warn`, `error`, `fatal`. Entries at `error` or `fatal` go to stderr; all others go to stdout.

## `log` pipeline keyword

This package registers an [execution node template](../../core/README.md#execution-node-templates) that adds `log` as a first-class pipeline keyword:

```json
{ "log": "something happened" }
```

```json
{ "log": "payment failed", "level": "warn", "context": { "orderId": "..." } }
```

| Field     | Required | Description                              |
|-----------|----------|------------------------------------------|
| `log`     | yes      | Log message string                       |
| `level`   | no       | Log level (default `info`)               |
| `context` | no       | Object merged into the log entry as-is   |

The node's output is `null`; it is purely a side effect. Named captures work as expected:

```json
{ "name": "logged", "log": "step completed", "level": "debug" }
```
