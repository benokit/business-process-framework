import { expect } from 'chai';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadElements } from '@business-framework/core/elements-loader';
import { execute } from '@business-framework/core/service';
import { registerElement } from '@business-framework/core/elements-registry';

const __dirname = dirname(fileURLToPath(import.meta.url));

const BROKER_ID    = 'svc-test-broker';
const CHANNEL_A_ID = 'svc-test-channel-a';
const CHANNEL_B_ID = 'svc-test-channel-b';

before(async function () {
    await loadElements([
        join(__dirname, '../../../core/elements'),
        join(__dirname, '../elements')
    ]);

    // Mock broker: appends consumer names / channel names to _ctx for assertions
    registerElement({
        type: 'service',
        id: 'svc-test-mock-broker',
        interface: 'messaging-broker-interface',
        implementation: {
            publish: { return: { messageId: 'test' } },
            consume: [
                {
                    name: '_ctx',
                    set: { consumed: { $concat: ['#._ctx.consumed', ['#.input.consumer.name']] } }
                }
            ],
            stopConsuming: [
                {
                    name: '_ctx',
                    set: { stopped: { $concat: ['#._ctx.stopped', ['#.input.channel.name']] } }
                }
            ]
        }
    });

    registerElement({
        type: 'data',
        id: BROKER_ID,
        data: { service: 'svc-test-mock-broker' }
    });

    registerElement({
        type: 'data',
        id: CHANNEL_A_ID,
        kind: 'message-channel',
        data: { broker: BROKER_ID, topology: 'queue', name: 'channel-a' }
    });

    registerElement({
        type: 'data',
        id: CHANNEL_B_ID,
        kind: 'message-channel',
        data: { broker: BROKER_ID, topology: 'queue', name: 'channel-b' }
    });

    registerElement({
        type: 'data',
        id: 'svc-test-consumer-a',
        kind: 'message-consumer',
        data: { channel: CHANNEL_A_ID, name: 'consumer-a', handler: [{ return: null }] }
    });

    registerElement({
        type: 'data',
        id: 'svc-test-consumer-b',
        kind: 'message-consumer',
        data: { channel: CHANNEL_B_ID, name: 'consumer-b', handler: [{ return: null }] }
    });
});

describe('messaging-service', function () {
    describe('startConsumers', function () {
        it('starts consumers for the given channel', async function () {
            const _ctx = { consumed: [], stopped: [] };
            await execute('messaging-service', 'startConsumers', { channel: CHANNEL_A_ID }, _ctx);
            expect(_ctx.consumed).to.deep.equal(['consumer-a']);
        });

        it('starts consumers for all channels when channel is omitted', async function () {
            const _ctx = { consumed: [], stopped: [] };
            await execute('messaging-service', 'startConsumers', {}, _ctx);
            expect(_ctx.consumed).to.have.members(['consumer-a', 'consumer-b']);
        });
    });

    describe('stopConsumers', function () {
        it('stops the given channel', async function () {
            const _ctx = { consumed: [], stopped: [] };
            await execute('messaging-service', 'stopConsumers', { channel: CHANNEL_A_ID }, _ctx);
            expect(_ctx.stopped).to.deep.equal(['channel-a']);
        });

        it('stops all channels when channel is omitted', async function () {
            const _ctx = { consumed: [], stopped: [] };
            await execute('messaging-service', 'stopConsumers', {}, _ctx);
            expect(_ctx.stopped).to.have.members(['channel-a', 'channel-b']);
        });
    });
});
