import { getPool } from '@business-framework/postgresql';
import { getClient } from '@business-framework/transaction';

async function put({ _ctx, input: { channel, envelope } }) {
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

export { put };
