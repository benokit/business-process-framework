import { connect, consumerOpts, createInbox, ErrorCode, JSONCodec, RetentionPolicy } from 'nats';
import { CoreError, invoke } from '@business-framework/core';

const codec = JSONCodec();
const connections = new Map();
const subscriptions = new Map();
const streams = new Set();

const UNREACHABLE = new Set([
    ErrorCode.ConnectionClosed, ErrorCode.ConnectionDraining, ErrorCode.ConnectionRefused, ErrorCode.ConnectionTimeout,
    ErrorCode.Disconnect, ErrorCode.Timeout, ErrorCode.NoResponders, ErrorCode.JetStream408RequestTimeout
]);

const forgetOnClose = (url, nc) => nc.closed().then(() => connections.delete(url));

const opened = async url => {
    const nc = await connect({ servers: url, maxReconnectAttempts: -1 });
    forgetOnClose(url, nc);
    return { nc, js: nc.jetstream(), jsm: await nc.jetstreamManager() };
};

const connectionTo = url => {
    if (!connections.has(url)) {
        connections.set(url, opened(url).catch(error => {
            connections.delete(url);
            throw error;
        }));
    }
    return connections.get(url);
};

const brokerError = error => UNREACHABLE.has(error?.code)
    ? new CoreError('unavailable', `NATS is unavailable: ${error.message}`, { code: error.code })
    : error;

const checkRetention = ({ config: { name, retention } }) => {
    if (retention !== RetentionPolicy.Interest) {
        throw new CoreError('stream-retention', `stream ${name} has ${retention} retention, not interest; recreate it`, { stream: name, retention });
    }
};

const SUBJECT_TOKEN = /^[^\s.*>]+$/;

const subjectOf = (name, subject) => {
    if (subject === undefined) return name;
    if (!SUBJECT_TOKEN.test(subject)) throw new CoreError('invalid', `'${subject}' is not a NATS subject token`, { subject });
    return `${name}.${subject}`;
};

const streamSubjects = name => [name, `${name}.>`];

const filtersOf = (name, filter) => filter?.length ? filter.map(subject => subjectOf(name, subject)) : streamSubjects(name);

const ensureStream = async (url, jsm, name) => {
    if (streams.has(`${url}:${name}`)) return;
    const subjects = streamSubjects(name);
    const stream = await jsm.streams.info(name).catch(() => jsm.streams.add({ name, subjects, retention: RetentionPolicy.Interest }));
    checkRetention(stream);
    if (!subjects.every(subject => stream.config.subjects.includes(subject))) await jsm.streams.update(name, { ...stream.config, subjects });
    streams.add(`${url}:${name}`);
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const send = async (url, channel, envelope) => {
    const { js, jsm } = await connectionTo(url);
    await ensureStream(url, jsm, channel.name);
    await js.publish(subjectOf(channel.name, envelope.subject), codec.encode(envelope));
};

export const publish = async ({ input: { url, channel, envelope } }) => {
    await send(url, channel, envelope).catch(error => { throw brokerError(error); });
    return { messageId: envelope.messageId };
};

const sharedConsumer = (opts, durable) => {
    opts.durable(durable);
    opts.queue(durable);
};

const durableOf = (channel, name, broadcast) => broadcast ? undefined : channel.topology === 'queue' ? channel.name : name;

const options = (stream, durable, filters) => {
    const opts = consumerOpts();
    opts.bindStream(stream);
    filters.forEach(filter => opts.filterSubject(filter));
    opts.deliverNew();
    opts.ackExplicit();
    opts.deliverTo(createInbox());
    if (durable) sharedConsumer(opts, durable);
    return opts;
};

const filtersOfConsumer = ({ config }) => [config.filter_subject, ...(config.filter_subjects ?? [])].filter(Boolean);

const sameFilters = (current, filters) => current.length === filters.length && filters.every(filter => current.includes(filter));

const alignFilters = async (jsm, stream, durable, filters) => {
    const info = durable && await jsm.consumers.info(stream, durable).catch(() => null);
    if (info && !sameFilters(filtersOfConsumer(info), filters)) {
        await jsm.consumers.update(stream, durable, { filter_subject: undefined, filter_subjects: filters });
    }
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

export const subscribe = async ({ input: { url, channel, consumer, name, broadcast, filter } }) => {
    const { js, jsm } = await connectionTo(url);
    await ensureStream(url, jsm, channel.name);
    const durable = durableOf(channel, name, broadcast);
    const filters = filtersOf(channel.name, filter);
    await alignFilters(jsm, channel.name, durable, filters);
    const subscription = await js.subscribe(filters[0], options(channel.name, durable, filters));
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
