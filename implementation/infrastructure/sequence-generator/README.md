# sequence-generator

Kind `sequence-generator`, instance `sequences`: `next({ sequence })` → `{ value }`, from a PostgreSQL sequence created on first use. Names allow letters, digits, `_` and `-`. Needs the [postgresql](../postgresql/README.md) element started.

Keyword `nextFromSequence`: its output is the next value.

```json
{ "outputKey": "number", "nextFromSequence": "invoice-number" }
```
