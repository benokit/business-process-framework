# cache

In-memory L1 cache service and `withCache` pipeline keyword.

## `local-l1`

An in-process Map-backed cache. Entries persist for the lifetime of the process.

| Method | Input                     | Returns                          |
|--------|---------------------------|----------------------------------|
| `get`  | `{ key: string }`         | `{ found: false }` or `{ found: true, value }` |
| `set`  | `{ key: string, value? }` | —                                |

## `withCache` pipeline keyword

```json
{
    "withCache": {
        "cache": "local-l1",
        "key": { "$join": { "_strings": ["user-profile/", "#.input.userId"], "_separator": "" } },
        "validate": { "$eq": ["#.cached.revision", "#.input.revision"] },
        "compute": { "service": "user-profile", "method": "load" }
    }
}
```

| Field      | Required | Description |
|------------|----------|-------------|
| `cache`    | yes      | Id of the cache service to use |
| `key`      | yes      | LambdaJSON expression evaluated against the pipeline context; result is the cache key string |
| `validate` | no       | LambdaJSON expression evaluated with `#.cached` = the stored value plus the full pipeline context; returns boolean — `false` triggers recompute. Defaults to always valid |
| `compute`  | yes      | Pipeline node or array executed on cache miss or failed validation; its result is stored and returned |

`inputMap` and `outputMap` on the outer `withCache` node are applied by the standard executor before and after the template runs.
