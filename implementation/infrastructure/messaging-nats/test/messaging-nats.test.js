import { expect } from 'chai';
import { connect } from 'nats';
import { boot, invoke, packageElements, start, stop, validate } from '@business-framework/core';
import { publish } from '../src/messaging-nats.js';

const NATS_URL = process.env.NATS_URL ?? 'nats://localhost:4222';
const STREAM = `test-orders-${Date.now()}`;
const LIMITS_STREAM = `${STREAM}-limits`;
const SHIPMENTS = `${STREAM}-shipments`;
const received = [];

export const record = ({ input, _ctx }) => {
    if (input.failFirst && !received.some(entry => entry.input.id === input.id && entry.failed)) {
        received.push({ input, failed: true });
        throw new Error('first attempt fails');
    }
    received.push({ input, correlation: _ctx.trace?.correlation, subject: _ctx.message.subject });
    return null;
};

const RECORDER = import.meta.url;

const consumer = (id, data = {}) => ({
    id,
    kind: 'message-consumer',
    data: { channel: 'orders', ...data, handler: { inputMap: { $merge: ['#.input', { by: `\\${id}` }] }, low: { module: RECORDER, export: 'record', effects: ['irreversible'] } } }
});

const elements = [
    { kind: 'app-config', data: { nats: { url: NATS_URL } } },
    { id: 'orders', kind: 'message-channel', data: { broker: 'default-nats-broker', topology: 'topic', name: STREAM, consumer: { retry: { attempts: 2, backoff: 50 } } } },
    { id: 'archive', kind: 'message-channel', data: { broker: 'default-nats-broker', topology: 'topic', name: LIMITS_STREAM } },
    consumer('order-recorder'),
    consumer('indexer-1', { name: 'indexer' }),
    consumer('indexer-2', { name: 'indexer' }),
    consumer('cache-1', { broadcast: true }),
    consumer('cache-2', { broadcast: true }),
    { id: 'shipments', kind: 'message-channel', data: { broker: 'default-nats-broker', topology: 'topic', name: SHIPMENTS } },
    consumer('all-shipments', { channel: 'shipments', name: 'legacy' }),
    consumer('express-shipments', { channel: 'shipments', filter: ['express', 'urgent'] }),
    consumer('express-cache', { channel: 'shipments', broadcast: true, filter: ['express'] })
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
        await withManager(async jsm => {
            await jsm.streams.add({ name: SHIPMENTS, subjects: [SHIPMENTS], retention: 'interest' });
            await jsm.consumers.add(SHIPMENTS, { durable_name: 'legacy', deliver_group: 'legacy', deliver_subject: `legacy-${STREAM}`, filter_subject: SHIPMENTS, ack_policy: 'explicit' });
        });
        await boot({ paths: ['@business-framework/messaging', '@business-framework/messaging-nats'].map(packageElements), elements });
        await start();
    });

    after(async () => {
        await stop();
        await withManager(jsm => Promise.all([STREAM, LIMITS_STREAM, SHIPMENTS].map(name => jsm.streams.delete(name).catch(() => null))));
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

    it('delivers a message with a subject only to consumers whose filter has it, and to every unfiltered consumer', async () => {
        await Promise.all(['express', 'standard'].map(subject => invoke('shipments', 'publish', { message: { id: `s-${subject}` }, subject })));
        await eventually(() => receivers('s-express').length >= 3 && receivers('s-standard').length >= 1);
        await new Promise(resolve => setTimeout(resolve, 300));
        expect(receivers('s-express')).to.deep.equal(['all-shipments', 'express-cache', 'express-shipments']);
        expect(receivers('s-standard')).to.deep.equal(['all-shipments']);
        expect(received.find(entry => entry.input.id === 's-express').subject).to.equal('express');
    });

    it('refuses a subject that is not a NATS subject token', async () => {
        expect((await invoke('orders', 'publish', { message: { id: 'o-5' }, subject: 'a.b' }).catch(error => error)).code).to.equal('invalid');
    });

    it('reports an unreachable server as unavailable', async () => {
        const error = await publish({ input: { url: 'nats://localhost:1', channel: { name: STREAM }, envelope: { messageId: 'u-1' } } }).catch(e => e);
        expect(error.code).to.equal('unavailable');
    });

    it('refuses a stream whose retention is not interest', async () => {
        await withManager(jsm => jsm.streams.add({ name: LIMITS_STREAM, subjects: [LIMITS_STREAM] }));
        expect((await invoke('archive', 'publish', { message: { id: 'a-1' } }).catch(error => error)).code).to.equal('stream-retention');
    });
});
