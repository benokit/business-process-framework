import { expect } from 'chai';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { connect as natsProbe } from 'nats';
import { loadElements } from '@business-framework/core/elements-loader';
import { executeService } from '@business-framework/core/execution';
import { registerElement } from '@business-framework/core/elements-registry';
import { disconnect } from '@business-framework/messaging-nats/nats';

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
            join(__dirname, '../../middleware/elements'),
            join(__dirname, '../../messaging/elements'),
            join(__dirname, '../elements')
        ]);

        registerElement({ id: BROKER_ID, data: { service: 'messaging-nats', url: NATS_URL } });
        available = true;
    });

    after(async function () {
        if (!available) return;
        await disconnect();
    });

    function makeChannel() {
        const id = `channel-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        registerElement({ id, data: { broker: BROKER_ID, topology: 'queue', name: id } });
        return id;
    }

    function makeConsumer(channelId, handler) {
        const id = `consumer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        registerElement({
            id,
            kind: 'message-consumer',
            data: { channel: channelId, name: id, handler }
        });
        return id;
    }

    function makeEnvelope(messageId, message = {}) {
        return { messageId, timestampUTC: new Date().toISOString(), group: 'test', correlation: 'c1', message };
    }

    it('publish returns the messageId', async function () {
        if (!available) return this.skip();
        const channel = makeChannel();
        const result = await executeService('messaging-service', 'publish', { channel, envelope: makeEnvelope('pub-1') });
        expect(result).to.have.property('messageId', 'pub-1');
    });

    it('consumer handler receives the published envelope', async function () {
        if (!available) return this.skip();
        this.timeout(5000);

        const channel = makeChannel();
        const captureHandler = [{ outputKey: '_ctx', set: { received: '#.input' } }, { return: null }];
        makeConsumer(channel, captureHandler);

        const _ctx = {};
        await executeService('messaging-service', 'startConsumers', { channel }, _ctx);

        const env = makeEnvelope('msg-recv', { value: 42 });
        await executeService('messaging-service', 'publish', { channel, envelope: env });

        await new Promise(resolve => setTimeout(resolve, 1000));
        expect(_ctx.received).to.deep.include({ messageId: 'msg-recv', message: { value: 42 } });

        await executeService('messaging-service', 'stopConsumers', { channel });
    });

    it('handler is not invoked after stopConsuming', async function () {
        if (!available) return this.skip();
        this.timeout(5000);

        const channel = makeChannel();
        const captureHandler = [{ outputKey: '_ctx', set: { received: '#.input' } }, { return: null }];
        makeConsumer(channel, captureHandler);

        const _ctx = {};
        await executeService('messaging-service', 'startConsumers', { channel }, _ctx);
        await executeService('messaging-service', 'stopConsumers', { channel });

        await executeService('messaging-service', 'publish', { channel, envelope: makeEnvelope('msg-after-stop') });
        await new Promise(resolve => setTimeout(resolve, 300));
        expect(_ctx.received).to.be.undefined;
    });

    it('multiple consumers on the same channel each receive the message (topic topology)', async function () {
        if (!available) return this.skip();
        this.timeout(5000);

        const channelId = `channel-topic-${Date.now()}`;
        registerElement({ id: channelId, data: { broker: BROKER_ID, topology: 'topic', name: channelId } });

        const captureA = [{ outputKey: '_ctx', set: { receivedA: '#.input' } }, { return: null }];
        const captureB = [{ outputKey: '_ctx', set: { receivedB: '#.input' } }, { return: null }];
        makeConsumer(channelId, captureA);
        makeConsumer(channelId, captureB);

        const _ctx = {};
        await executeService('messaging-service', 'startConsumers', { channel: channelId }, _ctx);

        const env = makeEnvelope('msg-topic', { fan: 'out' });
        await executeService('messaging-service', 'publish', { channel: channelId, envelope: env });

        await new Promise(resolve => setTimeout(resolve, 1000));
        expect(_ctx.receivedA).to.deep.include({ messageId: 'msg-topic' });
        expect(_ctx.receivedB).to.deep.include({ messageId: 'msg-topic' });

        await executeService('messaging-service', 'stopConsumers', { channel: channelId });
    });
});
