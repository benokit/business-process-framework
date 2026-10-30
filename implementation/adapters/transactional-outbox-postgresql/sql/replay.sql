WITH changed AS (
    UPDATE transactional_outbox
    SET status = 0, retry_count = 0, process_after_timestamp_utc = $1
    WHERE status IN (1, 2, 3)
      AND ($2::text[] IS NULL OR message_id = ANY($2::text[]))
      AND ($3::text IS NULL OR channel = $3)
      AND ($4::timestamptz IS NULL OR created_at >= $4)
      AND ($5::timestamptz IS NULL OR created_at < $5)
    RETURNING 1
)
SELECT COUNT(*)::int AS count FROM changed
