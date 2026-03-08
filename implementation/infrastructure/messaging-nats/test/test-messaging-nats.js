import { expect } from 'chai';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { connect as natsProbe } from 'nats';
import { loadElements } from 'core/elements-loader';
import { execute } from 'core/service';
import { registerElement } from 'core/elements-registry';
import { disconnect } from 'messaging-nats/nats';

const __dirname = dirname(fileURLToPath(import.meta.url));
const NATS_URL = process.env.NATS_URL ?? 'nats://localhost:4222';
const BROKER_ID = `test-broker-${Date.now()}`;

describe('messaging service (nats)', function () {
    let available = false;

    before(async function () {
        let probe;
        try {
            probe = await natsProbe({ servers: NATS_URL, timeout: 2000, reconnect: false });
            await probe.drain();
        } catch {
            console.warn('\n  WARNING: NATS not reachable — tests skipped\n');
            return;
        }

        await loadElements([
            join(__dirname, '../../../core/elements'),
            join(__dirname, '../../messaging/elements'),
            join(__dirname, '../elements')
        ]);

        registerElement({ type: 'data', id: BROKER_ID, data: { service: 'messaging-nats', url: NATS_URL } });
        available = true;
    });

    after(async function () {
        if (!available) return;
        await disconnect();
    });

    function makeDestination() {
        const id = `dest-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        registerElement({ type: 'data', id, data: { broker: BROKER_ID, topology: 'queue', name: id } });
        return id;
    }

    function makeConsumer(destinationId, handler) {
        const id = `consumer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        registerElement({
            type: 'data', id,
            meta: { kind: 'message-consumer' },
            data: { destination: destinationId, name: id, handler }
        });
        return id;
    }

    function makeEnvelope(messageId, message = {}) {
        return { messageId, timestampUTC: new Date().toISOString(), group: 'test', correlation: 'c1', message };
    }

    it('publish returns the messageId', async function () {
        if (!available) return this.skip();
        const dest = makeDestination();
        const result = await execute('messaging', 'publish', { destination: dest, envelope: makeEnvelope('pub-1') });
        expect(result).to.have.property('messageId', 'pub-1');
    });

    it('consumer handler receives the published envelope', async function () {
        if (!available) return this.skip();
        this.timeout(5000);

        const dest = makeDestination();
        const captureHandler = [{ name: '_ctx', set: { received: '#.input' } }, { return: null }];
        makeConsumer(dest, captureHandler);

        const _ctx = {};
        await execute('messaging', 'startConsuming', { destination: dest }, _ctx);

        const env = makeEnvelope('msg-recv', { value: 42 });
        await execute('messaging', 'publish', { destination: dest, envelope: env });

        await new Promise(resolve => setTimeout(resolve, 1000));
        expect(_ctx.received).to.deep.include({ messageId: 'msg-recv', message: { value: 42 } });

        await execute('messaging', 'stopConsuming', { destination: dest });
    });

    it('handler is not invoked after stopConsuming', async function () {
        if (!available) return this.skip();
        this.timeout(5000);

        const dest = makeDestination();
        const captureHandler = [{ name: '_ctx', set: { received: '#.input' } }, { return: null }];
        makeConsumer(dest, captureHandler);

        const _ctx = {};
        await execute('messaging', 'startConsuming', { destination: dest }, _ctx);
        await execute('messaging', 'stopConsuming', { destination: dest });

        await execute('messaging', 'publish', { destination: dest, envelope: makeEnvelope('msg-after-stop') });
        await new Promise(resolve => setTimeout(resolve, 300));
        expect(_ctx.received).to.be.undefined;
    });

    it('multiple consumers on the same destination each receive the message (topic topology)', async function () {
        if (!available) return this.skip();
        this.timeout(5000);

        const destId = `dest-topic-${Date.now()}`;
        registerElement({ type: 'data', id: destId, data: { broker: BROKER_ID, topology: 'topic', name: destId } });

        const captureA = [{ name: '_ctx', set: { receivedA: '#.input' } }, { return: null }];
        const captureB = [{ name: '_ctx', set: { receivedB: '#.input' } }, { return: null }];
        makeConsumer(destId, captureA);
        makeConsumer(destId, captureB);

        const _ctx = {};
        await execute('messaging', 'startConsuming', { destination: destId }, _ctx);

        const env = makeEnvelope('msg-topic', { fan: 'out' });
        await execute('messaging', 'publish', { destination: destId, envelope: env });

        await new Promise(resolve => setTimeout(resolve, 1000));
        expect(_ctx.receivedA).to.deep.include({ messageId: 'msg-topic' });
        expect(_ctx.receivedB).to.deep.include({ messageId: 'msg-topic' });

        await execute('messaging', 'stopConsuming', { destination: destId });
    });
});
