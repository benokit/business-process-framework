# transactional-outbox

Guarantees at-least-once message delivery by persisting outbox items to PostgreSQL within the business transaction, then publishing asynchronously. Depends on [`transaction`](../transaction/README.md) and [`postgres-client`](../postgres-client/README.md).

## Pattern

1. Inside an `inTransaction` block, call `transactional-outbox.put` alongside business writes. The insert is atomic with the rest of the transaction.
2. Run `transactional-outbox-processor` in the background. It polls the outbox, publishes each item to the broker, and marks it processed. On broker failure it retries with exponential backoff.

When a `message-channel` has `publisher.transactionalOutbox: true`, `messaging.publish` routes to `transactional-outbox.put` automatically — no extra steps needed at the call site.

## Services

### `transactional-outbox`

| Method | Key input fields | Returns |
| --- | --- | --- |
| `put` | `channel`, `envelope` | `{ messageId }` |

Must be called inside an `inTransaction` block to guarantee atomicity.

### `transactional-outbox-processor`

| Method | Key input fields                                             | Returns |
|--------|--------------------------------------------------------------|---------|
| `run`  | `lockIntervalInMilliseconds?`, `idleIntervalInMilliseconds?` | `{}`    |
| `stop` | —                                                            | `{}`    |

`run` starts a background polling loop. `stop` signals it to halt and waits for the current iteration to finish. Defaults: `lockIntervalInMilliseconds = 30000`, `idleIntervalInMilliseconds = 1000`.

## Processor loop

Each iteration:

1. **Lock** — finds the earliest eligible `status=0` item per group with `process_after_timestamp_utc ≤ now`, advances its timestamp by `lockIntervalInMilliseconds`. Prevents double-processing by concurrent processor instances. Implemented as a single atomic CTE `UPDATE … RETURNING`.
2. **Publish** — calls the broker directly (bypassing outbox re-routing). On success marks `status = 1`, records `processed_at`.
3. **Retry** — on failure retries up to `publisher.retry.attempts` times with `backoff * 2^retryCount` ms delay. After exhaustion marks `status = 2`.
4. **Idle** — if no eligible item is found, sleeps `idleIntervalInMilliseconds`.

## Storage (`transactional_outbox` table)

| Column | Description |
| --- | --- |
| `id` | UUID primary key |
| `channel` | `message-channel` element id |
| `message_id` | `envelope.messageId` — unique index for deduplication |
| `message_group` | `envelope.group` — group-ordering index |
| `message_timestamp_utc` | `envelope.timestampUTC` — group-ordering index |
| `envelope` | full `message-envelope` (JSONB) |
| `status` | `0` waiting · `1` processed · `2` failed |
| `retry_count` | failed publish attempts so far |
| `process_after_timestamp_utc` | earliest pick-up time |
| `processed_at` | set when `status` becomes `1` |
| `created_at` | row creation timestamp |

Table and indices are created automatically on first use.

## Example

```json
{
    "inTransaction": [
        { "service": { "id": "entity-database", "method": "create" }, "inputMap": "..." },
        { "publish": { "channel": "order-events", "envelope": "#.envelope" } }
    ]
}
```

> The processor must be started explicitly via `transactional-outbox-processor.run`.
