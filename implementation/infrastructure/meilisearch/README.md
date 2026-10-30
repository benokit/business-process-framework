# meilisearch

Meilisearch [search engine](../../framework/search/README.md): kind `meilisearch-engine`, instance `default-meilisearch-engine`. It connects in `start` with its settings (`url`, default `http://localhost:7700`, override with `BPF__meilisearch_engine__url`, and `apiKey`). Indexes use `id` as primary key; every write waits for its task to finish.

`$func/meilisearch-string` quotes and escapes a value for a Meilisearch filter, so a value from input can't change the filter. `$func/meilisearch-filter` translates a filter tree, with paths into the document (`#.ownership.region`), to a Meilisearch filter: `$eq`, `$neq`, `$includes` (a collection path holds a value, or a path is one of a list), `$and`, `$or` and `$not`; anything else is `invalid`. The attributes must be filterable. Meilisearch compares strings without case, so values compared this way should be lowercase.

The `rows` of a search request is such a tree: the engine translates it and applies it besides `filter`.

A [search query](../../framework/search/README.md) implemented for Meilisearch:

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
