import { findElement, invoke } from '@business-framework/core';
import { getPool } from '@business-framework/postgresql';
import { queryable } from '@business-framework/transaction';

const PENDING = 0;
const DELIVERED = 1;
const FAILED = 2;

const LOCK_NEXT = `
    WITH group_earliest AS (
        SELECT DISTINCT ON (message_group) *
        FROM transactional_outbox
        WHERE status = ${PENDING}
        ORDER BY message_group, message_timestamp_utc ASC
    ),
    candidate AS (
        SELECT id FROM group_earliest
        WHERE process_after_timestamp_utc <= $1
        ORDER BY process_after_timestamp_utc ASC
        LIMIT 1
    )
    UPDATE transactional_outbox SET process_after_timestamp_utc = $2
    WHERE id = (SELECT id FROM candidate)
    RETURNING *`;

let processor = null;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const later = ms => new Date(Date.now() + ms).toISOString();

export const put = async ({ input: { channel, envelope }, _ctx }) => {
    await queryable(_ctx).query(
        `INSERT INTO transactional_outbox (channel, message_id, message_group, message_timestamp_utc, envelope, process_after_timestamp_utc)
         VALUES ($1, $2, $3, $4, $5, $4)`,
        [channel, envelope.messageId, envelope.group, envelope.timestampUTC, JSON.stringify(envelope)]);
    return { messageId: envelope.messageId };
};

const lockNext = async lockInterval => (await getPool().query(LOCK_NEXT, [new Date().toISOString(), later(lockInterval)])).rows[0];

const retryOf = channel => findElement(channel)?.data.publisher?.retry ?? {};

const markFailedAttempt = ({ id, channel, retry_count: retries }) => {
    const { attempts = 3, backoff = 1000 } = retryOf(channel);
    return retries < attempts
        ? getPool().query('UPDATE transactional_outbox SET process_after_timestamp_utc = $1, retry_count = retry_count + 1 WHERE id = $2', [later(backoff * 2 ** retries), id])
        : getPool().query(`UPDATE transactional_outbox SET status = ${FAILED} WHERE id = $1`, [id]);
};

const deliver = async item => {
    try {
        await invoke(item.channel, 'deliver', item.envelope);
        await getPool().query(`UPDATE transactional_outbox SET status = ${DELIVERED}, processed_at = $1 WHERE id = $2`, [new Date().toISOString(), item.id]);
    } catch {
        await markFailedAttempt(item);
    }
};

const loop = async (state, { lockIntervalInMilliseconds, idleIntervalInMilliseconds }) => {
    while (!state.stopped) {
        const item = await lockNext(lockIntervalInMilliseconds).catch(() => null);
        await (item ? deliver(item) : sleep(idleIntervalInMilliseconds)).catch(() => sleep(idleIntervalInMilliseconds));
    }
};

export const startProcessor = async ({ input }) => {
    const state = { stopped: false };
    processor = { state, done: loop(state, input) };
    return null;
};

export const stopProcessor = async () => {
    if (!processor) return null;
    processor.state.stopped = true;
    await processor.done;
    processor = null;
    return null;
};
