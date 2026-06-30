import { expect } from 'chai';
import { dirname } from 'path';
import { createRequire } from 'module';
import { loadElements } from '@business-framework/runtime/elements-loader';
import { executeService } from '@business-framework/runtime/execution';
import { registerElement } from '@business-framework/runtime/elements-registry';

const require = createRequire(import.meta.url);
const packageDir = name => dirname(require.resolve(`${name}/package.json`));

const CTRL = 'entity-controller';

// HTTP request helpers
const PARAMS  = { entityType: 'order', businessKey: 'order-001' };
const HEADERS = { 'x-correlation-id': 'corr-42' };


describe('entity-controller', function () {

    before(async () => {
        await loadElements([packageDir('@business-framework/entities'), packageDir('@business-framework/definitions')]);

        // Mock entity service: echoes input, captures _ctx, always returns RECORD.
        // capturedInput stored on _ctx so tests can inspect it after executeService().
        registerElement({
            kind: 'service',
            id: 'entity',
            data: {
            interface: {
                create:     { input: {}, output: {} },
                read:       { input: {}, output: {} },
                update:     { input: {}, output: {} },
                delete:     { input: {}, output: {} },
                transition: { input: {}, output: {} },
                execute:    { input: {}, output: {} }
            },
            implementation: {
                create:     [{ outputKey: '_ctx', set: { capturedInput: '#.input' } }, { return: { id: 'rec-1', entityType: '#.input.entityType', businessKey: '#.input.businessKey', revision: 5, data: '#.input.data',   state: { dimensions: {} } } }],
                read:       [{ outputKey: '_ctx', set: { capturedInput: '#.input' } }, { return: { id: 'rec-1', entityType: '#.input.entityType', businessKey: '#.input.businessKey', revision: 5, data: { amount: 100, currency: 'USD' }, state: { dimensions: {} } } }],
                update:     [{ outputKey: '_ctx', set: { capturedInput: '#.input' } }, { return: { id: 'rec-1', entityType: '#.input.entityType', businessKey: '#.input.businessKey', revision: 5, data: '#.input.data',   state: { dimensions: {} } } }],
                delete:     [{ outputKey: '_ctx', set: { capturedInput: '#.input' } }, { return: { id: 'rec-1', entityType: '#.input.entityType', businessKey: '#.input.businessKey', revision: 5, data: {},              state: {} } }],
                transition: [{ outputKey: '_ctx', set: { capturedInput: '#.input' } }, { return: { id: 'rec-1', entityType: '#.input.entityType', businessKey: '#.input.businessKey', revision: 5, data: {},              state: { dimensions: { status: 'confirmed' } } } }],
                execute:    [{ outputKey: '_ctx', set: { capturedInput: '#.input' } }, { return: { ok: true } }]
            }}
        });
    });

    // -------------------------------------------------------------------------
    describe('create', () => {

        it('returns status 201', async () => {
            const { status } = await executeService(CTRL, 'create', {
                body: { businessKey: 'order-001', data: { amount: 100, currency: 'USD' } },
                params: { entityType: 'order' }, headers: HEADERS
            });
            expect(status).to.equal(201);
        });

        it('returns ETag header with quoted revision', async () => {
            const { headers } = await executeService(CTRL, 'create', {
                body: { businessKey: 'order-001', data: { amount: 100, currency: 'USD' } },
                params: { entityType: 'order' }, headers: HEADERS
            });
            expect(headers.ETag).to.equal('"5"');
        });

        it('returns entity record as body', async () => {
            const { body } = await executeService(CTRL, 'create', {
                body: { businessKey: 'order-001', data: { amount: 100, currency: 'USD' } },
                params: { entityType: 'order' }, headers: HEADERS
            });
            expect(body.entityType).to.equal('order');
            expect(body.businessKey).to.equal('order-001');
        });

        it('maps entityType from params and businessKey+data from body', async () => {
            const _ctx = {};
            await executeService(CTRL, 'create', {
                body: { businessKey: 'ord-bk', data: { amount: 50, currency: 'USD' } },
                params: { entityType: 'order' }, headers: {}
            }, _ctx);
            expect(_ctx.capturedInput.entityType).to.equal('order');
            expect(_ctx.capturedInput.businessKey).to.equal('ord-bk');
            expect(_ctx.capturedInput.data).to.deep.equal({ amount: 50, currency: 'USD' });
        });

        it('maps optional initialState from body', async () => {
            const _ctx = {};
            await executeService(CTRL, 'create', {
                body: { businessKey: 'ord-bk', data: { amount: 50, currency: 'USD' }, initialState: 'vip' },
                params: { entityType: 'order' }, headers: {}
            }, _ctx);
            expect(_ctx.capturedInput.initialState).to.equal('vip');
        });

        it('sets _ctx.correlation from x-correlation-id header', async () => {
            const _ctx = {};
            await executeService(CTRL, 'create', {
                body: { businessKey: 'ord-bk', data: { amount: 50, currency: 'USD' } },
                params: { entityType: 'order' }, headers: { 'x-correlation-id': 'corr-42' }
            }, _ctx);
            expect(_ctx.correlation).to.equal('corr-42');
        });

    });

    // -------------------------------------------------------------------------
    describe('read', () => {

        it('returns status 200', async () => {
            const { status } = await executeService(CTRL, 'read', { body: {}, params: PARAMS, headers: HEADERS });
            expect(status).to.equal(200);
        });

        it('returns ETag header with quoted revision', async () => {
            const { headers } = await executeService(CTRL, 'read', { body: {}, params: PARAMS, headers: HEADERS });
            expect(headers.ETag).to.equal('"5"');
        });

        it('maps entityType and businessKey from params', async () => {
            const _ctx = {};
            await executeService(CTRL, 'read', { body: {}, params: { entityType: 'product', businessKey: 'prod-7' }, headers: {} }, _ctx);
            expect(_ctx.capturedInput.entityType).to.equal('product');
            expect(_ctx.capturedInput.businessKey).to.equal('prod-7');
        });

    });

    // -------------------------------------------------------------------------
    describe('update', () => {

        it('returns status 200', async () => {
            const { status } = await executeService(CTRL, 'update', {
                body: { data: { amount: 200, currency: 'USD' } },
                params: PARAMS, headers: { 'if-match': '"5"' }
            });
            expect(status).to.equal(200);
        });

        it('returns ETag header with quoted revision', async () => {
            const { headers } = await executeService(CTRL, 'update', {
                body: { data: { amount: 200, currency: 'USD' } },
                params: PARAMS, headers: { 'if-match': '"5"' }
            });
            expect(headers.ETag).to.equal('"5"');
        });

        it('parses revision from quoted If-Match header', async () => {
            const _ctx = {};
            await executeService(CTRL, 'update', {
                body: { data: { amount: 200, currency: 'USD' } },
                params: PARAMS, headers: { 'if-match': '"3"' }
            }, _ctx);
            expect(_ctx.capturedInput.revision).to.equal(3);
        });

        it('maps data from body', async () => {
            const _ctx = {};
            await executeService(CTRL, 'update', {
                body: { data: { amount: 999, currency: 'EUR' } },
                params: PARAMS, headers: { 'if-match': '"1"' }
            }, _ctx);
            expect(_ctx.capturedInput.data).to.deep.equal({ amount: 999, currency: 'EUR' });
        });

    });

    // -------------------------------------------------------------------------
    describe('delete', () => {

        it('returns status 200', async () => {
            const { status } = await executeService(CTRL, 'delete', {
                body: {}, params: PARAMS, headers: { 'if-match': '"5"' }
            });
            expect(status).to.equal(200);
        });

        it('does not return an ETag header', async () => {
            const { headers = {} } = await executeService(CTRL, 'delete', {
                body: {}, params: PARAMS, headers: { 'if-match': '"5"' }
            });
            expect(headers).to.not.have.property('ETag');
        });

        it('parses revision from quoted If-Match header', async () => {
            const _ctx = {};
            await executeService(CTRL, 'delete', {
                body: {}, params: PARAMS, headers: { 'if-match': '"7"' }
            }, _ctx);
            expect(_ctx.capturedInput.revision).to.equal(7);
        });

        it('passes undefined revision when If-Match is absent', async () => {
            const _ctx = {};
            await executeService(CTRL, 'delete', { body: {}, params: PARAMS, headers: {} }, _ctx);
            expect(_ctx.capturedInput.revision).to.equal(undefined);
        });

    });

    // -------------------------------------------------------------------------
    describe('transition', () => {

        it('returns status 200', async () => {
            const { status } = await executeService(CTRL, 'transition', {
                body: {}, params: { ...PARAMS, transition: 'confirm' }, headers: HEADERS
            });
            expect(status).to.equal(200);
        });

        it('returns ETag header with quoted revision', async () => {
            const { headers } = await executeService(CTRL, 'transition', {
                body: {}, params: { ...PARAMS, transition: 'confirm' }, headers: HEADERS
            });
            expect(headers.ETag).to.equal('"5"');
        });

        it('maps transition from params', async () => {
            const _ctx = {};
            await executeService(CTRL, 'transition', {
                body: {}, params: { entityType: 'order', businessKey: 'order-001', transition: 'cancel' }, headers: {}
            }, _ctx);
            expect(_ctx.capturedInput.transition).to.equal('cancel');
        });

    });

    // -------------------------------------------------------------------------
    describe('execute', () => {

        it('returns status 200', async () => {
            const { status } = await executeService(CTRL, 'execute', {
                body: { amount: 100 },
                params: { ...PARAMS, method: 'run' },
                headers: HEADERS
            });
            expect(status).to.equal(200);
        });

        it('maps method from params', async () => {
            const _ctx = {};
            await executeService(CTRL, 'execute', {
                body: { threshold: 500 },
                params: { ...PARAMS, method: 'process' },
                headers: {}
            }, _ctx);
            expect(_ctx.capturedInput.method).to.equal('process');
        });

        it('maps body as methodInput to entity execute', async () => {
            const _ctx = {};
            await executeService(CTRL, 'execute', {
                body: { threshold: 500 },
                params: { ...PARAMS, method: 'process' },
                headers: {}
            }, _ctx);
            expect(_ctx.capturedInput.methodInput).to.deep.equal({ threshold: 500 });
        });

        it('parses revision from If-Match header', async () => {
            const _ctx = {};
            await executeService(CTRL, 'execute', {
                body: {},
                params: { ...PARAMS, method: 'run' },
                headers: { 'if-match': '"3"' }
            }, _ctx);
            expect(_ctx.capturedInput.revision).to.equal(3);
        });

        it('passes undefined revision when If-Match is absent', async () => {
            const _ctx = {};
            await executeService(CTRL, 'execute', {
                body: {},
                params: { ...PARAMS, method: 'run' },
                headers: {}
            }, _ctx);
            expect(_ctx.capturedInput.revision).to.equal(undefined);
        });

    });

});
