# messaging

Broker-agnostic messaging.

- **`message-broker`**: abstract kind, starts first. It declares the [abstract operations](../../core/README.md#interfaces) `publish({ channel, envelope })` → `{ messageId }`, `subscribe({ channel, consumer, name, broadcast?, filter? })` and `unsubscribe({ consumer })`, which a broker kind implements; `channel` is the channel's data plus its `id`. `publish` raises `unavailable` when the broker can't be reached; any other error means the broker refused the message. A broker delivers a message with a `subject` only to consumers without a `filter` or whose `filter` lists it, and filters where it can, so a consumer is never handed a message it didn't ask for. The contract is what every common broker can express: one string matched exactly against a list, no wildcards; a subject is a [`message-subject`](elements/messaging.eson) (letters, digits, `_` and `-`), so it is valid for every broker; a broker without native filtering keeps a destination per subject. Such a broker orders messages only within a subject, so all messages of a group have the same subject. See [messaging-nats](../../adapters/messaging-nats/README.md).
- **`message-outbox`**: abstract kind with `put({ channel, envelope })` → `{ messageId }`. See [transactional-outbox](../../platform/transactional-outbox/README.md).
- **`message-channel`**: `{ broker, topology: queue | topic, name, publisher?: { transactionalOutbox, retry }, consumer?: { retry } }`. `broker` is an [element reference](../../core/README.md#interfaces): a specific broker (`"nats"`), or `{ "instanceOf": "message-broker" }` in channels that packages provide.
  - `envelope({ message, group?, subject?, messageId?, timestampUTC? })` → the envelope: `messageId` defaults to a new id, `timestampUTC` to the time of publishing, `group` to the message id; `subject` names what the message is about, for consumers to filter on; `correlation` comes from the `trace` context or is new. An operation of its own, so that a [test interpreter](../../core/README.md#interpreters) can stub it.
  - `publish(` the same input `)` → `{ messageId }`: builds the envelope with `envelope`, then puts it in the `message-outbox` instance when `publisher.transactionalOutbox` is set, or delivers it. `validate()` reports a channel with `transactionalOutbox` when there is no outbox.
  - `deliver(envelope)`, `subscribe`, `unsubscribe`: through the channel's broker.
- **`message-consumer`** (an `entry-point`, starts last): `{ channel, name?, broadcast?, filter?, handler }`. It subscribes in `start` and unsubscribes in `stop`. On a `topic` channel each consumer `name` (default: the consumer's id) receives every message once, shared by the running instances of the application. A `broadcast` consumer instead receives, in every running instance, each message published while it runs, with nothing kept for it in between (for example, to evict a local cache). A consumer with a `filter` (a list of subjects) receives only the messages with one of them. Per message, the broker invokes `handle(envelope)`, which binds `message` (`{ channel, messageId, group, subject?, timestampUTC }`, managed by this kind) and `trace` (`{ correlation }`), and runs `handler` with the message payload as `#.input`.
- **`message-envelope`**: `{ messageId, timestampUTC, group, subject?, correlation, message }`.

Keyword `publish`: the node input is the outgoing message.

```json
{ "inputMap": { "message": { "orderId": "#.input.id" }, "group": "#.input.id" }, "publish": "order-events" }
```

A handler reads `#._ctx.message` and `#._ctx.trace`. Correlation flows on: what a handler publishes carries the correlation of the message it handles.
