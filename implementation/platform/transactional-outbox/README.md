# transactional-outbox

At-least-once delivery for channels with `publisher.transactionalOutbox`. Kind `transactional-outbox` (a [`message-outbox`](../../platform/messaging/README.md)), instance `default-transactional-outbox`.

**Why.** Publishing to a broker and committing to the database can't be one transaction: publish first and a rollback leaves a message about nothing; commit first and a crash loses the message. The outbox writes the message in the business transaction, so both happen or neither, and delivers it afterwards, retrying until the broker accepts it. The price is at-least-once delivery, so consumers must be idempotent.

Its time scales are the settings of the kind (`BPF__transactional_outbox__<key>`, `BPF__transactional_outbox__retry__<key>`, or the `app-config` section `transactional-outbox`, or `default-transactional-outbox` for the instance):

| Key | Default | Meaning |
|---|---|---|
| `lockIntervalInMilliseconds` | 30000 | How long a claimed message is reserved for its deliverer; after it, the processor may take the message again |
| `idleIntervalInMilliseconds` | 1000 | How long the processor waits when no message is due |
| `maxBackoffInMilliseconds` | 60000 | The longest wait before a retry or after an outage |
| `batchSize` | 10 | How many groups the processor delivers to at once |
| `retry.attempts` | 3 | Delivery attempts after the first, for channels without `publisher.retry` |
| `retry.backoff` | 1000 | Milliseconds before the first retry; it doubles with each retry |

- `put({ channel, envelope })` inserts the envelope in the bound `transaction`, so the message is committed or rolled back with the business change, and runs `deliverNow` [after the commit](../transaction/README.md), or at once when no transaction is bound.
- `deliverNow({ messageId })` delivers a message right after its commit: `claim` takes it for delivery, then the channel's `deliver` sends it and `markDelivered` records it; a failure is recorded with `recordFailure({ messageId, error })` and left to the processor.
- `claim({ messageId })` → `{ claimed, channel?, envelope? }` takes a pending message for one lock interval, only if no earlier message of its group is pending or failed and its channel isn't paused, so an eager delivery never overtakes a message being retried. Messages of a group are ordered by `position`, the order in which they entered the outbox.
- The processor starts after every `database` and `message-broker`, and delivers what eager delivery didn't: failed attempts after their backoff, messages held back by an earlier one of their group, and messages of a process that stopped before delivering. It claims the earliest message of up to `batchSize` groups at once and delivers them concurrently; when one was delivered, it claims again at once, and it waits `idleIntervalInMilliseconds` only when nothing is due. A message is claimed by one processor only.
- A failure the broker reports as [`unavailable`](../../platform/messaging/README.md) is an outage, not a fault of the message: it doesn't count as an attempt, and it pauses the channel in this process. Nothing of a paused channel is claimed, neither by the processor nor by eager delivery, so during an outage no request waits for the broker. The pause starts at the retry `backoff` and doubles with each outage that follows it, up to `maxBackoffInMilliseconds`; the first message delivered on the channel ends it. Messages wait pending however long the outage lasts.
- Any other failure counts as an attempt and is retried `attempts` times with exponential backoff (`backoff * 2^retry`, up to `maxBackoffInMilliseconds`), from the channel's `publisher.retry` or else the `outbox` section; then the message is marked failed. A failed message holds back the later messages of its group until it is replayed or skipped, so a group's order is never broken.
- `skip({ messageIds })` → `{ count }` marks failed messages skipped, releasing their groups.
- The outbox stores through [queries](../../platform/database/README.md#queries) (`outbox-insert`, `outbox-claim`, `outbox-lock-batch`, …); the processor, its pauses and retries are database independent. Implementation: [transactional-outbox-postgresql](../../adapters/transactional-outbox-postgresql/README.md).
- Delivered, failed and skipped messages stay in the table: they are the record of what the system published, the source for recovering a consumer that acknowledged messages it then mishandled. The processor reads only pending messages, so kept messages don't slow it down.
- `replay({ messageIds?, channel?, from?, to? })` → `{ count }` puts delivered, failed and skipped messages back to pending, selected by message id or channel, optionally within a range of the time they entered the outbox (`from` inclusive, `to` exclusive, ISO times). It needs `messageIds` or `channel`. Replayed messages are delivered again in order within their group; consumers must be idempotent.
- `purge({ deliveredBefore })` → `{ count }` deletes messages delivered before an ISO time. The framework never purges: how long messages are kept is the administrator's decision.
