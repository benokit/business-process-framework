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
                delete: { input: {}, output: {} }
            },
            implementation: {
                create: { return: '#.input' },
                read:   { return: { collection: '#.input.collection', businessKey: '#.input.businessKey', id: 'rec-1', version: 1, data: { amount: 100, currency: 'USD' } } },
                update: { return: '#.input' },
                delete: { return: '#.input' }
            }
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

        it('maps entityType to collection', async () => {
            const result = await execute(SERVICE, 'create', {
                entityType: 'order', businessKey: 'order-001', data: { amount: 100 }
            });
            expect(result.collection).to.equal('order');
            expect(result.businessKey).to.equal('order-001');
            expect(result.data).to.deep.equal({ amount: 100 });
        });

        it('throws when entityType is missing', async () => {
            let error;
            try { await execute(SERVICE, 'create', { businessKey: 'order-001', data: {} }); }
            catch (e) { error = e; }
            expect(error).to.be.a('string').that.includes('input is not valid');
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
    describe('read', () => {

        it('maps entityType to collection and forwards businessKey', async () => {
            const result = await execute(SERVICE, 'read', {
                entityType: 'order', businessKey: 'order-001'
            });
            expect(result.collection).to.equal('order');
            expect(result.businessKey).to.equal('order-001');
        });

    });

    // -------------------------------------------------------------------------
    describe('update', () => {

        it('maps entityType to collection and forwards version and data', async () => {
            const result = await execute(SERVICE, 'update', {
                entityType: 'order', businessKey: 'order-001', version: 2, data: { amount: 200 }
            });
            expect(result.collection).to.equal('order');
            expect(result.businessKey).to.equal('order-001');
            expect(result.version).to.equal(2);
            expect(result.data).to.deep.equal({ amount: 200 });
        });

    });

    // -------------------------------------------------------------------------
    describe('delete', () => {

        it('maps entityType to collection and forwards version', async () => {
            const result = await execute(SERVICE, 'delete', {
                entityType: 'order', businessKey: 'order-001', version: 1
            });
            expect(result.collection).to.equal('order');
            expect(result.businessKey).to.equal('order-001');
            expect(result.version).to.equal(1);
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
