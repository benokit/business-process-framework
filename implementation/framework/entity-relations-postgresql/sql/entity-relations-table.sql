CREATE TABLE IF NOT EXISTS entity_relations (
    source_entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    target_entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    relation_type TEXT NOT NULL,
    PRIMARY KEY (source_entity_id, target_entity_id, relation_type)
)
