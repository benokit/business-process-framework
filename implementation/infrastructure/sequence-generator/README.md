# sequence-generator

Kind `sequence-generator`, instance `sequences`: `next({ sequence })` → `{ value }`, through the [query](../../framework/database/README.md#queries) `next-sequence-value`. Names allow letters, digits, `_` and `-`. A sequence counts from 1 and may leave gaps; numbering that must be gapless needs a counter written in the transaction. Implementation: [sequence-generator-postgresql](../sequence-generator-postgresql/README.md).

Keyword `nextFromSequence`: its output is the next value.

```json
{ "outputKey": "number", "nextFromSequence": "invoice-number" }
```
