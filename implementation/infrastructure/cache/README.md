# cache

Kind `in-memory-cache`, instance `local-l1`: `get({ key })` → `{ found, value? }`, `set({ key, value })`. Each instance has its own store.

Keyword `withCache` (an `execution-node-wrapper`): its value is the pipeline that computes the value on a miss, run in the caller's context.

```json
{
    "withCache": { "invoke": "user-profile", "operation": "load" },
    "cache": "local-l1",
    "key": { "$join": { "_strings": ["user-profile/", "#.input.userId"] } },
    "validate": { "$eq": ["#.cached.revision", "#.input.revision"] }
}
```

| Field | Required | Description |
|---|---|---|
| `cache` | yes | Id of the cache element |
| `key` | yes | Mapping over `#.input` and `#.self` of the caller; the cache key |
| `validate` | no | Mapping over `#.cached`, `#.input`, `#.self`; `false` recomputes. Default: valid |

`key` and `validate` don't see the caller's earlier outputs: compute what they need into `#.input` with an `inputMap` on the node.
