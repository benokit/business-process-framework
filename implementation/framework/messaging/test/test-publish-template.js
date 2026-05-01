import { expect } from 'chai';
import { dirname } from 'path';
import { createRequire } from 'module';
import { loadElements } from '@business-framework/runtime/elements-loader';
import { executeService } from '@business-framework/runtime/execution';
import { registerElement } from '@business-framework/runtime/elements-registry';

const require = createRequire(import.meta.url);
const packageDir = name => dirname(require.resolve(`${name}/package.json`));

const CHANNEL_ID = 'publish-template-test-channel';

// A service that uses the `publish` keyword with an envelope supplied via executeService,
// so tests can control the envelope through the service input.
const TEST_PUBLISHER = {
    kind: 'service',
    id: 'publish-template-test-publisher',
    data: {
        interface: {
            send: { input: { envelope: 'object' }, output: {} }
        },
        implementation: {
            send: { execute: { publish: { channel: CHANNEL_ID, envelope: '#.input.envelope' } } }
        }
    }
};

before(async function () {
    await loadElements([
        packageDir('@business-framework/definitions'),
        packageDir('@business-framework/messaging')
    ]);

    // Mock broker: captures the published envelope into _ctx.captured
    registerElement({
        kind: 'service',
        id: 'publish-template-mock-broker',
        data: {
            interface: { publish: {}, consume: {}, stopConsuming: {} },
            implementation: {
                publish: [
                    { outputKey: '_ctx', set: { captured: '#.input.envelope' } },
                    { return: { messageId: '#.input.envelope.messageId' } }
                ],
                consume:       { set: null },
                stopConsuming: { set: null }
            }
        }
    });

    registerElement({
        id: 'publish-template-test-broker',
        data: { service: 'publish-template-mock-broker' }
    });

    registerElement({
        id: CHANNEL_ID,
        data: { broker: 'publish-template-test-broker', topology: 'queue', name: CHANNEL_ID }
    });

    registerElement(TEST_PUBLISHER);
});

describe('publish node template', function () {
    async function send(envelope, _ctx = {}) {
        await executeService('publish-template-test-publisher', 'send', { envelope }, _ctx);
        return _ctx.captured;
    }

    it('auto-generates messageId as a UUID', async function () {
        const captured = await send({ group: 'g', correlation: 'c', message: {} });
        expect(captured.messageId).to.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('auto-generates timestampUTC as a UTC ISO string', async function () {
        const before = new Date().toISOString();
        const captured = await send({ group: 'g', correlation: 'c', message: {} });
        const after = new Date().toISOString();
        expect(captured.timestampUTC).to.be.a('string');
        expect(captured.timestampUTC >= before).to.be.true;
        expect(captured.timestampUTC <= after).to.be.true;
    });

    it('uses provided messageId over the generated one', async function () {
        const captured = await send({ messageId: 'my-id', group: 'g', correlation: 'c', message: {} });
        expect(captured.messageId).to.equal('my-id');
    });

    it('uses provided timestampUTC over the generated one', async function () {
        const ts = '2000-01-01T00:00:00.000Z';
        const captured = await send({ timestampUTC: ts, group: 'g', correlation: 'c', message: {} });
        expect(captured.timestampUTC).to.equal(ts);
    });

    it('falls back group and correlation to _ctx', async function () {
        const captured = await send({ message: {} }, { group: 'ctx-group', correlation: 'ctx-corr' });
        expect(captured.group).to.equal('ctx-group');
        expect(captured.correlation).to.equal('ctx-corr');
    });

    it('envelope group/correlation take precedence over _ctx', async function () {
        const captured = await send(
            { group: 'env-group', correlation: 'env-corr', message: {} },
            { group: 'ctx-group', correlation: 'ctx-corr' }
        );
        expect(captured.group).to.equal('env-group');
        expect(captured.correlation).to.equal('env-corr');
    });

    it('passes message through unchanged', async function () {
        const message = { orderId: 42, status: 'placed' };
        const captured = await send({ group: 'g', correlation: 'c', message });
        expect(captured.message).to.deep.equal(message);
    });
});