WITH group_heads AS (
    SELECT DISTINCT ON (message_group) id, status, channel, process_after_timestamp_utc
    FROM transactional_outbox
    WHERE status IN (0, 2)
    ORDER BY message_group, position
),
candidates AS (
    SELECT id FROM group_heads
    WHERE status = 0 AND process_after_timestamp_utc <= $1 AND channel <> ALL($3)
    ORDER BY process_after_timestamp_utc ASC
    LIMIT $4
)
UPDATE transactional_outbox SET process_after_timestamp_utc = $2
WHERE id IN (SELECT id FROM candidates) AND status = 0 AND process_after_timestamp_utc <= $1
RETURNING id, message_id AS "messageId", channel, envelope, retry_count AS "retryCount"
