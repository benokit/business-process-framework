import { connect, consumerOpts, createInbox, JSONCodec, RetentionPolicy } from 'nats';
import { CoreError, invoke } from '@business-framework/core';

const codec = JSONCodec();
const connections = new Map();
const subscriptions = new Map();
const streams = new Set();

const connectionTo = async url => {
    if (!connections.has(url)) {
        connections.set(url, connect({ servers: url }).then(async nc => ({ nc, js: nc.jetstream(), jsm: await nc.jetstreamManager() })));
    }
    return connections.get(url);
};

const checkRetention = ({ config: { name, retention } }) => {
    if (retention !== RetentionPolicy.Interest) {
        throw new CoreError('stream-retention', `stream ${name} has ${retention} retention, not interest; recreate it`, { stream: name, retention });
    }
};

const ensureStream = async (url, jsm, name) => {
    if (streams.has(`${url}:${name}`)) return;
    const stream = await jsm.streams.info(name).catch(() => jsm.streams.add({ name, subjects: [name], retention: RetentionPolicy.Interest }));
    checkRetention(stream);
    streams.add(`${url}:${name}`);
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export const publish = async ({ input: { url, channel, envelope } }) => {
    const { js, jsm } = await connectionTo(url);
    await ensureStream(url, jsm, channel.name);
    await js.publish(channel.name, codec.encode(envelope));
    return { messageId: envelope.messageId };
};

const sharedConsumer = (opts, durable) => {
    opts.durable(durable);
    opts.queue(durable);
};

const options = (channel, name, broadcast) => {
    const opts = consumerOpts();
    opts.deliverNew();
    opts.ackExplicit();
    opts.deliverTo(createInbox());
    if (!broadcast) sharedConsumer(opts, channel.topology === 'queue' ? channel.name : name);
    return opts;
};

const handleWithRetry = async (consumer, envelope, { attempts = 3, backoff = 1000 }, attempt = 0) => {
    try {
        await invoke(consumer, 'handle', envelope);
        return true;
    } catch {
        if (attempt >= attempts) return false;
        await sleep(backoff);
        return handleWithRetry(consumer, envelope, { attempts, backoff }, attempt + 1);
    }
};

const dispatch = async (subscription, consumer, retry) => {
    for await (const message of subscription) {
        const handled = await handleWithRetry(consumer, codec.decode(message.data), retry);
        handled ? message.ack() : message.term();
    }
};

export const subscribe = async ({ input: { url, channel, consumer, name, broadcast } }) => {
    const { js, jsm } = await connectionTo(url);
    await ensureStream(url, jsm, channel.name);
    const subscription = await js.subscribe(channel.name, options(channel, name, broadcast));
    subscriptions.set(consumer, subscription);
    dispatch(subscription, consumer, channel.consumer?.retry ?? {});
    return null;
};

export const unsubscribe = ({ input: { consumer } }) => {
    subscriptions.get(consumer)?.unsubscribe();
    subscriptions.delete(consumer);
    return null;
};

export const disconnect = async () => {
    await Promise.all([...connections.values()].map(async connection => (await connection).nc.drain()));
    connections.clear();
    subscriptions.clear();
    streams.clear();
    return null;
};
