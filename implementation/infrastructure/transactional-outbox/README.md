# transactional-outbox

At-least-once delivery for channels with `publisher.transactionalOutbox`. Kind `transactional-outbox` (a [`message-outbox`](../../framework/messaging/README.md)), instance `outbox` (`lockIntervalInMilliseconds` 30000, `idleIntervalInMilliseconds` 1000).

- `put({ channel, envelope })` inserts the envelope in the session of the bound `transaction`, so the message is committed or rolled back with the business change.
- The processor starts after every `database` and `message-broker`, and delivers pending messages through the channel's `deliver`. Within a group, only the earliest pending message is a candidate, so a message being retried holds back the later ones of its group.
- The `transactional_outbox` table and its indexes are [`models`](../../framework/database/README.md#models) of `postgresql-database`.
- A failed delivery is retried `publisher.retry.attempts` times (default 3) with exponential backoff (`backoff * 2^retry`, default 1000 ms); then it's marked failed.
- Delivered and failed messages stay in the table: they are the record of what the system published, the source for recovering a consumer that acknowledged messages it then mishandled. The processor reads pending messages through partial indexes, so kept messages don't slow it down.
- `replay({ messageIds?, channel?, from?, to? })` → `{ count }` puts delivered and failed messages back to pending, selected by message id or channel, optionally within a message time range (`from` inclusive, `to` exclusive, ISO times). It needs `messageIds` or `channel`. Replayed messages are delivered again in order within their group; consumers must be idempotent.
- `purge({ deliveredBefore })` → `{ count }` deletes messages delivered before an ISO time. The framework never purges: how long messages are kept is the administrator's decision.
