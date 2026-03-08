# Infrastructure Services

## `entity-database`

Generic document store with optimistic concurrency. Each document carries an `id`, a unique `businessKey`, a `version`, and a `data` object.

| Method   | Key input fields                                    | Returns         |
|----------|-----------------------------------------------------|-----------------|
| `create` | `collection`, `businessKey`, `data`                 | `entity-record` |
| `read`   | `collection`, `id` **or** `businessKey`             | `entity-record` |
| `update` | `collection`, `id`/`businessKey`, `version`, `data` | `entity-record` |
| `delete` | `collection`, `id`/`businessKey`, `version?`        | `entity-record` |
| `list`   | `collection`, `filter?`, `sort?`, `limit?`, `skip?` | `{ records[] }` |

`businessKey` must be a non-empty string, unique per collection. `update` and `delete` use optimistic locking via `version`.

---

## `sequence-generator`

Monotonically increasing integer counter per named sequence.

| Method | Key input fields | Returns             |
|--------|------------------|---------------------|
| `next` | `sequence`       | `{ value: number }` |

---

## `http-server`

HTTP server. On `start`, all `endpoint` data elements are loaded and registered as routes. Each endpoint maps an HTTP method + path to a service method.

| Method  | Key input fields | Returns            |
|---------|------------------|--------------------|
| `start` | `port?`          | `{ port: number }` |
| `stop`  | —                | `{}`               |

Endpoint data elements shape: `{ method, path, controller: { service, method } }`.

---

## `transaction`

MongoDB-backed transaction lifecycle. Provides two services:

### `transaction-mongodb-low`

Low-level session management. Each method operates on a MongoDB `ClientSession` identified by a UUID `sessionId`.

| Method                | Key input fields | Returns              |
|-----------------------|------------------|----------------------|
| `beginTransaction`    | `options?`       | `{ sessionId }`      |
| `commitTransaction`   | `sessionId`      | `{ sessionId }`      |
| `rollbackTransaction` | `sessionId`      | `{ sessionId }`      |

`options` is passed directly to MongoDB's `session.startTransaction()` (e.g. `{ readConcern, writeConcern }`).

### `transaction-mongodb`

High-level service. Wraps a program in a transaction: begins, executes the program, commits on success, rolls back and rethrows on failure.

| Method                 | Key input fields                       | Returns             |
|------------------------|----------------------------------------|---------------------|
| `executeInTransaction` | `program`, `programInput?`, `config?`  | result of `program` |

`program` is a single pipeline item or an array of items (same format as a service method implementation). `programInput` is passed as `#.input` to the program. `config` is passed as `options` to `beginTransaction`.

#### Nested transactions via `_ctx`

Because `_ctx` propagates through every service call in the execution graph, `executeInTransaction` stores the active session as `_ctx.transaction = { sessionId }` at the start of a transaction. Any low-level function invoked later in the same graph can then read `_ctx.transaction.sessionId` from its argument to join the active transaction:

```json
{ "name": "_ctx", "set": { "transaction": "#.txn" } }
```

This is the intended mechanism for coordinating multiple operations under a single transaction. It also enables nested `executeInTransaction` calls to detect an existing session and reuse it instead of starting a new one.

#### `inTransaction` pipeline keyword

This package also registers an [execution node template](../core/README.md#execution-node-templates) that adds `inTransaction` as a first-class pipeline keyword — a shorthand for `executeInTransaction` that requires no explicit service call:

```json
{ "inTransaction": [ ... pipeline ... ] }
```

The node's input (after `inputMap`, if present) becomes the sub-pipeline's input; the sub-pipeline's result is the node's output (`outputMap` applies as normal). Nested `inTransaction` nodes reuse the outermost transaction; sequential ones each start a fresh transaction.

> **Note:** MongoDB transactions require a replica set or sharded cluster. They are not supported on a standalone `mongod`.

---

## `messaging`

Broker-agnostic messaging framework. Concrete broker implementations are provided as separate packages that bind to the `messaging-interface`.

### Abstractions

**`message-broker`** — a `data` element with `meta.kind = "message-broker"` holding broker-specific connection config. Referenced by destinations by `id`.

**`message-destination`** — a `data` element describing a publish/consume endpoint:

| Field | Description |
| --- | --- |
| `broker` | id of the `message-broker` data element |
| `topology` | `"queue"` or `"topic"` |
| `name` | destination name on the broker |
| `publisher.transactionalOutbox` | route publishes through the transactional outbox |
| `consumer.concurrency` | number of parallel consumers |
| `consumer.retry.attempts` | max retry count on handler failure |
| `consumer.retry.backoff` | delay between retries (ms) |

**`message-consumer`** — a `data` element with `meta.kind = "message-consumer"`. Registered consumers are discovered automatically by `startConsuming`:

| Field | Description |
| --- | --- |
| `destination` | id of the `message-destination` data element |
| `name` | optional name for logging / monitoring |
| `handler` | pipeline executed for each received message; receives the `message-envelope` as `#.input` |

**`message-envelope`** — the wire format for every published message:

| Field | Description |
| --- | --- |
| `messageId` | unique message identifier |
| `timestampUTC` | ISO 8601 timestamp |
| `group` | grouping / routing key |
| `correlation` | correlation id for tracing |
| `message` | the actual payload object |

### Service interface (`messaging-interface`)

| Method | Key input fields | Returns |
| --- | --- | --- |---|
| `publish` | `destination`, `envelope` | `{ messageId }` |
| `startConsuming` | `destination` | `{ consumers[] }` — names of activated consumers |
| `stopConsuming` | `destination` | — |

`destination` is the `id` of a `message-destination` data element in all methods.

### Routing

The `messaging` service is a fully declarative router. For each method it resolves the `message-broker` data element from the destination and delegates dynamically to the service named in `broker.data.service`. `startConsuming` uses `data.getDataOfKind` to discover all `message-consumer` elements for the destination and calls `broker.consume` for each one.

### Broker interface (`messaging-broker-interface`)

Broker services implement this interface. Methods receive data objects directly (not ids).

| Method | Key input fields | Returns |
| --- | --- | --- |
| `publish` | `destination`, `broker`, `envelope` | `{ messageId }` |
| `consume` | `destination`, `broker`, `consumer` | — |
| `stopConsuming` | `destination`, `broker` | — |

`consumer` includes the resolved `handler` pipeline. The broker calls `executeMethod(consumer.handler, envelope, _ctx)` to dispatch each message.

---

## `messaging-nats`

NATS JetStream implementation of `messaging-broker-interface`. Requires NATS with JetStream enabled (`nats -js`).

### Broker data element

```json
{
    "type": "data",
    "meta": { "kind": "message-broker" },
    "id": "my-nats-broker",
    "data": {
        "service": "messaging-nats",
        "url": "nats://localhost:4222"
    }
}
```

### Behaviour

| Aspect | Detail |
| --- | --- |
| Transport | NATS JetStream (persistent, at-least-once delivery) |
| Stream | One JetStream stream per destination, auto-created on first use |
| `topology: "queue"` | Competing consumers — one message delivered to one handler instance; all consumers share a durable consumer group keyed on `destinationId` |
| `topology: "topic"` | Fan-out — each `message-consumer` has its own durable consumer and receives every message |
| Retry | On handler failure the message is redelivered up to `consumer.retry.attempts` times with `consumer.retry.backoff` ms delay; after exhaustion the message is terminated (`msg.term()`) |
| `disconnect()` | Drains all connections; call on application shutdown |

### `disconnect`

```js
import { disconnect } from 'messaging-nats/nats';
await disconnect();
```

> **Note:** Start NATS with JetStream enabled: `nats -js` or `docker compose up nats`.
