# meilisearch

Meilisearch implementation of the `service/search-engine` interface.

## Elements

- `meilisearch` — `service/search-engine` implementing `configureIndex`, `deleteIndex`, `insertDocument`, `removeDocument`, `search`

## Configuration

| Key | Default | Description |
| --- | --- | --- |
| `meilisearchUrl` | `http://localhost:7700` | Meilisearch host URL |
| `meilisearchApiKey` | `""` | Master or API key (empty for no-auth dev) |
