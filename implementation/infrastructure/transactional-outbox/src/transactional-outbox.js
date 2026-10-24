import { CoreError, findElement, invoke } from '@business-framework/core';
import { getPool, queryable } from '@business-framework/postgresql';

const PENDING = 0;
const DELIVERED = 1;
const FAILED = 2;
const SKIPPED = 3;

const HOLDING_GROUP = `status IN (${PENDING}, ${FAILED})`;

const LOCK_BATCH = `
    WITH group_heads AS (
        SELECT DISTINCT ON (message_group) id, status, channel, process_after_timestamp_utc
        FROM transactional_outbox
        WHERE ${HOLDING_GROUP}
        ORDER BY message_group, position
    ),
    candidates AS (
        SELECT id FROM group_heads
        WHERE status = ${PENDING} AND process_after_timestamp_utc <= $1 AND channel <> ALL($3)
        ORDER BY process_after_timestamp_utc ASC
        LIMIT $4
    )
    UPDATE transactional_outbox SET process_after_timestamp_utc = $2
    WHERE id IN (SELECT id FROM candidates) AND status = ${PENDING} AND process_after_timestamp_utc <= $1
    RETURNING *`;

const CLAIM = `
    UPDATE transactional_outbox claimed SET process_after_timestamp_utc = $3
    WHERE message_id = $1 AND status = ${PENDING} AND process_after_timestamp_utc <= $2 AND channel <> ALL($4)
      AND NOT EXISTS (
          SELECT 1 FROM transactional_outbox earlier
          WHERE earlier.message_group = claimed.message_group AND earlier.${HOLDING_GROUP}
            AND earlier.position < claimed.position)
    RETURNING channel, envelope`;

let processor = null;
let settings = null;
const pauses = new Map();

const settingsOf = ({ lockIntervalInMilliseconds, idleIntervalInMilliseconds, maxBackoffInMilliseconds, batchSize, retry }) => ({
    lockInterval: Number(lockIntervalInMilliseconds),
    idleInterval: Number(idleIntervalInMilliseconds),
    maxBackoff: Number(maxBackoffInMilliseconds),
    batchSize: Number(batchSize),
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

const pausedChannels = () => [...pauses].filter(([, { until }]) => until > Date.now()).map(([channel]) => channel);

const cappedBackoff = (backoff, exponent) => Math.min(backoff * 2 ** exponent, settings.maxBackoff);

const retryOf = channel => ({ ...settings.retry, ...findElement(channel)?.data.publisher?.retry });

const pause = channel => {
    const { outages = 0, until = 0 } = pauses.get(channel) ?? {};
    if (until > Date.now()) return;
    pauses.set(channel, { outages: outages + 1, until: Date.now() + cappedBackoff(retryOf(channel).backoff, outages) });
};

export const claim = async ({ input: { messageId } }) => {
    const { rows: [row] } = await getPool().query(CLAIM, [messageId, new Date().toISOString(), later(settings.lockInterval), pausedChannels()]);
    return row ? { claimed: true, channel: row.channel, envelope: row.envelope } : { claimed: false };
};

export const markDelivered = async ({ input: { messageId } }) => {
    const { rows: [{ channel }] } = await getPool().query(
        `UPDATE transactional_outbox SET status = ${DELIVERED}, processed_at = $1 WHERE message_id = $2 RETURNING channel`, [new Date().toISOString(), messageId]);
    pauses.delete(channel);
    return null;
};

const markFailedAttempt = ({ id, channel, retry_count: retries }) => {
    const { attempts, backoff } = retryOf(channel);
    return retries < attempts
        ? getPool().query('UPDATE transactional_outbox SET process_after_timestamp_utc = $1, retry_count = retry_count + 1 WHERE id = $2', [later(cappedBackoff(backoff, retries)), id])
        : getPool().query(`UPDATE transactional_outbox SET status = ${FAILED} WHERE id = $1`, [id]);
};

const markUnavailable = ({ id, channel }) => {
    pause(channel);
    return getPool().query('UPDATE transactional_outbox SET process_after_timestamp_utc = $1 WHERE id = $2', [new Date().toISOString(), id]);
};

const recordFailureOf = (item, error) => (error?.code === 'unavailable' ? markUnavailable : markFailedAttempt)(item);

export const recordFailure = async ({ input: { messageId, error } }) => {
    const { rows: [item] } = await getPool().query('SELECT id, channel, retry_count FROM transactional_outbox WHERE message_id = $1', [messageId]);
    await recordFailureOf(item, error);
    return null;
};

export const skip = async ({ input: { messageIds } }) => {
    const { rowCount } = await getPool().query(
        `UPDATE transactional_outbox SET status = ${SKIPPED} WHERE status = ${FAILED} AND message_id = ANY($1)`, [messageIds]);
    return { count: rowCount };
};

const lockBatch = async () => (await getPool().query(LOCK_BATCH, [new Date().toISOString(), later(settings.lockInterval), pausedChannels(), settings.batchSize])).rows;

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
         WHERE status IN (${DELIVERED}, ${FAILED}, ${SKIPPED}) AND ${filters.map(([, condition], index) => condition(`$${index + 2}`)).join(' AND ')}`,
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
    } catch (error) {
        await recordFailureOf(item, error);
    }
};

const loop = async state => {
    while (!state.stopped) {
        const items = await lockBatch().catch(() => []);
        await (items.length ? Promise.all(items.map(deliver)) : sleep(settings.idleInterval)).catch(() => sleep(settings.idleInterval));
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
    pauses.clear();
    return null;
};
