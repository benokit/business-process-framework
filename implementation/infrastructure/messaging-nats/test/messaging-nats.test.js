import { expect } from 'chai';
import { connect } from 'nats';
import { boot, invoke, packageElements, start, stop, validate } from '@business-framework/core';

const NATS_URL = process.env.NATS_URL ?? 'nats://localhost:4222';
const STREAM = `test-orders-${Date.now()}`;
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

const elements = [
    { kind: 'app-config', data: { nats: { url: NATS_URL } } },
    { id: 'orders', kind: 'message-channel', data: { broker: 'nats', topology: 'topic', name: STREAM, consumer: { retry: { attempts: 2, backoff: 50 } } } },
    { id: 'order-recorder', kind: 'message-consumer', data: { channel: 'orders', handler: { low: { module: RECORDER, functionName: 'record' } } } }
];

const eventually = async (check, timeout = 3000) => {
    const deadline = Date.now() + timeout;
    while (!check() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
    expect(check()).to.equal(true);
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

    after(stop);

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
});
