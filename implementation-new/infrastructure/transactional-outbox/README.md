# transactional-outbox

At-least-once delivery for channels with `publisher.transactionalOutbox`. Kind `transactional-outbox`, instance `outbox` (`lockIntervalInMilliseconds` 30000, `idleIntervalInMilliseconds` 1000).

- `put({ channel, envelope })` inserts the envelope in the session of the bound `transaction` (the kind reads it), so the message is committed or rolled back with the business change.
- The processor starts after every `database` and `message-broker`, and delivers pending messages through the channel's `deliver`. Within a group, only the earliest pending message is a candidate, so a message being retried holds back the later ones of its group.
- The `transactional_outbox` table and its indexes are [`models`](../../framework/database/README.md#models) of `postgresql-database`.
- A failed delivery is retried `publisher.retry.attempts` times (default 3) with exponential backoff (`backoff * 2^retry`, default 1000 ms); then it's marked failed.
