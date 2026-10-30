UPDATE transactional_outbox claimed
SET process_after_timestamp_utc = $3
WHERE message_id = $1
  AND status = 0
  AND process_after_timestamp_utc <= $2
  AND channel <> ALL($4)
  AND NOT EXISTS (
      SELECT 1 FROM transactional_outbox earlier
      WHERE earlier.message_group = claimed.message_group
        AND earlier.status IN (0, 2)
        AND earlier.position < claimed.position)
RETURNING channel, envelope
