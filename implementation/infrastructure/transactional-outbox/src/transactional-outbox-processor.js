import { getCollection, getClient } from 'mongodb-client';
import { execute } from 'core/service';
import { COLLECTION, COLLECTION_PROPS } from './collection.js';

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
    const col = await getCollection(COLLECTION, COLLECTION_PROPS);
    const client = getClient();
    const session = client.startSession();
    try {
        while (true) {
            try {
                session.startTransaction();
                const now = new Date().toISOString();

                // Group waiting items by envelope.group, take the earliest per group (by timestampUTC),
                // then pick the one with the earliest processAfterTimestampUTC that is due now.
                const items = await col.aggregate([
                    { $match: { status: 0, processAfterTimestampUTC: { $lte: now } } },
                    { $sort: { 'envelope.timestampUTC': 1 } },
                    { $group: { _id: '$envelope.group', doc: { $first: '$$ROOT' } } },
                    { $replaceRoot: { newRoot: '$doc' } },
                    { $sort: { processAfterTimestampUTC: 1 } },
                    { $limit: 1 }
                ], { session }).toArray();

                if (items.length === 0) {
                    await session.abortTransaction();
                    return null;
                }

                const item = items[0];
                const lockedUntil = new Date(new Date(now).getTime() + lockIntervalInMilliseconds).toISOString();

                await col.updateOne(
                    { _id: item._id },
                    { $set: { processAfterTimestampUTC: lockedUntil } },
                    { session }
                );

                await session.commitTransaction();
                return item;
            } catch (err) {
                try { await session.abortTransaction(); } catch {}
                if (!err.errorLabels?.includes('TransientTransactionError')) throw err;
            }
        }
    } finally {
        await session.endSession();
    }
}

async function processItem(item) {
    const col = await getCollection(COLLECTION, COLLECTION_PROPS);
    try {
        // Resolve broker directly to avoid re-routing back through the transactional outbox
        const destElement = await execute('data', 'getData', { id: item.channel });
        const destData = destElement.data;
        const brokerElement = await execute('data', 'getData', { id: destData.broker });
        const brokerData = brokerElement.data;

        await execute(brokerData.service, 'publish', {
            channel: destData,
            broker: brokerData,
            envelope: item.envelope
        });

        await col.updateOne({ _id: item._id }, { $set: { status: 1, processedAt: new Date().toISOString() } });
    } catch (err) {
        await handlePublishFailure(col, item);
    }
}

async function handlePublishFailure(col, item) {
    try {
        const destElement = await execute('data', 'getData', { id: item.channel });
        const retryConfig = destElement?.data?.publisher?.retry;
        const maxAttempts = retryConfig?.attempts ?? 3;
        const backoff = retryConfig?.backoff ?? 1000;

        if (item.retryCount < maxAttempts) {
            const delay = backoff * Math.pow(2, item.retryCount);
            const retryAfter = new Date(Date.now() + delay).toISOString();
            await col.updateOne(
                { _id: item._id },
                { $set: { processAfterTimestampUTC: retryAfter, retryCount: item.retryCount + 1 } }
            );
        } else {
            await col.updateOne({ _id: item._id }, { $set: { status: 2 } });
        }
    } catch (err) {
        console.error('transactional-outbox-processor: failed to handle publish failure:', err);
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export { run, stop };
