# implementation

The framework packages.

| Package | Purpose |
|---|---|
| [core](core/README.md) | kinds, schemas, pipelines, slots, context, lifecycle, validation |
| [framework](framework/README.md) | database, messaging, entities, entity-events, entity-relations, entities-http, search, entity-search, entity-search-http, security, users, authorization-basic |
| [server](server/README.md) | Starts an application from the installed packages; `on-startup` |
| [tools](tools/README.md) | `bpf-validate`: on-demand validation of an application |
| [infrastructure](infrastructure/README.md) | logging, cache, postgresql, sequence-generator, transaction, http-server, messaging-nats, transactional-outbox, meilisearch |

The demo application is in [demo](../demo/README.md).

```sh
npm install
npm test
npx eslint .
npx bpf-validate ../demo
```
