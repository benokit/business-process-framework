import { expect } from 'chai';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadElements } from '@business-framework/core/elements-loader';
import { execute } from '@business-framework/core/service';
import { registerElement } from '@business-framework/core/elements-registry';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ELEMENTS_DIR          = join(__dirname, '../elements');
const CORE_ELEMENTS_DIR     = join(__dirname, '../../../core/elements');
const ENTITY_DB_ELEMENTS_DIR = join(__dirname, '../../../infrastructure/entity-database/elements');

const CTRL = 'entity-controller';

// HTTP request helpers
const PARAMS  = { entityType: 'order', businessKey: 'order-001' };
const HEADERS = { 'x-correlation-id': 'corr-42' };


describe('entity-controller', function () {

    before(async () => {
        await loadElements([ENTITY_DB_ELEMENTS_DIR, ELEMENTS_DIR, CORE_ELEMENTS_DIR]);

        // Mock entity service: echoes input, captures _ctx, always returns RECORD.
        // capturedInput stored on _ctx so tests can inspect it after execute().
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
                amend:      { input: {}, output: {} },
                execute:    { input: {}, output: {} }
            },
            implementation: {
                create:     [{ name: '_ctx', set: { capturedInput: '#.input' } }, { return: { id: 'rec-1', entityType: '#.input.entityType', businessKey: '#.input.businessKey', revision: 5, data: '#.input.data',   state: { dimensions: {} } } }],
                read:       [{ name: '_ctx', set: { capturedInput: '#.input' } }, { return: { id: 'rec-1', entityType: '#.input.entityType', businessKey: '#.input.businessKey', revision: 5, data: { amount: 100, currency: 'USD' }, state: { dimensions: {} } } }],
                update:     [{ name: '_ctx', set: { capturedInput: '#.input' } }, { return: { id: 'rec-1', entityType: '#.input.entityType', businessKey: '#.input.businessKey', revision: 5, data: '#.input.data',   state: { dimensions: {} } } }],
                delete:     [{ name: '_ctx', set: { capturedInput: '#.input' } }, { return: { id: 'rec-1', entityType: '#.input.entityType', businessKey: '#.input.businessKey', revision: 5, data: {},              state: {} } }],
                transition: [{ name: '_ctx', set: { capturedInput: '#.input' } }, { return: { id: 'rec-1', entityType: '#.input.entityType', businessKey: '#.input.businessKey', revision: 5, data: {},              state: { dimensions: { status: 'confirmed' } } } }],
                amend:      [{ name: '_ctx', set: { capturedInput: '#.input' } }, { return: { id: 'rec-1', entityType: '#.input.entityType', businessKey: '#.input.businessKey', revision: 5, data: '#.input.data',   state: { dimensions: {} } } }],
                execute:    [{ name: '_ctx', set: { capturedInput: '#.input' } }, { return: { ok: true } }]
            }}
        });
    });

    // -------------------------------------------------------------------------
    describe('create', () => {

        it('returns status 201', async () => {
            const { status } = await execute(CTRL, 'create', {
                body: { businessKey: 'order-001', data: { amount: 100, currency: 'USD' } },
                params: { entityType: 'order' }, headers: HEADERS
            });
            expect(status).to.equal(201);
        });

        it('returns ETag header with quoted revision', async () => {
            const { headers } = await execute(CTRL, 'create', {
                body: { businessKey: 'order-001', data: { amount: 100, currency: 'USD' } },
                params: { entityType: 'order' }, headers: HEADERS
            });
            expect(headers.ETag).to.equal('"5"');
        });

        it('returns entity record as body', async () => {
            const { body } = await execute(CTRL, 'create', {
                body: { businessKey: 'order-001', data: { amount: 100, currency: 'USD' } },
                params: { entityType: 'order' }, headers: HEADERS
            });
            expect(body.entityType).to.equal('order');
            expect(body.businessKey).to.equal('order-001');
        });

        it('maps entityType from params and businessKey+data from body', async () => {
            const _ctx = {};
            await execute(CTRL, 'create', {
                body: { businessKey: 'ord-bk', data: { amount: 50, currency: 'USD' } },
                params: { entityType: 'order' }, headers: {}
            }, _ctx);
            expect(_ctx.capturedInput.entityType).to.equal('order');
            expect(_ctx.capturedInput.businessKey).to.equal('ord-bk');
            expect(_ctx.capturedInput.data).to.deep.equal({ amount: 50, currency: 'USD' });
        });

        it('maps optional initialState from body', async () => {
            const _ctx = {};
            await execute(CTRL, 'create', {
                body: { businessKey: 'ord-bk', data: { amount: 50, currency: 'USD' }, initialState: 'vip' },
                params: { entityType: 'order' }, headers: {}
            }, _ctx);
            expect(_ctx.capturedInput.initialState).to.equal('vip');
        });

        it('sets _ctx.correlation from x-correlation-id header', async () => {
            const _ctx = {};
            await execute(CTRL, 'create', {
                body: { businessKey: 'ord-bk', data: { amount: 50, currency: 'USD' } },
                params: { entityType: 'order' }, headers: { 'x-correlation-id': 'corr-42' }
            }, _ctx);
            expect(_ctx.correlation).to.equal('corr-42');
        });

    });

    // -------------------------------------------------------------------------
    describe('read', () => {

        it('returns status 200', async () => {
            const { status } = await execute(CTRL, 'read', { body: {}, params: PARAMS, headers: HEADERS });
            expect(status).to.equal(200);
        });

        it('returns ETag header with quoted revision', async () => {
            const { headers } = await execute(CTRL, 'read', { body: {}, params: PARAMS, headers: HEADERS });
            expect(headers.ETag).to.equal('"5"');
        });

        it('maps entityType and businessKey from params', async () => {
            const _ctx = {};
            await execute(CTRL, 'read', { body: {}, params: { entityType: 'product', businessKey: 'prod-7' }, headers: {} }, _ctx);
            expect(_ctx.capturedInput.entityType).to.equal('product');
            expect(_ctx.capturedInput.businessKey).to.equal('prod-7');
        });

    });

    // -------------------------------------------------------------------------
    describe('update', () => {

        it('returns status 200', async () => {
            const { status } = await execute(CTRL, 'update', {
                body: { data: { amount: 200, currency: 'USD' } },
                params: PARAMS, headers: { 'if-match': '"5"' }
            });
            expect(status).to.equal(200);
        });

        it('returns ETag header with quoted revision', async () => {
            const { headers } = await execute(CTRL, 'update', {
                body: { data: { amount: 200, currency: 'USD' } },
                params: PARAMS, headers: { 'if-match': '"5"' }
            });
            expect(headers.ETag).to.equal('"5"');
        });

        it('parses revision from quoted If-Match header', async () => {
            const _ctx = {};
            await execute(CTRL, 'update', {
                body: { data: { amount: 200, currency: 'USD' } },
                params: PARAMS, headers: { 'if-match': '"3"' }
            }, _ctx);
            expect(_ctx.capturedInput.revision).to.equal(3);
        });

        it('maps data from body', async () => {
            const _ctx = {};
            await execute(CTRL, 'update', {
                body: { data: { amount: 999, currency: 'EUR' } },
                params: PARAMS, headers: { 'if-match': '"1"' }
            }, _ctx);
            expect(_ctx.capturedInput.data).to.deep.equal({ amount: 999, currency: 'EUR' });
        });

    });

    // -------------------------------------------------------------------------
    describe('delete', () => {

        it('returns status 200', async () => {
            const { status } = await execute(CTRL, 'delete', {
                body: {}, params: PARAMS, headers: { 'if-match': '"5"' }
            });
            expect(status).to.equal(200);
        });

        it('does not return an ETag header', async () => {
            const { headers = {} } = await execute(CTRL, 'delete', {
                body: {}, params: PARAMS, headers: { 'if-match': '"5"' }
            });
            expect(headers).to.not.have.property('ETag');
        });

        it('parses revision from quoted If-Match header', async () => {
            const _ctx = {};
            await execute(CTRL, 'delete', {
                body: {}, params: PARAMS, headers: { 'if-match': '"7"' }
            }, _ctx);
            expect(_ctx.capturedInput.revision).to.equal(7);
        });

        it('passes undefined revision when If-Match is absent', async () => {
            const _ctx = {};
            await execute(CTRL, 'delete', { body: {}, params: PARAMS, headers: {} }, _ctx);
            expect(_ctx.capturedInput.revision).to.equal(undefined);
        });

    });

    // -------------------------------------------------------------------------
    describe('transition', () => {

        it('returns status 200', async () => {
            const { status } = await execute(CTRL, 'transition', {
                body: {}, params: { ...PARAMS, transition: 'confirm' }, headers: HEADERS
            });
            expect(status).to.equal(200);
        });

        it('returns ETag header with quoted revision', async () => {
            const { headers } = await execute(CTRL, 'transition', {
                body: {}, params: { ...PARAMS, transition: 'confirm' }, headers: HEADERS
            });
            expect(headers.ETag).to.equal('"5"');
        });

        it('maps transition from params', async () => {
            const _ctx = {};
            await execute(CTRL, 'transition', {
                body: {}, params: { entityType: 'order', businessKey: 'order-001', transition: 'cancel' }, headers: {}
            }, _ctx);
            expect(_ctx.capturedInput.transition).to.equal('cancel');
        });

    });

    // -------------------------------------------------------------------------
    describe('amend', () => {

        it('returns status 200', async () => {
            const { status } = await execute(CTRL, 'amend', {
                body: { data: { amount: 50, currency: 'USD' } },
                params: PARAMS, headers: { 'if-match': '"2"' }
            });
            expect(status).to.equal(200);
        });

        it('returns ETag header with quoted revision', async () => {
            const { headers } = await execute(CTRL, 'amend', {
                body: { data: { amount: 50, currency: 'USD' } },
                params: PARAMS, headers: { 'if-match': '"2"' }
            });
            expect(headers.ETag).to.equal('"5"');
        });

        it('parses revision from quoted If-Match header', async () => {
            const _ctx = {};
            await execute(CTRL, 'amend', {
                body: { data: { amount: 50, currency: 'USD' } },
                params: PARAMS, headers: { 'if-match': '"4"' }
            }, _ctx);
            expect(_ctx.capturedInput.revision).to.equal(4);
        });

        it('maps optional validFrom from body', async () => {
            const _ctx = {};
            await execute(CTRL, 'amend', {
                body: { data: { amount: 50, currency: 'USD' }, validFrom: '2026-01-01' },
                params: PARAMS, headers: { 'if-match': '"1"' }
            }, _ctx);
            expect(_ctx.capturedInput.validFrom).to.equal('2026-01-01');
        });

    });

    // -------------------------------------------------------------------------
    describe('execute', () => {

        it('returns status 200', async () => {
            const { status } = await execute(CTRL, 'execute', {
                body: { amount: 100 },
                params: { ...PARAMS, componentId: 'some-component', methodId: 'run' },
                headers: HEADERS
            });
            expect(status).to.equal(200);
        });

        it('maps componentId and methodId from params', async () => {
            const _ctx = {};
            await execute(CTRL, 'execute', {
                body: { threshold: 500 },
                params: { ...PARAMS, componentId: 'comp-x', methodId: 'process' },
                headers: {}
            }, _ctx);
            expect(_ctx.capturedInput.componentId).to.equal('comp-x');
            expect(_ctx.capturedInput.methodId).to.equal('process');
        });

        it('maps body as input to entity execute', async () => {
            const _ctx = {};
            await execute(CTRL, 'execute', {
                body: { threshold: 500 },
                params: { ...PARAMS, componentId: 'comp-x', methodId: 'process' },
                headers: {}
            }, _ctx);
            expect(_ctx.capturedInput.input).to.deep.equal({ threshold: 500 });
        });

    });

});
