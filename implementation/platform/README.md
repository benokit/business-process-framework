# Platform

Abstractions and the technology-neutral services built on them. A package here depends only on `core` and on other platform packages; its tests may use an adapter.

| Package | Description |
| --- | --- |
| [cache](cache/README.md) | In-memory cache; `withCache` wrapper |
| [data-structures](data-structures/README.md) | General static data structures for elements and the pure functions that read them: the `hierarchy` |
| [database](database/README.md) | The abstract `database` kind, its `migrations` slot and `migrate`, queries and the `statement` keyword |
| [http-server](http-server/README.md) | Express server; `http-endpoint` kind with request middleware |
| [integration](integration/README.md) | Contracts owned by a consumer, implemented per provider kind |
| [logging](logging/README.md) | Structured JSON logging; `log` keyword |
| [messaging](messaging/README.md) | Brokers, channels, consumers; `publish` keyword |
| [search](search/README.md) | The abstract `search-engine` kind, search indexes and search queries |
| [security](security/README.md) | The principal as context: `principal-execution-node-wrapper`, `asSystem` |
| [sequence-generator](sequence-generator/README.md) | Named sequences; `nextFromSequence` keyword |
| [transaction](transaction/README.md) | Transactions as scoped context; `inTransaction` wrapper |
| [transactional-outbox](transactional-outbox/README.md) | At-least-once delivery committed with the business transaction |
