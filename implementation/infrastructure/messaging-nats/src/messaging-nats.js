import { connect, JSONCodec, consumerOpts, createInbox } from 'nats';
import { executeMethod } from 'core/service';

const jc = JSONCodec();

// broker.url → { nc, js, jsm }
const connections = new Map();

// `${broker.url}:${destination.name}` → Subscription[]
const activeSubscriptions = new Map();

// stream names confirmed to exist: `${broker.url}:${streamName}`
const initializedStreams = new Set();

async function getConnection(brokerUrl) {
    if (!connections.has(brokerUrl)) {
        const nc = await connect({ servers: brokerUrl });
        const js = nc.jetstream();
        const jsm = await nc.jetstreamManager();
        connections.set(brokerUrl, { nc, js, jsm });
    }
    return connections.get(brokerUrl);
}

async function ensureStream(jsm, brokerUrl, streamName) {
    const key = `${brokerUrl}:${streamName}`;
    if (initializedStreams.has(key)) return;
    try {
        await jsm.streams.info(streamName);
    } catch {
        await jsm.streams.add({ name: streamName, subjects: [streamName] });
    }
    initializedStreams.add(key);
}

async function publish({ input: { destination, broker, envelope } }) {
    const { js, jsm } = await getConnection(broker.url);
    await ensureStream(jsm, broker.url, destination.name);
    await js.publish(destination.name, jc.encode(envelope));
    return { messageId: envelope.messageId };
}

async function consume({ _ctx, input: { destination, broker, consumer } }) {
    const { js, jsm } = await getConnection(broker.url);
    await ensureStream(jsm, broker.url, destination.name);

    const topology = destination.topology;
    const retryAttempts = destination.consumer?.retry?.attempts ?? 3;
    const retryBackoff = destination.consumer?.retry?.backoff ?? 1000;
    const consumerName = consumer.name;
    const durableName = topology === 'queue' ? destination.name : consumerName;

    const opts = consumerOpts();
    opts.durable(durableName);
    opts.deliverNew();
    opts.ackExplicit();
    opts.deliverTo(createInbox());
    if (topology === 'queue') {
        opts.queue(destination.name);
    }

    const sub = await js.subscribe(destination.name, opts);
    const subKey = `${broker.url}:${destination.name}`;
    if (!activeSubscriptions.has(subKey)) {
        activeSubscriptions.set(subKey, []);
    }
    activeSubscriptions.get(subKey).push(sub);

    (async () => {
        for await (const msg of sub) {
            const envelope = jc.decode(msg.data);
            let attempt = 0;
            while (true) {
                try {
                    await executeMethod(consumer.handler, envelope, _ctx);
                    msg.ack();
                    break;
                } catch {
                    attempt++;
                    if (attempt > retryAttempts) {
                        msg.term();
                        break;
                    }
                    await sleep(retryBackoff);
                }
            }
        }
    })();
}

async function stopConsuming({ input: { destination, broker } }) {
    const subKey = `${broker.url}:${destination.name}`;
    const subs = activeSubscriptions.get(subKey) ?? [];
    for (const sub of subs) {
        sub.unsubscribe();
    }
    activeSubscriptions.delete(subKey);
    return {};
}

async function disconnect() {
    for (const { nc } of connections.values()) {
        await nc.drain();
    }
    connections.clear();
    activeSubscriptions.clear();
    initializedStreams.clear();
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export { publish, consume, stopConsuming, disconnect };
