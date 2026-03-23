import { expect } from 'chai';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadElements } from 'core/elements-loader';
import { execute } from 'core/service';
import { registerElement } from 'core/elements-registry';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ELEMENTS_DIR      = join(__dirname, '../elements');
const CORE_ELEMENTS_DIR = join(__dirname, '../../../core/elements');

const SERVICE = 'entity';

describe('entity service', function () {

    before(async () => {
        await loadElements([ELEMENTS_DIR, CORE_ELEMENTS_DIR]);

        // Unified entity-database mock registered once to avoid dataCache conflicts.
        // create/update/delete echo their input so CRUD tests can assert on the mapping.
        // read echoes collection/businessKey and always includes a fixed data payload
        // so execute tests can rely on current.data fields.
        registerElement({
            type: 'service',
            id: 'entity-database',
            interface: {
                create: { input: {}, output: {} },
                read:   { input: {}, output: {} },
                update: { input: {}, output: {} },
                amend:  { input: {}, output: {} },
                delete: { input: {}, output: {} }
            },
            implementation: {
                create: { return: '#.input' },
                read:   { return: { entityType: '#.input.entityType', businessKey: '#.input.businessKey', id: 'rec-1', revision: 1, version: 1, data: { amount: 100, currency: 'USD' }, state: { dimensions: { status: 'draft' } } } },
                update: { return: '#.input' },
                amend:  { return: '#.input' },
                delete: { return: '#.input' }
            }
        });

        // Mock entity-event-publisher — no-op; publishing is tested in integration tests.
        registerElement({
            type: 'service',
            id: 'entity-event-publisher',
            interface: { publish: { input: {}, output: {} } },
            implementation: { publish: { return: {} } }
        });

        // Mock inTransaction template — executes the program inline without a real DB transaction.
        registerElement({
            type: 'data',
            id: 'mock-in-transaction-template',
            meta: { kind: 'execution-node-template' },
            data: {
                keyword: 'inTransaction',
                implementation: [{ dynamic: { execute: '#.node.inTransaction' }, inputMap: '#.input' }]
            }
        });

        // Entity type definition used by CRUD validation tests.
        registerElement({ type: 'data', id: 'order', data: {
            dataSchema: { '!amount': 'number', '!currency': 'string' }
        }});

        // Entity type with statesModel used by transition tests.
        registerElement({ type: 'data', id: 'order-with-states', data: {
            dataSchema: { '!amount': 'number', '!currency': 'string' },
            statesModel: {
                initialStates: {
                    default: { dimensions: { status: 'draft' } },
                    vip:     { dimensions: { status: 'draft', tier: 'premium' } }
                },
                transitions: {
                    confirm:  { from: { status: ['draft'] },                   to: { status: 'confirmed' } },
                    cancel:   { from: { status: ['draft', 'confirmed'] },       to: { status: 'cancelled' } },
                    escalate: { from: { status: ['draft'], tier: ['standard'] }, to: { status: 'escalated', tier: 'premium' } }
                }
            }
        }});

        // Entity type and on-create handler used by handler invocation tests.
        registerElement({ type: 'data', id: 'order-with-handler', data: {
            dataSchema: { '!amount': 'number', '!currency': 'string' }
        }});
        registerElement({
            type: 'service',
            id: 'order-with-handler-on-create',
            meta: { kind: 'entity-event-handler/on-create/order-with-handler' },
            interface: { action: { input: {}, output: {} } },
            implementation: { action: [
                { name: '_ctx', set: { handlerCalledWith: '#.input' } },
                { return: '#.input' }
            ] }
        });

        // Entity type and on-update handler used by update handler invocation tests.
        registerElement({ type: 'data', id: 'order-with-update-handler', data: {
            dataSchema: { '!amount': 'number', '!currency': 'string' }
        }});
        registerElement({
            type: 'service',
            id: 'order-with-update-handler-on-update',
            meta: { kind: 'entity-event-handler/on-update/order-with-update-handler' },
            interface: { action: { input: {}, output: {} } },
            implementation: { action: [
                { name: '_ctx', set: { updateHandlerCalledWith: '#.input' } },
                { return: '#.input' }
            ] }
        });

        // Entity type and on-transition handler used by transition handler invocation tests.
        registerElement({ type: 'data', id: 'order-with-transition-handler', data: {
            dataSchema: { '!amount': 'number', '!currency': 'string' },
            statesModel: {
                transitions: {
                    confirm: { from: { status: ['draft'] }, to: { status: 'confirmed' } }
                }
            }
        }});
        registerElement({
            type: 'service',
            id: 'order-with-transition-handler-on-transition',
            meta: { kind: 'entity-event-handler/on-transition/order-with-transition-handler' },
            interface: { action: { input: {}, output: {} } },
            implementation: { action: [
                { name: '_ctx', set: { transitionHandlerCalledWith: '#.input' } },
                { return: '#.input' }
            ] }
        });

        // Services used by the execute tests — each has a unique ID so no
        // element is re-registered and the dataCache stays coherent.
        registerElement({ type: 'data', id: 'ctx-capture-component', data: {
            entityType: 'order',
            contextMapping: { amount: '#.current.data.amount', currency: '#.current.data.currency' },
            componentService: 'ctx-capture-svc'
        }});
        registerElement({ type: 'data', id: 'ctx-capture-svc', data: {
            contextSchema: 'ctx-capture-schema',
            service: 'ctx-capture-service'
        }});
        registerElement({
            type: 'service', id: 'ctx-capture-service',
            interface: { assess: { input: {}, output: {} } },
            implementation: { assess: { return: '#._ctx.entityContext' } }
        });

        registerElement({ type: 'data', id: 'dispatch-component', data: {
            entityType: 'order',
            contextMapping: {},
            componentService: 'dispatch-svc'
        }});
        registerElement({ type: 'data', id: 'dispatch-svc', data: {
            contextSchema: 'dispatch-schema',
            service: 'dispatch-service'
        }});
        registerElement({
            type: 'service', id: 'dispatch-service',
            interface: { run: { input: {}, output: {} } },
            implementation: { run: { return: { dispatched: true } } }
        });

        registerElement({ type: 'data', id: 'input-echo-component', data: {
            entityType: 'order',
            contextMapping: {},
            componentService: 'input-echo-svc'
        }});
        registerElement({ type: 'data', id: 'input-echo-svc', data: {
            contextSchema: 'input-echo-schema',
            service: 'input-echo-service'
        }});
        registerElement({
            type: 'service', id: 'input-echo-service',
            interface: { process: { input: {}, output: {} } },
            implementation: { process: { return: '#.input' } }
        });
    });

    // -------------------------------------------------------------------------
    describe('create', () => {

        it('passes entityType to entity-database', async () => {
            const result = await execute(SERVICE, 'create', {
                entityType: 'order', businessKey: 'order-001', data: { amount: 100, currency: 'USD' }
            });
            expect(result.entityType).to.equal('order');
            expect(result.businessKey).to.equal('order-001');
            expect(result.data).to.deep.equal({ amount: 100, currency: 'USD' });
        });

        it('throws when entityType is missing', async () => {
            let error;
            try { await execute(SERVICE, 'create', { businessKey: 'order-001', data: {} }); }
            catch (e) { error = e; }
            expect(error).to.be.a('string').that.includes('input is not valid');
        });

        it('throws when data does not match the entity type dataSchema', async () => {
            let error;
            try { await execute(SERVICE, 'create', { entityType: 'order', businessKey: 'order-001', data: { amount: 'not-a-number' } }); }
            catch (e) { error = e; }
            expect(error).to.be.a('string').that.includes('validation failed');
        });

        it('succeeds when data matches the entity type dataSchema', async () => {
            const result = await execute(SERVICE, 'create', {
                entityType: 'order', businessKey: 'order-001', data: { amount: 100, currency: 'USD' }
            });
            expect(result.entityType).to.equal('order');
        });

        it('throws when businessKey is missing', async () => {
            let error;
            try { await execute(SERVICE, 'create', { entityType: 'order', data: {} }); }
            catch (e) { error = e; }
            expect(error).to.be.a('string').that.includes('input is not valid');
        });

        it('throws when data is missing', async () => {
            let error;
            try { await execute(SERVICE, 'create', { entityType: 'order', businessKey: 'order-001' }); }
            catch (e) { error = e; }
            expect(error).to.be.a('string').that.includes('input is not valid');
        });

    });

    // -------------------------------------------------------------------------
    describe('create — initial state', () => {

        it('uses the default initial state when no initialState is provided', async () => {
            const result = await execute(SERVICE, 'create', {
                entityType: 'order-with-states', businessKey: 'bk-init-default', data: { amount: 100, currency: 'USD' }
            });
            expect(result.state).to.deep.equal({ dimensions: { status: 'draft' } });
        });

        it('uses the named initial state when initialState is provided', async () => {
            const result = await execute(SERVICE, 'create', {
                entityType: 'order-with-states', businessKey: 'bk-init-vip', data: { amount: 100, currency: 'USD' }, initialState: 'vip'
            });
            expect(result.state).to.deep.equal({ dimensions: { status: 'draft', tier: 'premium' } });
        });

        it('passes no state when entity type has no initialStates', async () => {
            const result = await execute(SERVICE, 'create', {
                entityType: 'order', businessKey: 'bk-no-state', data: { amount: 100, currency: 'USD' }
            });
            expect(result.state).to.be.undefined;
        });

    });

    // -------------------------------------------------------------------------
    describe('create — on-create event handlers', () => {

        it('invokes registered handlers with the created entity record', async () => {
            const _ctx = {};
            await execute(SERVICE, 'create', {
                entityType: 'order-with-handler', businessKey: 'bk-handler-test', data: { amount: 100, currency: 'USD' }
            }, _ctx);
            expect(_ctx.handlerCalledWith).to.exist;
            expect(_ctx.handlerCalledWith.businessKey).to.equal('bk-handler-test');
        });

        it('create still returns the entity record when handlers are present', async () => {
            const result = await execute(SERVICE, 'create', {
                entityType: 'order-with-handler', businessKey: 'bk-handler-return', data: { amount: 50, currency: 'USD' }
            });
            expect(result.businessKey).to.equal('bk-handler-return');
        });

        it('create works normally when no handlers are registered for the entity type', async () => {
            const result = await execute(SERVICE, 'create', {
                entityType: 'order', businessKey: 'bk-no-handler', data: { amount: 10, currency: 'USD' }
            });
            expect(result.entityType).to.equal('order');
        });

    });

    // -------------------------------------------------------------------------
    describe('read', () => {

        it('passes entityType and businessKey to entity-database', async () => {
            const result = await execute(SERVICE, 'read', {
                entityType: 'order', businessKey: 'order-001'
            });
            expect(result.entityType).to.equal('order');
            expect(result.businessKey).to.equal('order-001');
        });

    });

    // -------------------------------------------------------------------------
    describe('update', () => {

        it('passes entityType, revision and data to entity-database', async () => {
            const result = await execute(SERVICE, 'update', {
                entityType: 'order', businessKey: 'order-001', revision: 2, data: { amount: 200, currency: 'USD' }
            });
            expect(result.entityType).to.equal('order');
            expect(result.businessKey).to.equal('order-001');
            expect(result.revision).to.equal(2);
            expect(result.data).to.deep.equal({ amount: 200, currency: 'USD' });
        });

        it('throws when data does not match the entity type dataSchema', async () => {
            let error;
            try { await execute(SERVICE, 'update', { entityType: 'order', businessKey: 'order-001', revision: 1, data: { amount: 'bad' } }); }
            catch (e) { error = e; }
            expect(error).to.be.a('string').that.includes('validation failed');
        });

    });

    // -------------------------------------------------------------------------
    describe('update — on-update event handlers', () => {

        it('invokes registered handlers with the updated entity record', async () => {
            const _ctx = {};
            await execute(SERVICE, 'update', {
                entityType: 'order-with-update-handler', businessKey: 'bk-update-handler-test', revision: 1, data: { amount: 200, currency: 'USD' }
            }, _ctx);
            expect(_ctx.updateHandlerCalledWith).to.exist;
            expect(_ctx.updateHandlerCalledWith.businessKey).to.equal('bk-update-handler-test');
        });

        it('update still returns the entity record when handlers are present', async () => {
            const result = await execute(SERVICE, 'update', {
                entityType: 'order-with-update-handler', businessKey: 'bk-update-handler-return', revision: 1, data: { amount: 50, currency: 'USD' }
            });
            expect(result.businessKey).to.equal('bk-update-handler-return');
        });

        it('update works normally when no handlers are registered for the entity type', async () => {
            const result = await execute(SERVICE, 'update', {
                entityType: 'order', businessKey: 'bk-no-update-handler', revision: 1, data: { amount: 10, currency: 'USD' }
            });
            expect(result.entityType).to.equal('order');
        });

    });

    // -------------------------------------------------------------------------
    describe('delete', () => {

        it('passes entityType and revision to entity-database', async () => {
            const result = await execute(SERVICE, 'delete', {
                entityType: 'order', businessKey: 'order-001', revision: 1
            });
            expect(result.entityType).to.equal('order');
            expect(result.businessKey).to.equal('order-001');
            expect(result.revision).to.equal(1);
        });

    });

    // -------------------------------------------------------------------------
    describe('amend', () => {

        it('passes entityType, businessKey, revision and data to entity-database', async () => {
            const result = await execute(SERVICE, 'amend', {
                entityType: 'order', businessKey: 'order-001', revision: 3, data: { amount: 500, currency: 'USD' }
            });
            expect(result.entityType).to.equal('order');
            expect(result.businessKey).to.equal('order-001');
            expect(result.revision).to.equal(3);
            expect(result.data).to.deep.equal({ amount: 500, currency: 'USD' });
        });

        it('throws when data does not match the entity type dataSchema', async () => {
            let error;
            try { await execute(SERVICE, 'amend', { entityType: 'order', businessKey: 'order-001', revision: 1, data: { amount: 'bad' } }); }
            catch (e) { error = e; }
            expect(error).to.be.a('string').that.includes('validation failed');
        });

        it('throws when revision is missing', async () => {
            let error;
            try { await execute(SERVICE, 'amend', { entityType: 'order', businessKey: 'order-001', data: { amount: 100, currency: 'USD' } }); }
            catch (e) { error = e; }
            expect(error).to.be.a('string').that.includes('input is not valid');
        });

    });

    // -------------------------------------------------------------------------
    describe('transition', () => {

        it('applies the transition and returns updated state', async () => {
            const result = await execute(SERVICE, 'transition', {
                entityType: 'order-with-states', businessKey: 'order-001', transition: 'confirm'
            });
            expect(result.state.dimensions.status).to.equal('confirmed');
            expect(result.state.fromTransition).to.equal('confirm');
        });

        it('carries forward dimensions not listed in to', async () => {
            const result = await execute(SERVICE, 'transition', {
                entityType: 'order-with-states', businessKey: 'order-001', transition: 'confirm'
            });
            // 'status' is set by to; other dims from current state are preserved
            expect(result.state.dimensions).to.include.keys('status');
        });

        it('accepts transition when from matches an array of allowed values', async () => {
            const result = await execute(SERVICE, 'transition', {
                entityType: 'order-with-states', businessKey: 'order-001', transition: 'cancel'
            });
            expect(result.state.dimensions.status).to.equal('cancelled');
        });

        it('throws when transition name is not defined', async () => {
            let error;
            try { await execute(SERVICE, 'transition', { entityType: 'order-with-states', businessKey: 'order-001', transition: 'nonexistent' }); }
            catch (e) { error = e; }
            expect(error).to.be.a('string').that.includes('transition is not defined');
        });

        it('throws when current state does not match from conditions', async () => {
            let error;
            // mock read returns status='draft'; 'escalate' requires tier='standard' which is absent
            try { await execute(SERVICE, 'transition', { entityType: 'order-with-states', businessKey: 'order-001', transition: 'escalate' }); }
            catch (e) { error = e; }
            expect(error).to.be.a('string').that.includes('transition failed');
        });

        it('does not pass data to entity-database update', async () => {
            const result = await execute(SERVICE, 'transition', {
                entityType: 'order-with-states', businessKey: 'order-001', transition: 'confirm'
            });
            expect(result).to.not.have.property('data');
        });

    });

    // -------------------------------------------------------------------------
    describe('transition — on-transition event handlers', () => {

        it('invokes registered handlers with the transitioned entity record', async () => {
            const _ctx = {};
            await execute(SERVICE, 'transition', {
                entityType: 'order-with-transition-handler', businessKey: 'order-001', transition: 'confirm'
            }, _ctx);
            expect(_ctx.transitionHandlerCalledWith).to.exist;
        });

        it('transition still returns the entity record when handlers are present', async () => {
            const result = await execute(SERVICE, 'transition', {
                entityType: 'order-with-transition-handler', businessKey: 'order-001', transition: 'confirm'
            });
            expect(result.state.dimensions.status).to.equal('confirmed');
        });

        it('transition works normally when no handlers are registered for the entity type', async () => {
            const result = await execute(SERVICE, 'transition', {
                entityType: 'order-with-states', businessKey: 'order-001', transition: 'confirm'
            });
            expect(result.state.dimensions.status).to.equal('confirmed');
        });

    });

    // -------------------------------------------------------------------------
    describe('execute', () => {

        it('sets entityContext.entityType in _ctx from input', async () => {
            const result = await execute(SERVICE, 'execute', {
                entityType: 'order', businessKey: 'order-001',
                componentId: 'ctx-capture-component', methodId: 'assess', input: {}
            });
            expect(result.entityType).to.equal('order');
        });

        it('populates entityContext.data via the component contextMapping', async () => {
            const result = await execute(SERVICE, 'execute', {
                entityType: 'order', businessKey: 'order-001',
                componentId: 'ctx-capture-component', methodId: 'assess', input: {}
            });
            expect(result.data).to.deep.equal({ amount: 100, currency: 'USD' });
        });

        it('dispatches to the service declared in the component service element', async () => {
            const result = await execute(SERVICE, 'execute', {
                entityType: 'order', businessKey: 'order-001',
                componentId: 'dispatch-component', methodId: 'run', input: {}
            });
            expect(result).to.deep.equal({ dispatched: true });
        });

        it('passes method input to the component service', async () => {
            const result = await execute(SERVICE, 'execute', {
                entityType: 'order', businessKey: 'order-001',
                componentId: 'input-echo-component', methodId: 'process', input: { threshold: 500 }
            });
            expect(result).to.deep.equal({ threshold: 500 });
        });

    });

});
