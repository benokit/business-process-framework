# sequence-generator

Monotonically increasing integer counter per named sequence. Backed by native PostgreSQL sequences, created on first use.

## Methods

| Method | Key input fields | Returns             |
|--------|------------------|---------------------|
| `next` | `sequence`       | `{ value: number }` |
