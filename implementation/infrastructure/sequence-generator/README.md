# sequence-generator

Kind `sequence-generator`, instance `sequences`: `next({ sequence })` → `{ value }`, from a PostgreSQL sequence created on first use. Names allow letters, digits, `_` and `-`. Needs the [postgresql](../postgresql/README.md) element started. Its effect is `irreversible`: a PostgreSQL sequence never gives a number back, so a rolled-back transaction leaves a gap; numbering that must be gapless needs a counter written in the transaction.

Keyword `nextFromSequence`: its output is the next value.

```json
{ "outputKey": "number", "nextFromSequence": "invoice-number" }
```
