# messaging

Broker-agnostic messaging.

- **`message-broker`**: abstract kind, starts first. A broker kind extends it and provides `publish({ channel, envelope })`, `subscribe({ channel, consumer, name })` and `unsubscribe({ consumer })`; `channel` is the channel's data plus its `id`. See [messaging-nats](../../infrastructure/messaging-nats/README.md).
- **`message-channel`**: `{ broker, topology: queue | topic, name, publisher?: { transactionalOutbox, retry }, consumer?: { retry } }`.
  - `publish({ message, group?, messageId?, timestampUTC? })` → `{ messageId }`: builds the envelope (`group` defaults to the message id, `correlation` comes from the `trace` context or is new), then puts it in the [outbox](../../infrastructure/transactional-outbox/README.md) when `publisher.transactionalOutbox` is set, or delivers it.
  - `deliver(envelope)`, `subscribe`, `unsubscribe`: through the channel's broker.
- **`message-consumer`** (an `entry-point`, starts last): `{ channel, name?, handler }`. It subscribes in `start` and unsubscribes in `stop`. Per message, the broker invokes `handle(envelope)`, which binds `message` (`{ channel, messageId, group, timestampUTC }`, managed by this kind) and `trace` (`{ correlation }`), and runs `handler` with the message payload as `#.input`.
- **`message-envelope`**: `{ messageId, timestampUTC, group, correlation, message }`.

Keyword `publish`: the node input is the outgoing message.

```json
{ "inputMap": { "message": { "orderId": "#.input.id" }, "group": "#.input.id" }, "publish": "order-events" }
```

A consumer kind that reads its context declares it, e.g. `"context": { "reads": ["message", "trace"] }`. Correlation flows on: what a handler publishes carries the correlation of the message it handles.
