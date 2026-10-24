WITH updated AS (
    UPDATE entities SET data = $1, revision = revision + 1, timestamp_utc = NOW()
    WHERE id = $2 AND revision = $3
    RETURNING *
),
history AS (
    INSERT INTO entity_history (id, entity_type, revision, data_patch, timestamp_utc)
    SELECT id, entity_type, $3, $4, $5 FROM updated
)
SELECT * FROM updated
