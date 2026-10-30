WITH deleted AS (
    DELETE FROM entities WHERE id = $1 AND revision = $2
    RETURNING *
),
history AS (
    DELETE FROM entity_history WHERE id IN (SELECT id FROM deleted)
)
SELECT * FROM deleted
