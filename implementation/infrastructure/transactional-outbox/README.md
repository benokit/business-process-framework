# transactional-outbox

At-least-once delivery for channels with `publisher.transactionalOutbox`. Kind `transactional-outbox` (a [`message-outbox`](../../framework/messaging/README.md)), instance `outbox`.

Its time scales are the app config section `outbox` (`BPF__outbox__<key>`, `BPF__outbox__retry__<key>`):

| Key | Default | Meaning |
|---|---|---|
| `lockIntervalInMilliseconds` | 30000 | How long a claimed message is reserved for its deliverer; after it, the processor may take the message again |
| `idleIntervalInMilliseconds` | 1000 | How long the processor waits when no message is due |
| `retry.attempts` | 3 | Delivery attempts after the first, for channels without `publisher.retry` |
| `retry.backoff` | 1000 | Milliseconds before the first retry; it doubles with each retry |

- `put({ channel, envelope })` inserts the envelope in the bound `transaction`, so the message is committed or rolled back with the business change, and runs `deliverNow` [after the commit](../transaction/README.md), or at once when no transaction is bound.
- `deliverNow({ messageId })` delivers a message right after its commit: `claim` takes it for delivery, then the channel's `deliver` sends it and `markDelivered` records it; a failure counts as a delivery attempt (`recordFailure`) and is left to the processor.
- `claim({ messageId })` → `{ claimed, channel?, envelope? }` takes a pending message for one lock interval, only if no earlier message of its group is pending, so an eager delivery never overtakes a message being retried. Messages of a group are ordered by `position`, the order in which they entered the outbox.
- The processor starts after every `database` and `message-broker`, and delivers what eager delivery didn't: failed attempts after their backoff, messages held back by an earlier one of their group, and messages of a process that stopped before delivering. Within a group, only the earliest pending message is a candidate, so a message being retried holds back the later ones of its group. A message is claimed by one processor only.
- The `transactional_outbox` table and its indexes are [`models`](../../framework/database/README.md#models) of `postgresql-database`.
- A failed delivery is retried `attempts` times with exponential backoff (`backoff * 2^retry`), from the channel's `publisher.retry` or else the `outbox` section; then it's marked failed.
- Delivered and failed messages stay in the table: they are the record of what the system published, the source for recovering a consumer that acknowledged messages it then mishandled. The processor reads pending messages through partial indexes, so kept messages don't slow it down.
- `replay({ messageIds?, channel?, from?, to? })` → `{ count }` puts delivered and failed messages back to pending, selected by message id or channel, optionally within a range of the time they entered the outbox (`from` inclusive, `to` exclusive, ISO times). It needs `messageIds` or `channel`. Replayed messages are delivered again in order within their group; consumers must be idempotent.
- `purge({ deliveredBefore })` → `{ count }` deletes messages delivered before an ISO time. The framework never purges: how long messages are kept is the administrator's decision.
