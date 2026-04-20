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
            packageDir('@business-framework/runtime'),
            packageDir('@business-framework/middleware')
        ]);

        // entity-database mock: returns a proper entity record with id and version so
        // the relations middleware can extract sourceEntityId and sourceEntityVersion.
        registerElement({
            kind: 'service',
            id: 'entity-database',
            data: {
                interface: {
                    create: { input: {}, output: {} },
                    read:   { input: {}, output: {} },
                    update: { input: {}, output: {} },
                    amend:  { input: {}, output: {} },
                    delete: { input: {}, output: {} }
                },
                implementation: {
                    create: { return: { id: 'entity-uuid-1', entityType: '#.input.entityType', businessKey: '#.input.businessKey', revision: 1, version: 1, data: '#.input.data', state: { dimensions: {} } } },
                    read:   { return: { id: 'entity-uuid-1', entityType: '#.input.entityType', businessKey: '#.input.businessKey', revision: 1, version: 1, data: { amount: 100, currency: 'USD', customerId: 'cust-001' }, state: { dimensions: { status: 'draft' } } } },
                    update: { return: { id: 'entity-uuid-1', entityType: '#.input.entityType', businessKey: '#.input.businessKey', revision: 2, version: 1, data: '#.input.data', state: { dimensions: {} } } },
                    amend:  { return: { id: 'entity-uuid-1', entityType: '#.input.entityType', businessKey: '#.input.businessKey', revision: 2, version: 2, data: '#.input.data', state: { dimensions: {} } } },
                    delete: { return: { id: 'entity-uuid-1', entityType: '#.input.entityType', businessKey: '#.input.businessKey', revision: 1, version: 1, data: { amount: 100, currency: 'USD' }, state: { dimensions: {} } } }
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

        it('amend does not call setRelations', async () => {
            const _ctx = {};
            await executeService(SERVICE, 'amend', {
                entityType: 'order-no-rule', businessKey: 'no-rule-001', revision: 1, data: { amount: 200, currency: 'USD' }
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

        it('calls setRelations with sourceEntityVersion from entity record', async () => {
            const _ctx = {};
            await executeService(SERVICE, 'create', {
                entityType: 'order-with-rule', businessKey: 'rule-001', data: { amount: 100, currency: 'USD', customerId: 'cust-001' }
            }, _ctx);
            expect(_ctx.setRelationsCalled.sourceEntityVersion).to.equal(1);
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

        it('calls setRelations with sourceEntityId and updated version', async () => {
            const _ctx = {};
            await executeService(SERVICE, 'update', {
                entityType: 'order-with-rule', businessKey: 'rule-001', revision: 1, data: { amount: 200, currency: 'USD', customerId: 'cust-002' }
            }, _ctx);
            expect(_ctx.setRelationsCalled.sourceEntityId).to.equal('entity-uuid-1');
            expect(_ctx.setRelationsCalled.sourceEntityVersion).to.equal(1); // update mock returns version: 1
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
    describe('relation rule registered — amend', () => {

        it('calls setRelations after amend with incremented version', async () => {
            const _ctx = {};
            await executeService(SERVICE, 'amend', {
                entityType: 'order-with-rule', businessKey: 'rule-001', revision: 1, data: { amount: 300, currency: 'USD', customerId: 'cust-003' }
            }, _ctx);
            expect(_ctx.setRelationsCalled.sourceEntityId).to.equal('entity-uuid-1');
            expect(_ctx.setRelationsCalled.sourceEntityVersion).to.equal(2); // amend mock returns version: 2
        });

        it('calls setRelations with relations from amended data', async () => {
            const _ctx = {};
            await executeService(SERVICE, 'amend', {
                entityType: 'order-with-rule', businessKey: 'rule-001', revision: 1, data: { amount: 300, currency: 'USD', customerId: 'cust-003' }
            }, _ctx);
            expect(_ctx.setRelationsCalled.relations).to.deep.equal([
                { targetEntityBusinessKey: 'cust-003', relationType: 'customer' }
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

});
