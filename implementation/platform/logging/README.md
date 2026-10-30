# logging

Kind `logger`, instance `logging`: `log({ message, level?, context? })` writes one JSON line (`timestamp`, `level`, `message`, plus `context` fields, which can't override those three) to stdout, or stderr for `error` and `fatal`. Levels: `trace`, `debug`, `info` (default), `warn`, `error`, `fatal`.

Keyword `log` (an `execution-node-template`); its output is `null`:

```json
{ "log": { "$str": ["payment failed: ", "#.input.reason"] }, "level": "warn", "context": { "orderId": "#.input.orderId" } }
```

`log` and `context` are mappings over the node (`#.input` is the node's input), so a plain string is logged as written; `level` is one of the levels as written.
