import { CoreError, findElement, invoke } from '@business-framework/core';
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
        ORDER BY message_group, position
    ),
    candidate AS (
        SELECT id FROM group_earliest
        WHERE process_after_timestamp_utc <= $1
        ORDER BY process_after_timestamp_utc ASC
        LIMIT 1
    )
    UPDATE transactional_outbox SET process_after_timestamp_utc = $2
    WHERE id = (SELECT id FROM candidate) AND status = ${PENDING} AND process_after_timestamp_utc <= $1
    RETURNING *`;

const CLAIM = `
    UPDATE transactional_outbox claimed SET process_after_timestamp_utc = $3
    WHERE message_id = $1 AND status = ${PENDING} AND process_after_timestamp_utc <= $2
      AND NOT EXISTS (
          SELECT 1 FROM transactional_outbox earlier
          WHERE earlier.message_group = claimed.message_group AND earlier.status = ${PENDING}
            AND earlier.position < claimed.position)
    RETURNING channel, envelope`;

let processor = null;
let settings = null;

const settingsOf = ({ lockIntervalInMilliseconds, idleIntervalInMilliseconds, retry }) => ({
    lockInterval: Number(lockIntervalInMilliseconds),
    idleInterval: Number(idleIntervalInMilliseconds),
    retry: { attempts: Number(retry.attempts), backoff: Number(retry.backoff) }
});

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const later = ms => new Date(Date.now() + ms).toISOString();

export const put = async ({ input: { channel, envelope }, _ctx }) => {
    await queryable(_ctx).query(
        `INSERT INTO transactional_outbox (channel, message_id, message_group, envelope, process_after_timestamp_utc)
         VALUES ($1, $2, $3, $4, $5)`,
        [channel, envelope.messageId, envelope.group, JSON.stringify(envelope), new Date().toISOString()]);
    return { messageId: envelope.messageId };
};

export const claim = async ({ input: { messageId } }) => {
    const { rows: [row] } = await getPool().query(CLAIM, [messageId, new Date().toISOString(), later(settings.lockInterval)]);
    return row ? { claimed: true, channel: row.channel, envelope: row.envelope } : { claimed: false };
};

export const markDelivered = async ({ input: { messageId } }) => {
    await getPool().query(
        `UPDATE transactional_outbox SET status = ${DELIVERED}, processed_at = $1 WHERE message_id = $2`, [new Date().toISOString(), messageId]);
    return null;
};

export const recordFailure = async ({ input: { messageId } }) => {
    const { rows: [item] } = await getPool().query('SELECT id, channel, retry_count FROM transactional_outbox WHERE message_id = $1', [messageId]);
    await markFailedAttempt(item);
    return null;
};

const lockNext = async () => (await getPool().query(LOCK_NEXT, [new Date().toISOString(), later(settings.lockInterval)])).rows[0];

const retryOf = channel => ({ ...settings.retry, ...findElement(channel)?.data.publisher?.retry });

const markFailedAttempt = ({ id, channel, retry_count: retries }) => {
    const { attempts, backoff } = retryOf(channel);
    return retries < attempts
        ? getPool().query('UPDATE transactional_outbox SET process_after_timestamp_utc = $1, retry_count = retry_count + 1 WHERE id = $2', [later(backoff * 2 ** retries), id])
        : getPool().query(`UPDATE transactional_outbox SET status = ${FAILED} WHERE id = $1`, [id]);
};

const REPLAY_FILTERS = {
    messageIds: parameter => `message_id = ANY(${parameter})`,
    channel: parameter => `channel = ${parameter}`,
    from: parameter => `created_at >= ${parameter}`,
    to: parameter => `created_at < ${parameter}`
};

export const replay = async ({ input }) => {
    if (input.messageIds === undefined && input.channel === undefined) throw new CoreError('invalid', 'replay needs messageIds or a channel', {});
    const filters = Object.entries(REPLAY_FILTERS).filter(([key]) => input[key] !== undefined);
    const { rowCount } = await getPool().query(
        `UPDATE transactional_outbox SET status = ${PENDING}, retry_count = 0, process_after_timestamp_utc = $1
         WHERE status IN (${DELIVERED}, ${FAILED}) AND ${filters.map(([, condition], index) => condition(`$${index + 2}`)).join(' AND ')}`,
        [new Date().toISOString(), ...filters.map(([key]) => input[key])]);
    return { count: rowCount };
};

export const purge = async ({ input: { deliveredBefore } }) => {
    const { rowCount } = await getPool().query(
        `DELETE FROM transactional_outbox WHERE status = ${DELIVERED} AND processed_at < $1`, [deliveredBefore]);
    return { count: rowCount };
};

const deliver = async item => {
    try {
        await invoke(item.channel, 'deliver', item.envelope);
        await markDelivered({ input: { messageId: item.message_id } });
    } catch {
        await markFailedAttempt(item);
    }
};

const loop = async state => {
    while (!state.stopped) {
        const item = await lockNext().catch(() => null);
        await (item ? deliver(item) : sleep(settings.idleInterval)).catch(() => sleep(settings.idleInterval));
    }
};

export const startProcessor = async ({ input }) => {
    const state = { stopped: false };
    settings = settingsOf(input);
    processor = { state, done: loop(state) };
    return null;
};

export const stopProcessor = async () => {
    if (!processor) return null;
    processor.state.stopped = true;
    await processor.done;
    processor = null;
    return null;
};
