import { expect } from 'chai';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadElements } from '@business-framework/core/elements-loader';
import { executeService } from '@business-framework/core/execution';
import { registerElement } from '@business-framework/core/elements-registry';

const __dirname = dirname(fileURLToPath(import.meta.url));

const BROKER_ID   = 'mw-msg-test-broker-data';
const CHANNEL_ID  = 'mw-msg-test-channel';
const CONSUMER_ID = 'mw-msg-test-consumer';

// Helper: merges patch into the message input and calls next
function injectIntoMessage(patch) {
    return {
        inputMap: { $merge: ['#.input.input', patch] },
        execute: '#.input.next'
    };
}

describe('messaging-middleware', function () {
    before(async function () {
        await loadElements([
            join(__dirname, '../../../core/elements'),
            join(__dirname, '../../middleware/elements'),
            join(__dirname, '../elements')
        ]);

        // Mock broker: immediately invokes the wrapped handler with a test message
        // and appends the result to _ctx.results
        registerElement({
            kind: 'service',
            id: 'mw-msg-test-broker-svc',
            data: {
                interface: 'messaging-broker-interface',
                implementation: {
                    publish: { return: {} },
                    consume: [
                        {
                            outputKey: 'result',
                            inputMap: { value: 'original' },
                            execute: '#.input.handler'
                        },
                        {
                            outputKey: '_ctx',
                            set: { results: { $concat: ['#._ctx.results', ['#.result']] } }
                        }
                    ],
                    stopConsuming: { return: null }
                }
            }
        });

        registerElement({
            id: BROKER_ID,
            data: { service: 'mw-msg-test-broker-svc' }
        });

        registerElement({
            id: CHANNEL_ID,
            kind: 'message-channel',
            data: { broker: BROKER_ID, topology: 'queue', name: 'mw-msg-test-channel' }
        });

        // Consumer handler: echoes its input so middlewares' modifications are visible
        registerElement({
            id: CONSUMER_ID,
            kind: 'message-consumer',
            data: {
                channel: CHANNEL_ID,
                name: 'mw-msg-test-consumer',
                handler: [{ return: '#.input' }]
            }
        });

        // ordering 1 — injects step1:true and sets lastStep:1
        registerElement({
            id: 'mw-msg-1', kind: 'middleware/messaging',
            data: { ordering: 1, implementation: injectIntoMessage({ step1: true, lastStep: 1 }) }
        });

        // ordering 2 — injects step2:true and overwrites lastStep:2
        registerElement({
            id: 'mw-msg-2', kind: 'middleware/messaging',
            data: { ordering: 2, implementation: injectIntoMessage({ step2: true, lastStep: 2 }) }
        });

        // ordering 3 — captures consumerId from context into the message
        registerElement({
            id: 'mw-msg-3', kind: 'middleware/messaging',
            data: {
                ordering: 3,
                implementation: {
                    inputMap: { $merge: ['#.input.input', { consumerId: '#.input.context.consumerId' }] },
                    execute: '#.input.next'
                }
            }
        });
    });

    it('all middlewares are applied', async function () {
        const _ctx = { results: [] };
        await executeService('messaging-service', 'startConsumers', { channel: CHANNEL_ID }, _ctx);
        expect(_ctx.results).to.have.length(1);
        expect(_ctx.results[0].step1).to.be.true;
        expect(_ctx.results[0].step2).to.be.true;
    });

    it('middlewares executeService in ascending ordering', async function () {
        const _ctx = { results: [] };
        await executeService('messaging-service', 'startConsumers', { channel: CHANNEL_ID }, _ctx);
        // mw-msg-1 sets lastStep:1, then mw-msg-2 overwrites with lastStep:2.
        // If ordering were reversed the value would be 1.
        expect(_ctx.results[0].lastStep).to.equal(2);
    });

    it('consumerId is passed to each middleware via context', async function () {
        const _ctx = { results: [] };
        await executeService('messaging-service', 'startConsumers', { channel: CHANNEL_ID }, _ctx);
        expect(_ctx.results[0].consumerId).to.equal(CONSUMER_ID);
    });
});

describe('messaging-middleware short-circuit', function () {
    before(async function () {
        // ordering 0 — runs before mw-msg-1/2/3 and returns without calling next
        registerElement({
            id: 'mw-msg-block', kind: 'middleware/messaging',
            data: {
                ordering: 0,
                implementation: { return: { error: 'blocked' } }
            }
        });
    });

    it('returns the middleware response without reaching the handler', async function () {
        const _ctx = { results: [] };
        await executeService('messaging-service', 'startConsumers', { channel: CHANNEL_ID }, _ctx);
        expect(_ctx.results[0]).to.deep.equal({ error: 'blocked' });
        expect(_ctx.results[0].value).to.be.undefined;
    });
});
