import { expect } from 'chai';
import { connect } from 'nats';
import { boot, invoke, packageElements, start, stop, validate } from '@business-framework/core';

const NATS_URL = process.env.NATS_URL ?? 'nats://localhost:4222';
const STREAM = `test-orders-${Date.now()}`;
const LIMITS_STREAM = `${STREAM}-limits`;
const received = [];

export const record = ({ input, _ctx }) => {
    if (input.failFirst && !received.some(entry => entry.input.id === input.id && entry.failed)) {
        received.push({ input, failed: true });
        throw new Error('first attempt fails');
    }
    received.push({ input, correlation: _ctx.trace?.correlation });
    return null;
};

const RECORDER = import.meta.url;

const consumer = (id, data = {}) => ({
    id,
    kind: 'message-consumer',
    data: { channel: 'orders', handler: { inputMap: { $merge: ['#.input', { by: `\\${id}` }] }, low: { module: RECORDER, export: 'record' } }, ...data }
});

const elements = [
    { kind: 'app-config', data: { nats: { url: NATS_URL } } },
    { id: 'orders', kind: 'message-channel', data: { broker: 'nats', topology: 'topic', name: STREAM, consumer: { retry: { attempts: 2, backoff: 50 } } } },
    { id: 'archive', kind: 'message-channel', data: { broker: 'nats', topology: 'topic', name: LIMITS_STREAM } },
    consumer('order-recorder'),
    consumer('indexer-1', { name: 'indexer' }),
    consumer('indexer-2', { name: 'indexer' }),
    consumer('cache-1', { broadcast: true }),
    consumer('cache-2', { broadcast: true })
];

const receivers = id => received.filter(entry => entry.input.id === id && !entry.failed).map(entry => entry.input.by).sort();

const eventually = async (check, timeout = 3000) => {
    const deadline = Date.now() + timeout;
    while (!(await check()) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
    expect(await check()).to.equal(true);
};

const withManager = async work => {
    const connection = await connect({ servers: NATS_URL });
    try {
        return await work(await connection.jetstreamManager());
    } finally {
        await connection.close();
    }
};

const skipWithoutNats = async context => {
    try {
        await (await connect({ servers: NATS_URL, timeout: 1000 })).close();
    } catch {
        console.warn('\n  WARNING: NATS not reachable — tests skipped\n');
        context.skip();
    }
};

describe('messaging-nats', function () {
    before(async function () {
        await skipWithoutNats(this);
        await boot({ paths: ['@business-framework/messaging', '@business-framework/messaging-nats'].map(packageElements), elements });
        await start();
    });

    after(async () => {
        await stop();
        await withManager(jsm => Promise.all([STREAM, LIMITS_STREAM].map(name => jsm.streams.delete(name).catch(() => null))));
    });

    it('validates', () => {
        expect(validate()).to.deep.equal([]);
    });

    it('delivers a published message to the consumer with its correlation', async () => {
        const { messageId } = await invoke('orders', 'publish', { message: { id: 'o-1' } });
        await eventually(() => received.some(entry => entry.input.id === 'o-1'));
        expect(received.find(entry => entry.input.id === 'o-1').correlation).to.be.a('string');
        expect(messageId).to.be.a('string');
    });

    it('retries a failing handler', async () => {
        await invoke('orders', 'publish', { message: { id: 'o-2', failFirst: true } });
        await eventually(() => received.some(entry => entry.input.id === 'o-2' && !entry.failed));
    });

    it('delivers a message once per consumer name, shared by its instances, and to every broadcast subscription', async () => {
        await invoke('orders', 'publish', { message: { id: 'o-3' } });
        await eventually(() => receivers('o-3').length >= 4);
        await new Promise(resolve => setTimeout(resolve, 300));
        const indexers = receivers('o-3').filter(by => by.startsWith('indexer'));
        expect(receivers('o-3').filter(by => !by.startsWith('indexer'))).to.deep.equal(['cache-1', 'cache-2', 'order-recorder']);
        expect(indexers).to.have.length(1);
    });

    it('removes a message once every consumer has acknowledged it', async () => {
        await invoke('orders', 'publish', { message: { id: 'o-4' } });
        await eventually(() => receivers('o-4').length >= 4);
        await eventually(() => withManager(async jsm => (await jsm.streams.info(STREAM)).state.messages === 0));
    });

    it('refuses a stream whose retention is not interest', async () => {
        await withManager(jsm => jsm.streams.add({ name: LIMITS_STREAM, subjects: [LIMITS_STREAM] }));
        expect((await invoke('archive', 'publish', { message: { id: 'a-1' } }).catch(error => error)).code).to.equal('stream-retention');
    });
});
