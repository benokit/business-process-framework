CREATE TABLE IF NOT EXISTS entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type TEXT NOT NULL,
    business_key TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1,
    data JSONB NOT NULL DEFAULT '{}',
    state JSONB NOT NULL DEFAULT '{}',
    timestamp_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (entity_type, business_key)
)
