import { getPool } from '@business-framework/postgresql';
import { getClient } from '@business-framework/transaction';

let schemaInitialized = false;

async function initSchema() {
    if (schemaInitialized) return;
    schemaInitialized = true;
    await getPool().query(`
        CREATE TABLE IF NOT EXISTS transactional_outbox (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            channel TEXT NOT NULL,
            message_id TEXT NOT NULL,
            message_group TEXT NOT NULL,
            message_timestamp_utc TEXT NOT NULL,
            envelope JSONB NOT NULL,
            status INTEGER NOT NULL DEFAULT 0,
            retry_count INTEGER NOT NULL DEFAULT 0,
            process_after_timestamp_utc TEXT NOT NULL,
            processed_at TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE UNIQUE INDEX IF NOT EXISTS outbox_message_id
            ON transactional_outbox (message_id);
        CREATE INDEX IF NOT EXISTS outbox_status_process
            ON transactional_outbox (status, process_after_timestamp_utc);
        CREATE INDEX IF NOT EXISTS outbox_group_ts
            ON transactional_outbox (message_group, message_timestamp_utc);
    `);
}

async function put({ _ctx, input: { channel, envelope } }) {
    await initSchema();
    const db = _ctx?.transaction?.sessionId != null
        ? getClient(_ctx.transaction.sessionId)
        : getPool();

    await db.query(
        `INSERT INTO transactional_outbox (channel, message_id, message_group, message_timestamp_utc, envelope, status, retry_count, process_after_timestamp_utc)
         VALUES ($1, $2, $3, $4, $5, 0, 0, $6)`,
        [channel, envelope.messageId, envelope.group, envelope.timestampUTC, JSON.stringify(envelope), envelope.timestampUTC]
    );

    return { messageId: envelope.messageId };
}

export { put, initSchema };
