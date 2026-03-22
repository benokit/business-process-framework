# Infrastructure Services

## `entity-database`

Generic document store with optimistic concurrency, full revision history, and business versioning. Each document carries an `id`, a unique `businessKey`, a `revision`, a `version`, a `data` object, and a `state` object. `data` and `state` are stored in separate JSONB columns so that FSM state transitions are decoupled from business data mutations.

| Method   | Key input fields                                                | Returns         |
|----------|-----------------------------------------------------------------|-----------------|
| `create` | `entityType`, `businessKey`, `data`, `state?`                   | `entity-record` |
| `read`   | `entityType`, `id`/`businessKey`, `revision?`                   | `entity-record` |
| `update` | `entityType`, `id`/`businessKey`, `revision`, `data?`, `state?` | `entity-record` |
| `amend`  | `entityType`, `id`/`businessKey`, `revision`, `data`, `validFrom?` | `entity-record` |
| `delete` | `entityType`, `id`/`businessKey`, `revision?`                   | `entity-record` |

`businessKey` must be a non-empty string, unique per `entityType`. `update`, `amend`, and `delete` use optimistic locking via `revision`. `state` defaults to `{}` when omitted.

### `revision` vs `version`

- **`revision`** — optimistic concurrency counter. Increments on every write (`update`, `amend`). Used for conflict detection.
- **`version`** — business version counter. Starts at `1` and increments only on `amend`. Identifies distinct business-meaningful snapshots of `data`.

### Read with revision (point-in-time snapshot)

Passing `revision` to `read` returns the entity's data and state as they were at that revision:

```json
{ "entityType": "order", "businessKey": "order-123", "revision": 2 }
```

- Omitting `revision` (or passing the current revision) returns the current record unchanged.
- Passing a revision lower than the current one reconstructs the snapshot by applying stored reverse patches.
- Passing a revision higher than the current one, or `0`, returns `null`.

### `amend` — business versioning

`amend` replaces `data` and creates a permanent snapshot of the **previous** data in `entity_versions`. `state` is never touched.

```json
{ "entityType": "order", "businessKey": "order-123", "revision": 3, "data": { ... }, "validFrom": "2025-01-01T00:00:00.000Z" }
```

- The current `data` (before the amendment) is inserted into `entity_versions` with `valid_to = validFrom`.
- `revision` and `version` are both incremented on the `entities` row.
- `validFrom` is optional; when omitted `valid_to` is `null`.

Each row in `entity_versions` represents one business version of the data and holds the data that was **superseded** by the amendment (i.e. the data valid up to `valid_to`).

### History

Every `update` records reverse JSON patches (RFC 6902) in a companion `entity_history` table — separate `data_patch` and `state_patch` columns. Each patch is computed as `compare(newValue, oldValue)` so applying it to a newer snapshot reconstructs the previous value. `amend` does **not** write to `entity_history`. `delete` removes all history and version rows for the entity atomically.

### Storage

| Table | Columns | Purpose |
| --- | --- | --- |
| `entities` | `id`, `entity_type`, `business_key`, `revision`, `version`, `data`, `state`, `timestamp_utc` | Current state of each entity |
| `entity_history` | `id`, `entity_type`, `revision`, `data_patch`, `state_patch`, `timestamp_utc` | Reverse patches for prior revisions |
| `entity_versions` | `id`, `entity_type`, `version`, `data`, `valid_to` | Whole data snapshots per business version |

All tables are created automatically on first use. Patch columns store JSON Patch arrays (RFC 6902).

---

## `sequence-generator`

Monotonically increasing integer counter per named sequence. Backed by native PostgreSQL sequences, created on first use.

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

PostgreSQL-backed transaction lifecycle. Provides two services:

### `transaction-low`

Low-level session management. Each method operates on a PostgreSQL client connection identified by a numeric `sessionId`.

| Method                | Key input fields | Returns              |
|-----------------------|------------------|----------------------|
| `beginTransaction`    | `options?`       | `{ sessionId }`      |
| `commitTransaction`   | `sessionId`      | `{ sessionId }`      |
| `rollbackTransaction` | `sessionId`      | `{ sessionId }`      |

### `transaction`

High-level service. Wraps a program in a transaction: begins, executes the program, commits on success, rolls back and rethrows on failure.

| Method                 | Key input fields                       | Returns             |
|------------------------|----------------------------------------|---------------------|
| `executeInTransaction` | `program`, `programInput?`, `config?`  | result of `program` |

`program` is a single pipeline item or an array of items (same format as a service method implementation). `programInput` is passed as `#.input` to the program.

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

---

## `messaging`

Broker-agnostic messaging framework. Concrete broker implementations are provided as separate packages that bind to the `messaging-interface`.

### Abstractions

**`message-broker`** — a `data` element with `meta.kind = "message-broker"` holding broker-specific connection config. Referenced by channels by `id`.

**`message-channel`** — a `data` element describing a publish/consume endpoint:

| Field | Description |
| --- | --- |
| `broker` | id of the `message-broker` data element |
| `topology` | `"queue"` or `"topic"` |
| `name` | channel name on the broker |
| `publisher.transactionalOutbox` | when `true`, `messaging.publish` routes through `transactional-outbox.put` instead of the broker directly — see [`transactional-outbox`](#transactional-outbox) |
| `publisher.retry.attempts` | max publish retry attempts in the outbox processor |
| `publisher.retry.backoff` | base backoff in ms for outbox publish retries (exponential: `backoff * 2^retryCount`) |
| `consumer.concurrency` | number of parallel consumers |
| `consumer.retry.attempts` | max retry count on handler failure |
| `consumer.retry.backoff` | delay between retries (ms) |

**`message-consumer`** — a `data` element with `meta.kind = "message-consumer"`. Registered consumers are discovered automatically by `startConsuming`:

| Field | Description |
| --- | --- |
| `channel` | id of the `message-channel` data element |
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
| `publish` | `channel`, `envelope` | `{ messageId }` |
| `startConsuming` | `channel` | `{ consumers[] }` — names of activated consumers |
| `stopConsuming` | `channel` | — |

`channel` is the `id` of a `message-channel` data element in all methods.

### `publish` pipeline keyword

This package registers an [execution node template](../core/README.md#execution-node-templates) that adds `publish` as a first-class pipeline keyword — a shorthand for `messaging.publish`:

```json
{ "publish": { "channel": "order-events", "envelope": { ... } } }
```

`channel` is the id of a `message-channel` data element. `envelope` is a `message-envelope` object. For dynamic values, use `dynamic` to evaluate context references before the node runs:

```json
{
    "dynamic": {
        "publish": {
            "channel": "order-events",
            "envelope": "#.myEnvelope"
        }
    }
}
```

### Routing

The `messaging` service is a fully declarative router. For each method it resolves the `message-broker` data element from the channel and delegates dynamically to the service named in `broker.data.service`. `startConsuming` uses `data.getDataOfKind` to discover all `message-consumer` elements for the channel and calls `broker.consume` for each one.

### Broker interface (`messaging-broker-interface`)

Broker services implement this interface. Methods receive data objects directly (not ids).

| Method | Key input fields | Returns |
| --- | --- | --- |
| `publish` | `channel`, `broker`, `envelope` | `{ messageId }` |
| `consume` | `channel`, `broker`, `consumer` | — |
| `stopConsuming` | `channel`, `broker` | — |

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
| Stream | One JetStream stream per channel, auto-created on first use |
| `topology: "queue"` | Competing consumers — one message delivered to one handler instance; all consumers share a durable consumer group keyed on `channelId` |
| `topology: "topic"` | Fan-out — each `message-consumer` has its own durable consumer and receives every message |
| Retry | On handler failure the message is redelivered up to `consumer.retry.attempts` times with `consumer.retry.backoff` ms delay; after exhaustion the message is terminated (`msg.term()`) |
| `disconnect()` | Drains all connections; call on application shutdown |

### `disconnect`

```js
import { disconnect } from 'messaging-nats/nats';
await disconnect();
```

> **Note:** Start NATS with JetStream enabled: `nats -js` or `docker compose up nats`.

---

## `transactional-outbox`

Guarantees at-least-once message delivery by persisting outbox items to PostgreSQL within the same business transaction, then publishing them asynchronously. Depends on `transaction` and `postgres-client`.

### Pattern

1. Within an `inTransaction` block, call `transactional-outbox.put` alongside your business writes. The insert joins the active PostgreSQL transaction, so the outbox item is atomically committed or rolled back with the rest of the transaction.
2. Run `transactional-outbox-processor` in the background. It polls the outbox, publishes each item to its broker, and marks it processed. On broker failure it retries with exponential backoff; after exhausting attempts it marks the item failed.

The `messaging.publish` pipeline integrates this transparently: when a `message-channel` has `publisher.transactionalOutbox: true`, calling `messaging.publish` routes to `transactional-outbox.put` automatically.

### `transactional-outbox` service

| Method | Key input fields | Returns |
| --- | --- | --- |
| `put` | `channel`, `envelope` | `{ messageId }` |

`channel` is the `id` of a `message-channel` data element. `envelope` is a `message-envelope`. Must be called within an `inTransaction` block to guarantee atomicity with business data.

### `transactional-outbox-processor`

| Method | Key input fields                                             | Returns |
|--------|--------------------------------------------------------------|---------|
| `run`  | `lockIntervalInMilliseconds?`, `idleIntervalInMilliseconds?` | `{}`    |
| `stop` | —                                                            | `{}`    |

`run` starts a background loop; `stop` signals it to halt and waits for the current iteration to finish before returning. Defaults: `lockIntervalInMilliseconds = 30000`, `idleIntervalInMilliseconds = 1000`.

### Processor loop

Each iteration:

1. **Find and lock** (in a PostgreSQL transaction): groups all `status=0` items by `envelope.group`, takes the earliest `envelope.timestampUTC` per group, filters to items with `process_after_timestamp_utc ≤ now`, picks the one with the smallest `process_after_timestamp_utc`, and advances its `process_after_timestamp_utc` by `lockIntervalInMilliseconds`. This prevents concurrent processor instances from double-processing the same item. Implemented as a single atomic CTE `UPDATE … RETURNING`.
2. **Publish**: resolves the channel's broker and calls the broker service directly (bypassing outbox re-routing). On success marks the item `status = 1` (`processed`) and records `processed_at`.
3. **On failure**: retries up to `channel.publisher.retry.attempts` times with delay `backoff * 2^retryCount` ms. After exhaustion marks `status = 2` (`failed`).
4. **Idle**: if no eligible item is found, sleeps `idleIntervalInMilliseconds` before the next iteration.

### Outbox table (`transactional_outbox`)

| Column | Description |
| --- | --- |
| `id` | UUID primary key |
| `channel` | `message-channel` element id |
| `message_id` | `envelope.messageId` — promoted for deduplication index |
| `message_group` | `envelope.group` — promoted for group-ordering index |
| `message_timestamp_utc` | `envelope.timestampUTC` — promoted for group-ordering index |
| `envelope` | the full `message-envelope` payload (JSONB) |
| `status` | `0` waiting · `1` processed · `2` failed |
| `retry_count` | number of failed publish attempts so far |
| `process_after_timestamp_utc` | earliest time this item may be picked up (ISO string) |
| `processed_at` | ISO timestamp set when `status` becomes `1` |
| `created_at` | row creation timestamp |

The table and its indices are created automatically on first use.

### Indices

| Index | Purpose |
| --- | --- |
| `(status, process_after_timestamp_utc)` | main filter in the processor query |
| `(message_group, message_timestamp_utc)` | group-ordering sort |
| `(message_id)` (unique) | prevents duplicate inserts |

### Example

```json
[
    {
        "type": "data",
        "id": "order-events",
        "data": {
            "broker": "my-nats-broker",
            "topology": "topic",
            "name": "order-events",
            "publisher": {
                "transactionalOutbox": true,
                "retry": { "attempts": 5, "backoff": 500 }
            }
        }
    }
]
```

```json
{
    "inTransaction": [
        { "service": { "id": "entity-database", "method": "create" }, "inputMap": "..." },
        { "service": { "id": "messaging", "method": "publish" },
          "inputMap": { "channel": "order-events", "envelope": "#.envelope" } }
    ]
}
```

> **Note:** The processor must be started explicitly via `transactional-outbox-processor.run`.
