# meilisearch

Meilisearch [search engine](../../framework/search/README.md): kind `meilisearch-engine`, instance `meilisearch`. It connects in `start` with the `meilisearch` app config (`{ url, apiKey }`, default `http://localhost:7700`, override with `BPF__meilisearch__url`). Indexes use `id` as primary key; every write waits for its task to finish.
