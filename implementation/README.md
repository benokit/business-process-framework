# implementation

The framework packages.

| Package | Purpose |
|---|---|
| [core](core/README.md) | kinds, schemas, pipelines, slots, context, lifecycle, validation |
| [framework](framework/README.md) | integration, database, messaging, entities, entities-postgresql, entity-states, entity-ownership, entity-row-access, entity-events, entity-relations, entity-relations-postgresql, entities-http, entity-states-http, search, entity-search, entity-search-http, security, authorization, users, oauth |
| [server](server/README.md) | Starts an application from the installed packages; `on-startup` |
| [tools](tools/README.md) | `bpf`: validation and discovery of an application |
| [infrastructure](infrastructure/README.md) | logging, cache, postgresql, sequence-generator, sequence-generator-postgresql, transaction, http-server, messaging-nats, transactional-outbox, transactional-outbox-postgresql, meilisearch |

The demo application is in [demo](../demo/README.md).

```sh
npm install
npm test
npx eslint .
npx bpf validate ../demo
```
