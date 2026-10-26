# cache

Kind `in-memory-cache` (`{ ttl?, maxEntries? }`): `get({ key })` → `{ found, value? }`, `set({ key, value })`, `evict({ key })`. Each instance has its own store in each running process.

- `ttl` in milliseconds; without it entries don't expire. An expired entry is removed when it is read.
- `maxEntries` (default 10000) bounds the store: a `set` beyond it removes the least recently used entry, so expired entries nobody reads again are removed too.

Keyword `withCache` (an `execution-node-wrapper`): its value is the pipeline that computes the value on a miss, run in the caller's context.

```json
{ "inputMap": { "businessKey": "#.claims.sub" }, "withCache": { "invoke": "user", "operation": "read" }, "cache": "user-cache", "key": "#.input.businessKey" }
```

| Field | Required | Description |
|---|---|---|
| `cache` | yes | Id of the cache element |
| `key` | yes | Mapping over `#.input` and `#.self` of the caller; the cache key |

`key` doesn't see the caller's earlier outputs: compute what it needs into `#.input` with an `inputMap` on the node.

## Invalidation

A cached value is stale once its source changes. Evict the key when the change is committed, in every process that holds the cache: a [`broadcast`](../../framework/messaging/README.md) consumer of the source's events calls `evict`. Evicting inside the writing transaction is too early: a concurrent reader can cache the old value again before the commit. `ttl` bounds what eviction misses (events published while a process was disconnected, a read racing the eviction) and is the only invalidation for sources that publish no events. [oauth](../../framework/oauth/README.md) caches user records this way.
