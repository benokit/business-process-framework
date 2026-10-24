SELECT w."targetEntityType", w."targetEntityBusinessKey"
FROM jsonb_to_recordset($1::jsonb->'relations') AS w("targetEntityType" text, "targetEntityBusinessKey" text)
WHERE NOT EXISTS (
    SELECT 1 FROM entities e
    WHERE e.entity_type = w."targetEntityType" AND e.business_key = w."targetEntityBusinessKey")
LIMIT 1
