CREATE TABLE IF NOT EXISTS entity_versions (
    id UUID NOT NULL,
    entity_type TEXT NOT NULL,
    version INTEGER NOT NULL,
    data JSONB NOT NULL,
    valid_to TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (id, version)
)
