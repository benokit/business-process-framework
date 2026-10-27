# meilisearch

Meilisearch [search engine](../../framework/search/README.md): kind `meilisearch-engine`, instance `default-meilisearch-engine`. It connects in `start` with its settings (`url`, default `http://localhost:7700`, override with `BPF__meilisearch_engine__url`, and `apiKey`). Indexes use `id` as primary key; every write waits for its task to finish.

`$func/meilisearch-string` quotes and escapes a value for a Meilisearch filter, so a value from input can't change the filter. A [search query](../../framework/search/README.md) implemented for Meilisearch:

```json
{
    "kind": "slot-fill",
    "data": {
        "target": "parties-by-type-search-query",
        "slot": "implementations",
        "value": {
            "provider": "meilisearch-engine",
            "implementation": {
                "inputMap": { "query": "#.input.generalSearch", "filter": { "$str": ["partyType = ", { "$func/meilisearch-string": "#.input.partyType" }] } },
                "invoke": "party-search-index",
                "operation": "search"
            }
        }
    }
}
```
