# implementation

The framework packages.

| Package | Purpose |
|---|---|
| [core](core/README.md) | kinds, schemas, pipelines, slots, context, lifecycle, validation |
| [platform](platform/README.md) | integration, database, messaging, search, security, data-structures, transaction, sequence-generator, transactional-outbox, cache, logging, http-server |
| [adapters](adapters/README.md) | the bindings of a technology: postgresql, messaging-nats, meilisearch and the `-postgresql` and `-http` packages |
| [test-framework](test-framework/README.md) | tests as elements: scenarios and the fakes they run on |
| [entity](entity/README.md) | entities and the traits and features on them: states, versions, ownership, row access, events, relations, search |
| [services](services/README.md) | authorization, users, oauth |
| [server](server/README.md) | Starts an application from the installed packages; `on-startup` |
| [tools](tools/README.md) | `bpf`: validation and discovery of an application |

A package depends on its own group or on one to its left: `core` ← `platform` ← `adapters` ← `entity` ← `services`; only tests may reach back to an adapter. The `test-framework` is used by tests only and depends on `core` and on what it fakes.

The demo application is in [demo](../demo/README.md).

```sh
npm install
npm test
npm run test:quick
npx eslint .
npx bpf validate ../demo
```
