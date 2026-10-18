# logging

Kind `logger`, instance `logging`: `log({ message, level?, context? })` writes one JSON line (`timestamp`, `level`, `message`, plus `context` fields, which can't override those three) to stdout, or stderr for `error` and `fatal`. Levels: `trace`, `debug`, `info` (default), `warn`, `error`, `fatal`.

Keyword `log` (an `execution-node-template`); its output is `null`:

```json
{ "log": "payment failed", "level": "warn", "context": { "orderId": 7 } }
```

`context` is configuration, taken as written.
