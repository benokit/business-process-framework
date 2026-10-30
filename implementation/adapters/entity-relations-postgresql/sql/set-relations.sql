WITH wanted AS (
    SELECT DISTINCT e.id AS target_entity_id, w."relationType" AS relation_type
    FROM jsonb_to_recordset($2::jsonb->'relations') AS w("targetEntityType" text, "targetEntityBusinessKey" text, "relationType" text)
    JOIN entities e ON e.entity_type = w."targetEntityType" AND e.business_key = w."targetEntityBusinessKey"
),
removed AS (
    DELETE FROM entity_relations r
    WHERE r.source_entity_id = $1::uuid
      AND NOT EXISTS (
          SELECT 1 FROM wanted w
          WHERE w.target_entity_id = r.target_entity_id AND w.relation_type = r.relation_type)
)
INSERT INTO entity_relations (source_entity_id, target_entity_id, relation_type)
SELECT $1::uuid, target_entity_id, relation_type FROM wanted
ON CONFLICT DO NOTHING
