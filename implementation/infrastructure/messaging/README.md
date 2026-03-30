# messaging

Broker-agnostic messaging facade. Concrete broker implementations are separate packages that conform to `messaging-broker-interface`.

## Abstractions

**`message-broker`** (`kind = "message-broker"`) — broker connection config data element. Referenced by channels by id.

**`message-channel`** — publish/consume endpoint data element:

| Field | Description |
| --- | --- |
| `broker` | id of the `message-broker` data element |
| `topology` | `"queue"` or `"topic"` |
| `name` | channel name on the broker |
| `publisher.transactionalOutbox` | when `true`, routes `publish` through [`transactional-outbox`](../transactional-outbox/README.md) |
| `publisher.retry.attempts` | max outbox publish retry attempts |
| `publisher.retry.backoff` | base backoff in ms (exponential: `backoff * 2^retryCount`) |
| `consumer.concurrency` | parallel consumer count |
| `consumer.retry.attempts` | max retry count on handler failure |
| `consumer.retry.backoff` | delay between retries (ms) |

**`message-consumer`** (`kind = "message-consumer"`) — discovered automatically by `startConsumers`:

| Field | Description |
| --- | --- |
| `channel` | id of the `message-channel` data element |
| `name` | optional name for logging / monitoring |
| `handler` | pipeline executed per message; receives `message-envelope` as `#.input` |

**`message-envelope`** — wire format for every published message:

| Field | Description |
| --- | --- |
| `messageId` | unique message identifier |
| `timestampUTC` | ISO 8601 timestamp |
| `group` | grouping / routing key |
| `correlation` | correlation id for tracing |
| `message` | payload object |

## `messaging-service` service interface

| Method | Key input fields | Returns |
| --- | --- | --- |
| `publish` | `channel`, `envelope` | `{ messageId }` |
| `startConsumers` | `channel` *(optional)* | `{ consumers[] }` — names of activated consumers |
| `stopConsumers` | `channel` *(optional)* | — |

`channel` is the id of a `message-channel` data element. When omitted, the method applies to all channels.

## `publish` pipeline keyword

This package registers an [execution node template](../../core/README.md#execution-node-templates) that adds `publish` as a first-class pipeline keyword:

```json
{ "publish": { "channel": "order-events", "envelope": { ... } } }
```

For dynamic values, use `execute` to resolve context references before the node runs:

```json
{ "execute": { "publish": { "channel": "order-events", "envelope": "#.myEnvelope" } } }
```

## Routing

For each method, `messaging-service` resolves the `message-broker` data element from the channel and delegates dynamically to the service named in `broker.data.service`. `startConsumers` discovers all `message-consumer` elements for the channel via `getDataOfKind` and calls `broker.consume` for each one. When `channel` is omitted, both `startConsumers` and `stopConsumers` iterate over all `message-channel` elements and apply the operation to each.

## Broker interface (`messaging-broker-interface`)

Broker packages implement this interface. Methods receive resolved data objects (not ids).

| Method | Key input fields | Returns |
| --- | --- | --- |
| `publish` | `channel`, `broker`, `envelope` | `{ messageId }` |
| `consume` | `channel`, `broker`, `consumer` | — |
| `stopConsuming` | `channel`, `broker` | — |

`consumer` includes the resolved `handler` pipeline. The broker calls `executeMethod(consumer.handler, envelope, _ctx)` to dispatch each message.
