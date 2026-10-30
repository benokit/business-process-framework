# Business Process Framework

A declarative framework for building backend systems from JSON elements. Business logic lives in `.eson` files that are easy to read, diff, version and audit; JavaScript is reserved for effects at the edges.

## Core idea

Everything is an **element**: `{ id, kind, data }`. The **kind** is the abstraction. A kind is itself an element that declares the shape of its instances, their operations, open contribution points (slots), the context they may bind, and their lifecycle. Kinds extend kinds, and `kind` is the kind of all kinds.

```json
{ "id": "order", "kind": "entity-type", "data": { "traits": { "body": { "schema": { "!amount": "number" } } } } }
```

## Building blocks

- **Operations** are pipelines of nodes: invoke, transform, branch, iterate, handle errors. Mappings are pure LambdaJSON trees; effects are nodes, and `low` nodes call JavaScript.
- **Interfaces**: an abstract kind declares operation contracts and its subkinds implement them. Code references `{ "instanceOf": "message-broker" }` rather than a specific broker, and the application decides which instance that is.
- **Slots** let packages contribute behaviour to kinds they don't own (guards, reactions, request middleware, search indexes), ordered declaratively.
- **Scoped context**: values such as the user, the transaction and the correlation are bound for a subtree, only by the kind that manages them, and seen by all code running in that subtree.
- **Schemas** in a compact notation check element shapes and operation contracts.
- **Lifecycle**: elements load, start in a declared order (databases first, entry points last) and stop in reverse.
- **Validation** of a whole application runs on demand, never on start.

## Packages

| | |
| --- | --- |
| [Core](implementation/core/README.md) | Elements, kinds, schemas, pipelines, slots, context, lifecycle, validation |
| [Infrastructure](implementation/infrastructure/README.md) | PostgreSQL, transactions, HTTP server, NATS, transactional outbox, Meilisearch, cache, logging |
| [Framework](implementation/framework/README.md) | Databases, messaging, entities and their traits, events, relations, search, security, users, OAuth authentication |
| [Server](implementation/server/README.md) | Starts an application |
| [Tools](implementation/tools/README.md) | `bpf`: validation and discovery of an application |
| [Demo](demo/README.md) | An insurance application |
