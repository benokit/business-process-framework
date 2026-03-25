import { getPool } from '@business-framework/postgres-client';
import { execute } from '@business-framework/core/service';
import { initSchema } from './transactional-outbox.js';

let running = false;
let stopRequested = false;
let loopPromise = null;

async function run({ input: { lockIntervalInMilliseconds = 30000, idleIntervalInMilliseconds = 1000 } = {} }) {
    if (running) return {};
    running = true;
    stopRequested = false;
    loopPromise = loop({ lockIntervalInMilliseconds, idleIntervalInMilliseconds });
    return {};
}

async function stop(_) {
    stopRequested = true;
    if (loopPromise) {
        await loopPromise;
        loopPromise = null;
    }
    return {};
}

async function loop({ lockIntervalInMilliseconds, idleIntervalInMilliseconds }) {
    while (!stopRequested) {
        try {
            const item = await findAndLockItem(lockIntervalInMilliseconds);
            if (!item) {
                await sleep(idleIntervalInMilliseconds);
                continue;
            }
            await processItem(item);
        } catch (err) {
            console.error('transactional-outbox-processor error:', err);
            await sleep(idleIntervalInMilliseconds);
        }
    }
    running = false;
}

async function findAndLockItem(lockIntervalInMilliseconds) {
    await initSchema();
    const pool = getPool();
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const now = new Date().toISOString();
        const lockedUntil = new Date(Date.now() + lockIntervalInMilliseconds).toISOString();

        // Group pending items by envelope.group, take the earliest per group (by timestampUTC),
        // then pick the one with the earliest processAfterTimestampUTC that is due now.
        const result = await client.query(`
            WITH group_earliest AS (
                SELECT DISTINCT ON (message_group) *
                FROM transactional_outbox
                WHERE status = 0 AND process_after_timestamp_utc <= $1
                ORDER BY message_group, message_timestamp_utc ASC
            ),
            candidate AS (
                SELECT id FROM group_earliest
                ORDER BY process_after_timestamp_utc ASC
                LIMIT 1
            )
            UPDATE transactional_outbox
            SET process_after_timestamp_utc = $2
            WHERE id = (SELECT id FROM candidate)
            RETURNING *
        `, [now, lockedUntil]);

        await client.query('COMMIT');
        return result.rows.length ? result.rows[0] : null;
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
    } finally {
        client.release();
    }
}

async function processItem(item) {
    const pool = getPool();
    try {
        const destElement = await execute('data', 'getData', { id: item.channel });
        const destData = destElement.data;
        const brokerElement = await execute('data', 'getData', { id: destData.broker });
        const brokerData = brokerElement.data;

        await execute(brokerData.service, 'publish', {
            channel: destData,
            broker: brokerData,
            envelope: item.envelope
        });

        await pool.query(
            `UPDATE transactional_outbox SET status = 1, processed_at = $1 WHERE id = $2`,
            [new Date().toISOString(), item.id]
        );
    } catch (err) {
        await handlePublishFailure(item);
    }
}

async function handlePublishFailure(item) {
    const pool = getPool();
    try {
        const destElement = await execute('data', 'getData', { id: item.channel });
        const retryConfig = destElement?.data?.publisher?.retry;
        const maxAttempts = retryConfig?.attempts ?? 3;
        const backoff = retryConfig?.backoff ?? 1000;

        if (item.retry_count < maxAttempts) {
            const delay = backoff * Math.pow(2, item.retry_count);
            const retryAfter = new Date(Date.now() + delay).toISOString();
            await pool.query(
                `UPDATE transactional_outbox SET process_after_timestamp_utc = $1, retry_count = retry_count + 1 WHERE id = $2`,
                [retryAfter, item.id]
            );
        } else {
            await pool.query(
                `UPDATE transactional_outbox SET status = 2 WHERE id = $1`,
                [item.id]
            );
        }
    } catch (err) {
        console.error('transactional-outbox-processor: failed to handle publish failure:', err);
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export { run, stop };
