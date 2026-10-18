# implementation-new

The rewrite alongside [implementation](../implementation): packages move here one by one ([refactoring plan](../design/refactoring-plan.md), phase 4); the old tree is deleted with the last one.

| Package | Purpose |
|---|---|
| [core](core/README.md) | kinds, schemas, pipelines, slots, context, lifecycle, validation |
| [infrastructure](infrastructure/README.md) | logging, cache, postgresql, sequence-generator |

```sh
npm install
npm test
npx eslint .
```
