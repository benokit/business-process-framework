CREATE TABLE IF NOT EXISTS transactional_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel TEXT NOT NULL,
    message_id TEXT NOT NULL UNIQUE,
    message_group TEXT NOT NULL,
    position BIGSERIAL,
    envelope JSONB NOT NULL,
    status INTEGER NOT NULL DEFAULT 0,
    retry_count INTEGER NOT NULL DEFAULT 0,
    process_after_timestamp_utc TEXT NOT NULL,
    processed_at TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
