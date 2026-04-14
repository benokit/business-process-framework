CREATE TABLE IF NOT EXISTS entity_history (
    id UUID NOT NULL,
    entity_type TEXT NOT NULL,
    revision INTEGER NOT NULL,
    data_patch JSONB NOT NULL,
    state_patch JSONB NOT NULL,
    timestamp_utc TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (id, revision)
)
