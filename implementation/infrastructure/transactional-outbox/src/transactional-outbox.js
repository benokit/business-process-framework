import { CoreError, findElement, invoke } from '@business-framework/core';

const run = (query, input) => invoke(query, 'run', input);

const now = () => new Date().toISOString();

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

const pausedChannels = () => [...pauses].filter(([, { until }]) => until > Date.now()).map(([channel]) => channel);

const cappedBackoff = (backoff, exponent) => Math.min(backoff * 2 ** exponent, settings.maxBackoff);

const retryOf = channel => ({ ...settings.retry, ...findElement(channel)?.data.publisher?.retry });

const pause = channel => {
    const { outages = 0, until = 0 } = pauses.get(channel) ?? {};
    if (until > Date.now()) return;
    pauses.set(channel, { outages: outages + 1, until: Date.now() + cappedBackoff(retryOf(channel).backoff, outages) });
};

export const claim = ({ input: { messageId } }) =>
    run('outbox-claim', { messageId, now: now(), lockedUntil: later(settings.lockInterval), pausedChannels: pausedChannels() });

export const markDelivered = async ({ input: { messageId } }) => {
    const { channel } = await run('outbox-mark-delivered', { messageId, processedAt: now() });
    pauses.delete(channel);
    return null;
};

const markFailedAttempt = ({ id, channel, retryCount }) => {
    const { attempts, backoff } = retryOf(channel);
    return retryCount < attempts
        ? run('outbox-retry-later', { id, processAfter: later(cappedBackoff(backoff, retryCount)) })
        : run('outbox-mark-failed', { id });
};

const markUnavailable = ({ id, channel }) => {
    pause(channel);
    return run('outbox-release', { id, processAfter: now() });
};

const recordFailureOf = (item, error) => (error?.code === 'unavailable' ? markUnavailable : markFailedAttempt)(item);

export const recordFailure = async ({ input: { messageId, error } }) => {
    await recordFailureOf(await run('outbox-entry', { messageId }), error);
    return null;
};

const lockBatch = () => run('outbox-lock-batch', { now: now(), lockedUntil: later(settings.lockInterval), pausedChannels: pausedChannels(), batchSize: settings.batchSize });

export const replay = ({ input }) => {
    if (input.messageIds === undefined && input.channel === undefined) throw new CoreError('invalid', 'replay needs messageIds or a channel', {});
    return run('outbox-replay', { ...input, now: now() });
};

const deliver = async item => {
    try {
        await invoke(item.channel, 'deliver', item.envelope);
        await markDelivered({ input: { messageId: item.messageId } });
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
