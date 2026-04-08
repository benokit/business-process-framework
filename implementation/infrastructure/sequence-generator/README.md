# sequence-generator

Monotonically increasing integer counter per named sequence. Backed by native PostgreSQL sequences, created on first use.

## Methods

| Method | Key input fields | Returns             |
|--------|------------------|---------------------|
| `next` | `sequence`       | `{ value: number }` |

## `nextFromSequence` pipeline keyword

Fetches the next value from a named PostgreSQL sequence and returns it as a number.

```json
{ "nextFromSequence": "invoice-number" }
```

The keyword value is the sequence name (a string). The node output is the next integer value from that sequence.
