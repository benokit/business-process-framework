import { expect } from 'chai';
import { dirname } from 'path';
import { createRequire } from 'module';
import { loadElements } from '@business-framework/runtime/elements-loader';
import { executeService } from '@business-framework/runtime/execution';
import { registerElement } from '@business-framework/runtime/elements-registry';

const require = createRequire(import.meta.url);
const packageDir = name => dirname(require.resolve(`${name}/package.json`));

const SERVICE = 'entity';

describe('entity relations middleware', function () {

    before(async () => {
        await loadElements([
            packageDir('@business-framework/entities'),
            packageDir('@business-framework/definitions'),
            packageDir('@business-framework/middleware')
        ]);

        // entity-database mock: returns a proper entity record with id so
        // the relations middleware can extract sourceEntityId.
        registerElement({
            kind: 'service',
            id: 'entity-database',
            data: {
                interface: {
                    create: { input: {}, output: {} },
                    read:   { input: {}, output: {} },
                    update: { input: {}, output: {} },
                    delete: { input: {}, output: {} }
                },
                implementation: {
                    create: { return: { id: 'entity-uuid-1', entityType: '#.input.entityType', businessKey: '#.input.businessKey', revision: 1, data: '#.input.data', state: { dimensions: {} } } },
                    read:   { return: { id: 'entity-uuid-1', entityType: '#.input.entityType', businessKey: '#.input.businessKey', revision: 1, data: { amount: 100, currency: 'USD', customerId: 'cust-001' }, state: { dimensions: { status: 'draft' } } } },
                    update: { return: { id: 'entity-uuid-1', entityType: '#.input.entityType', businessKey: '#.input.businessKey', revision: 2, data: '#.input.data', state: { dimensions: {} } } },
                    delete: { return: { id: 'entity-uuid-1', entityType: '#.input.entityType', businessKey: '#.input.businessKey', revision: 1, data: { amount: 100, currency: 'USD' }, state: { dimensions: {} } } }
                }
            }
        });

        // entity-event-publisher mock — no-op.
        registerElement({
            kind: 'service',
            id: 'entity-event-publisher',
            data: {
                interface: { publish: { input: {}, output: {} } },
                implementation: { publish: { return: {} } }
            }
        });

        // transaction mock — executes the program inline without a real DB transaction.
        registerElement({
            kind: 'service',
            id: 'transaction',
            data: {
                interface: { executeInTransaction: { input: {}, output: {} } },
                implementation: { executeInTransaction: { inputMap: '#.input.programInput', execute: '#.input.program' } }
            }
        });

        // entity-relations mock — captures calls via _ctx so tests can assert on them.
        registerElement({
            kind: 'service',
            id: 'entity-relations',
            data: {
                interface: { setRelations: { input: {}, output: {} } },
                implementation: {
                    setRelations: [
                        { outputKey: '_ctx', set: { setRelationsCalled: '#.input' } },
                        { return: null }
                    ]
                }
            }
        });

        // Entity type without a relation rule.
        registerElement({ type: 'data', id: 'order-no-rule', data: {
            dataSchema: { '!amount': 'number', '!currency': 'string' }
        }});

        // Entity type with a relation rule that maps data.customerId to a customer relation.
        registerElement({ type: 'data', id: 'order-with-rule', data: {
            dataSchema: { '!amount': 'number', '!currency': 'string', 'customerId': 'string' }
        }});
        registerElement({
            kind: 'entity-rule/relations/order-with-rule',
            id: 'order-with-rule-relation-rule',
            data: [{ return: { relations: [
                { targetEntityBusinessKey: '#.input.data.customerId', relationType: 'customer' }
            ]}}]
        });

        // Entity type with two relation rules.
        registerElement({ type: 'data', id: 'order-multi-rule', data: {
            dataSchema: { '!amount': 'number', '!currency': 'string', 'customerId': 'string', 'supplierId': 'string' }
        }});
        registerElement({
            kind: 'entity-rule/relations/order-multi-rule',
            id: 'order-multi-rule-customer-rule',
            data: [{ return: { relations: [
                { targetEntityBusinessKey: '#.input.data.customerId', relationType: 'customer' }
            ]}}]
        });
        registerElement({
            kind: 'entity-rule/relations/order-multi-rule',
            id: 'order-multi-rule-supplier-rule',
            data: [{ return: { relations: [
                { targetEntityBusinessKey: '#.input.data.supplierId', relationType: 'supplier' }
            ]}}]
        });

        // Entity type with one rule that returns no relations (omits the relations key).
        registerElement({ type: 'data', id: 'order-sparse-rule', data: {
            dataSchema: { '!amount': 'number', '!currency': 'string', 'customerId': 'string' }
        }});
        registerElement({
            kind: 'entity-rule/relations/order-sparse-rule',
            id: 'order-sparse-rule-norel',
            data: [{ return: {} }]
        });
        registerElement({
            kind: 'entity-rule/relations/order-sparse-rule',
            id: 'order-sparse-rule-customer',
            data: [{ return: { relations: [
                { targetEntityBusinessKey: '#.input.data.customerId', relationType: 'customer' }
            ]}}]
        });

        // Entity type with two rules that both emit the same relation (duplicates).
        registerElement({ type: 'data', id: 'order-dup-rule', data: {
            dataSchema: { '!amount': 'number', '!currency': 'string', 'customerId': 'string' }
        }});
        registerElement({
            kind: 'entity-rule/relations/order-dup-rule',
            id: 'order-dup-rule-a',
            data: [{ return: { relations: [
                { targetEntityBusinessKey: '#.input.data.customerId', relationType: 'customer' }
            ]}}]
        });
        registerElement({
            kind: 'entity-rule/relations/order-dup-rule',
            id: 'order-dup-rule-b',
            data: [{ return: { relations: [
                { targetEntityBusinessKey: '#.input.data.customerId', relationType: 'customer' }
            ]}}]
        });
    });

    // -------------------------------------------------------------------------
    describe('no relation rule registered', () => {

        it('create does not call setRelations', async () => {
            const _ctx = {};
            await executeService(SERVICE, 'create', {
                entityType: 'order-no-rule', businessKey: 'no-rule-001', data: { amount: 100, currency: 'USD' }
            }, _ctx);
            expect(_ctx.setRelationsCalled).to.be.undefined;
        });

        it('update does not call setRelations', async () => {
            const _ctx = {};
            await executeService(SERVICE, 'update', {
                entityType: 'order-no-rule', businessKey: 'no-rule-001', revision: 1, data: { amount: 200, currency: 'USD' }
            }, _ctx);
            expect(_ctx.setRelationsCalled).to.be.undefined;
        });

        it('delete does not call setRelations', async () => {
            const _ctx = {};
            await executeService(SERVICE, 'delete', {
                entityType: 'order-no-rule', businessKey: 'no-rule-001', revision: 1
            }, _ctx);
            expect(_ctx.setRelationsCalled).to.be.undefined;
        });

    });

    // -------------------------------------------------------------------------
    describe('relation rule registered — create', () => {

        it('calls setRelations with sourceEntityId from entity record', async () => {
            const _ctx = {};
            await executeService(SERVICE, 'create', {
                entityType: 'order-with-rule', businessKey: 'rule-001', data: { amount: 100, currency: 'USD', customerId: 'cust-001' }
            }, _ctx);
            expect(_ctx.setRelationsCalled).to.exist;
            expect(_ctx.setRelationsCalled.sourceEntityId).to.equal('entity-uuid-1');
        });

        it('calls setRelations with relations derived from the rule', async () => {
            const _ctx = {};
            await executeService(SERVICE, 'create', {
                entityType: 'order-with-rule', businessKey: 'rule-001', data: { amount: 100, currency: 'USD', customerId: 'cust-001' }
            }, _ctx);
            expect(_ctx.setRelationsCalled.relations).to.deep.equal([
                { targetEntityBusinessKey: 'cust-001', relationType: 'customer' }
            ]);
        });

        it('still returns the entity record', async () => {
            const result = await executeService(SERVICE, 'create', {
                entityType: 'order-with-rule', businessKey: 'rule-001', data: { amount: 100, currency: 'USD', customerId: 'cust-001' }
            });
            expect(result.id).to.equal('entity-uuid-1');
            expect(result.businessKey).to.equal('rule-001');
        });

    });

    // -------------------------------------------------------------------------
    describe('relation rule registered — update', () => {

        it('calls setRelations with sourceEntityId from entity record', async () => {
            const _ctx = {};
            await executeService(SERVICE, 'update', {
                entityType: 'order-with-rule', businessKey: 'rule-001', revision: 1, data: { amount: 200, currency: 'USD', customerId: 'cust-002' }
            }, _ctx);
            expect(_ctx.setRelationsCalled.sourceEntityId).to.equal('entity-uuid-1');
        });

        it('calls setRelations with relations derived from updated data', async () => {
            const _ctx = {};
            await executeService(SERVICE, 'update', {
                entityType: 'order-with-rule', businessKey: 'rule-001', revision: 1, data: { amount: 200, currency: 'USD', customerId: 'cust-002' }
            }, _ctx);
            expect(_ctx.setRelationsCalled.relations).to.deep.equal([
                { targetEntityBusinessKey: 'cust-002', relationType: 'customer' }
            ]);
        });

    });

    // -------------------------------------------------------------------------
    describe('relation rule registered — delete', () => {

        it('calls setRelations with empty relations on delete', async () => {
            const _ctx = {};
            await executeService(SERVICE, 'delete', {
                entityType: 'order-with-rule', businessKey: 'rule-001', revision: 1
            }, _ctx);
            expect(_ctx.setRelationsCalled).to.exist;
            expect(_ctx.setRelationsCalled.relations).to.deep.equal([]);
        });

        it('calls setRelations with sourceEntityId from deleted entity record', async () => {
            const _ctx = {};
            await executeService(SERVICE, 'delete', {
                entityType: 'order-with-rule', businessKey: 'rule-001', revision: 1
            }, _ctx);
            expect(_ctx.setRelationsCalled.sourceEntityId).to.equal('entity-uuid-1');
        });

        it('still returns the deleted entity record', async () => {
            const result = await executeService(SERVICE, 'delete', {
                entityType: 'order-with-rule', businessKey: 'rule-001', revision: 1
            });
            expect(result.id).to.equal('entity-uuid-1');
        });

    });

    // -------------------------------------------------------------------------
    describe('multiple relation rules registered', () => {

        it('concatenates relations from all rules on create', async () => {
            const _ctx = {};
            await executeService(SERVICE, 'create', {
                entityType: 'order-multi-rule', businessKey: 'multi-001',
                data: { amount: 100, currency: 'USD', customerId: 'cust-001', supplierId: 'supp-001' }
            }, _ctx);
            expect(_ctx.setRelationsCalled.relations).to.deep.equal([
                { targetEntityBusinessKey: 'cust-001', relationType: 'customer' },
                { targetEntityBusinessKey: 'supp-001', relationType: 'supplier' }
            ]);
        });

        it('concatenates relations from all rules on update', async () => {
            const _ctx = {};
            await executeService(SERVICE, 'update', {
                entityType: 'order-multi-rule', businessKey: 'multi-001', revision: 1,
                data: { amount: 200, currency: 'USD', customerId: 'cust-002', supplierId: 'supp-002' }
            }, _ctx);
            expect(_ctx.setRelationsCalled.relations).to.deep.equal([
                { targetEntityBusinessKey: 'cust-002', relationType: 'customer' },
                { targetEntityBusinessKey: 'supp-002', relationType: 'supplier' }
            ]);
        });

    });

    // -------------------------------------------------------------------------
    describe('rule returning no relations (missing relations key)', () => {

        it('treats missing relations as empty array and concatenates with other rules', async () => {
            const _ctx = {};
            await executeService(SERVICE, 'create', {
                entityType: 'order-sparse-rule', businessKey: 'sparse-001',
                data: { amount: 100, currency: 'USD', customerId: 'cust-001' }
            }, _ctx);
            expect(_ctx.setRelationsCalled.relations).to.deep.equal([
                { targetEntityBusinessKey: 'cust-001', relationType: 'customer' }
            ]);
        });

        it('does not throw when all rules return no relations', async () => {
            registerElement({ type: 'data', id: 'order-all-empty', data: { dataSchema: { '!amount': 'number' } } });
            registerElement({ kind: 'entity-rule/relations/order-all-empty', id: 'order-all-empty-rule',
                data: [{ return: {} }] });

            const _ctx = {};
            await executeService(SERVICE, 'create', {
                entityType: 'order-all-empty', businessKey: 'empty-001', data: { amount: 50, currency: 'USD' }
            }, _ctx);
            expect(_ctx.setRelationsCalled.relations).to.deep.equal([]);
        });

    });

    // -------------------------------------------------------------------------
    describe('duplicate relations across rules', () => {

        it('passes duplicate relations through to setRelations (dedup is setRelations responsibility)', async () => {
            const _ctx = {};
            await executeService(SERVICE, 'create', {
                entityType: 'order-dup-rule', businessKey: 'dup-001',
                data: { amount: 100, currency: 'USD', customerId: 'cust-001' }
            }, _ctx);
            expect(_ctx.setRelationsCalled.relations).to.deep.equal([
                { targetEntityBusinessKey: 'cust-001', relationType: 'customer' },
                { targetEntityBusinessKey: 'cust-001', relationType: 'customer' }
            ]);
        });

    });

});
