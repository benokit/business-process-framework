# messaging

Broker-agnostic messaging.

- **`message-broker`**: abstract kind, starts first. It declares the [abstract operations](../../core/README.md#interfaces) `publish({ channel, envelope })` → `{ messageId }`, `subscribe({ channel, consumer, name, broadcast? })` and `unsubscribe({ consumer })`, which a broker kind implements; `channel` is the channel's data plus its `id`. `publish` raises `unavailable` when the broker can't be reached; any other error means the broker refused the message. See [messaging-nats](../../infrastructure/messaging-nats/README.md).
- **`message-outbox`**: abstract kind with `put({ channel, envelope })` → `{ messageId }`. See [transactional-outbox](../../infrastructure/transactional-outbox/README.md).
- **`message-channel`**: `{ broker, topology: queue | topic, name, publisher?: { transactionalOutbox, retry }, consumer?: { retry } }`. `broker` is an [element reference](../../core/README.md#interfaces): a specific broker (`"nats"`), or `{ "instanceOf": "message-broker" }` in channels that packages provide.
  - `publish({ message, group?, messageId?, timestampUTC? })` → `{ messageId }`: builds the envelope (`timestampUTC` defaults to the time of publishing, `group` to the message id; `correlation` comes from the `trace` context or is new), then puts it in the `message-outbox` instance when `publisher.transactionalOutbox` is set, or delivers it. `validate()` reports a channel with `transactionalOutbox` when there is no outbox.
  - `deliver(envelope)`, `subscribe`, `unsubscribe`: through the channel's broker.
- **`message-consumer`** (an `entry-point`, starts last): `{ channel, name?, broadcast?, handler }`. It subscribes in `start` and unsubscribes in `stop`. On a `topic` channel each consumer `name` (default: the consumer's id) receives every message once, shared by the running instances of the application. A `broadcast` consumer instead receives, in every running instance, each message published while it runs, with nothing kept for it in between (for example, to evict a local cache). Per message, the broker invokes `handle(envelope)`, which binds `message` (`{ channel, messageId, group, timestampUTC }`, managed by this kind) and `trace` (`{ correlation }`), and runs `handler` with the message payload as `#.input`.
- **`message-envelope`**: `{ messageId, timestampUTC, group, correlation, message }`.

Keyword `publish`: the node input is the outgoing message.

```json
{ "inputMap": { "message": { "orderId": "#.input.id" }, "group": "#.input.id" }, "publish": "order-events" }
```

A handler reads `#._ctx.message` and `#._ctx.trace`. Correlation flows on: what a handler publishes carries the correlation of the message it handles.
