import { expect } from 'chai';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadElements } from '@business-framework/core/elements-loader';
import { executeService } from '@business-framework/core/execution';
import { registerElement } from '@business-framework/core/elements-registry';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ELEMENTS_DIR           = join(__dirname, '../elements');
const CORE_ELEMENTS_DIR      = join(__dirname, '../../core/elements');
const MIDDLEWARE_ELEMENTS_DIR = join(__dirname, '../../infrastructure/middleware/elements');

const SERVICE = 'entity';

describe('entity service', function () {

    before(async () => {
        await loadElements([ELEMENTS_DIR, CORE_ELEMENTS_DIR, MIDDLEWARE_ELEMENTS_DIR]);

        // Unified entity-database mock registered once to avoid dataCache conflicts.
        // create/update/delete echo their input so CRUD tests can assert on the mapping.
        // read echoes collection/businessKey and always includes a fixed data payload
        // so executeService tests can rely on current.data fields.
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
                create: { return: '#.input' },
                read:   { return: { entityType: '#.input.entityType', businessKey: '#.input.businessKey', id: 'rec-1', revision: 1, version: 1, data: { amount: 100, currency: 'USD' }, state: { dimensions: { status: 'draft' } } } },
                update: { return: '#.input' },
                amend:  { return: '#.input' },
                delete: { return: '#.input' }
            }}
        });

        // Mock entity-event-publisher — no-op; publishing is tested in integration tests.
        registerElement({
            kind: 'service',
            id: 'entity-event-publisher',
            data: {
            interface: { publish: { input: {}, output: {} } },
            implementation: { publish: { return: {} } }
            }
        });

        // Mock transaction service — executes the program inline without a real DB transaction.
        registerElement({
            kind: 'service',
            id: 'transaction',
            data: {
                interface: { executeInTransaction: { input: {}, output: {} } },
                implementation: { executeInTransaction: { inputMap: '#.input.programInput', execute: '#.input.program' } }
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
                    default: { status: 'draft' },
                    vip:     { status: 'draft', tier: 'premium' }
                },
                transitions: {
                    confirm:  { from: { status: ['draft'] },                   to: { status: 'confirmed' } },
                    cancel:   { from: { status: ['draft', 'confirmed'] },       to: { status: 'cancelled' } },
                    escalate: { from: { status: ['draft'], tier: ['standard'] }, to: { status: 'escalated', tier: 'premium' } }
                }
            }
        }});

        // Entity type with post-action middleware used by create middleware tests.
        registerElement({ type: 'data', id: 'order-with-handler', data: {
            dataSchema: { '!amount': 'number', '!currency': 'string' }
        }});
        registerElement({
            kind: 'middleware/entity-service/create/order-with-handler',
            id: 'order-with-handler-on-create',
            data: {
                ordering: 10,
                implementation: [
                    { outputKey: 'result', inputMap: '#.input.input', execute: '#.input.next' },
                    { outputKey: '_ctx', set: { handlerCalledWith: '#.result' } },
                    { return: '#.result' }
                ]
            }
        });

        // Entity type with post-action middleware used by update middleware tests.
        registerElement({ type: 'data', id: 'order-with-update-handler', data: {
            dataSchema: { '!amount': 'number', '!currency': 'string' }
        }});
        registerElement({
            kind: 'middleware/entity-service/update/order-with-update-handler',
            id: 'order-with-update-handler-on-update',
            data: {
                ordering: 10,
                implementation: [
                    { outputKey: 'result', inputMap: '#.input.input', execute: '#.input.next' },
                    { outputKey: '_ctx', set: { updateHandlerCalledWith: '#.result' } },
                    { return: '#.result' }
                ]
            }
        });

        // Entity type with post-action middleware used by transition middleware tests.
        registerElement({ type: 'data', id: 'order-with-transition-handler', data: {
            dataSchema: { '!amount': 'number', '!currency': 'string' },
            statesModel: {
                transitions: {
                    confirm: { from: { status: ['draft'] }, to: { status: 'confirmed' } }
                }
            }
        }});
        registerElement({
            kind: 'middleware/entity-service/transition/order-with-transition-handler',
            id: 'order-with-transition-handler-on-transition',
            data: {
                ordering: 10,
                implementation: [
                    { outputKey: 'result', inputMap: '#.input.input', execute: '#.input.next' },
                    { outputKey: '_ctx', set: { transitionHandlerCalledWith: '#.result' } },
                    { return: '#.result' }
                ]
            }
        });

        // Entity type with pre-action middleware used by update middleware tests.
        registerElement({ type: 'data', id: 'order-with-update-guard', data: {
            dataSchema: { '!amount': 'number', '!currency': 'string' }
        }});
        registerElement({
            kind: 'middleware/entity-service/update/order-with-update-guard',
            id: 'order-with-update-guard-middleware',
            data: {
                ordering: 10,
                implementation: [
                    {
                        if: { '$lte': ['#.input.input.data.amount', 0] },
                        then: [{ throw: 'amount must be positive' }],
                        else: [{ inputMap: '#.input.input', execute: '#.input.next' }]
                    }
                ]
            }
        });

        // Entity type with pre-action middleware used by amend middleware tests.
        registerElement({ type: 'data', id: 'order-with-amend-guard', data: {
            dataSchema: { '!amount': 'number', '!currency': 'string' }
        }});
        registerElement({
            kind: 'middleware/entity-service/amend/order-with-amend-guard',
            id: 'order-with-amend-guard-middleware',
            data: {
                ordering: 10,
                implementation: [
                    {
                        if: { '$lte': ['#.input.input.data.amount', 0] },
                        then: [{ throw: 'amount must be positive' }],
                        else: [{ inputMap: '#.input.input', execute: '#.input.next' }]
                    }
                ]
            }
        });

        // Entity type with pre-action middleware used by transition middleware tests.
        registerElement({ type: 'data', id: 'order-with-transition-guard', data: {
            dataSchema: { '!amount': 'number', '!currency': 'string' },
            statesModel: {
                transitions: {
                    confirm:   { from: { status: ['draft'] }, to: { status: 'confirmed' } },
                    forbidden: { from: { status: ['draft'] }, to: { status: 'blocked' } }
                }
            }
        }});
        registerElement({
            kind: 'middleware/entity-service/transition/order-with-transition-guard',
            id: 'order-with-transition-guard-middleware',
            data: {
                ordering: 10,
                implementation: [
                    {
                        if: { '$eq': ['#.input.input.transition', 'forbidden'] },
                        then: [{ throw: 'transition forbidden by guard' }],
                        else: [{ inputMap: '#.input.input', execute: '#.input.next' }]
                    }
                ]
            }
        });

        // Entity type with two update middlewares used by middleware ordering test.
        registerElement({ type: 'data', id: 'order-with-multi-guards', data: {
            dataSchema: { '!amount': 'number', '!currency': 'string' }
        }});
        registerElement({
            kind: 'middleware/entity-service/update/order-with-multi-guards',
            id: 'order-with-multi-guards-middleware-a',
            data: {
                ordering: 10,
                implementation: [{ throw: 'error from middleware A' }]
            }
        });
        registerElement({
            kind: 'middleware/entity-service/update/order-with-multi-guards',
            id: 'order-with-multi-guards-middleware-b',
            data: {
                ordering: 20,
                implementation: [{ throw: 'error from middleware B' }]
            }
        });

        // Entity type for transaction boundary ordering tests.
        // A pre-tx guard at ordering=10 blocks when amount < 0.
        // A post-tx observer at ordering=60 records that it ran.
        registerElement({ type: 'data', id: 'order-tx-boundary', data: {
            dataSchema: { '!amount': 'number', '!currency': 'string' }
        }});
        registerElement({
            kind: 'middleware/entity-service/create/order-tx-boundary',
            id: 'order-tx-boundary-pre-guard',
            data: {
                ordering: 10,
                implementation: [
                    {
                        if: { '$lt': ['#.input.input.data.amount', 0] },
                        then: [{ throw: 'pre-tx guard rejected' }],
                        else: [{ inputMap: '#.input.input', execute: '#.input.next' }]
                    }
                ]
            }
        });
        registerElement({
            kind: 'middleware/entity-service/create/order-tx-boundary',
            id: 'order-tx-boundary-post-observer',
            data: {
                ordering: 60,
                implementation: [
                    { outputKey: 'result', inputMap: '#.input.input', execute: '#.input.next' },
                    { outputKey: '_ctx', set: { postTxObserved: true, postTxResult: '#.result' } },
                    { return: '#.result' }
                ]
            }
        });

        // Entity type and business-key rule used by business-key rule tests.
        registerElement({ type: 'data', id: 'order-with-bk-rule', data: {
            dataSchema: { '!amount': 'number', '!currency': 'string' }
        }});
        registerElement({
            kind: 'entity-rule/business-key/order-with-bk-rule',
            id: 'order-with-bk-rule-business-key',
            data: { return: { '$join': { _strings: ['generated-', '#.input.data.currency'] } } }
        });

        // Extension service used by execute tests.
        // captureEntity returns _ctx.entity; echoInput echoes the method input.
        registerElement({
            kind: 'service/entity-service-extension/order',
            id: 'order-extension',
            data: {
            interface: {
                captureEntity: { input: {}, output: {} },
                echoInput:     { input: {}, output: {} }
            },
            implementation: {
                captureEntity: { return: '#._ctx.entity' },
                echoInput:     { return: '#.input' }
            }}
        });
    });

    // -------------------------------------------------------------------------
    describe('create', () => {

        it('passes entityType to entity-database', async () => {
            const result = await executeService(SERVICE, 'create', {
                entityType: 'order', businessKey: 'order-001', data: { amount: 100, currency: 'USD' }
            });
            expect(result.entityType).to.equal('order');
            expect(result.businessKey).to.equal('order-001');
            expect(result.data).to.deep.equal({ amount: 100, currency: 'USD' });
        });

        it('throws when entityType is missing', async () => {
            let error;
            try { await executeService(SERVICE, 'create', { businessKey: 'order-001', data: {} }); }
            catch (e) { error = e; }
            expect(error.cause).to.be.a('string').that.includes('input is not valid');
        });

        it('throws when data does not match the entity type dataSchema', async () => {
            let error;
            try { await executeService(SERVICE, 'create', { entityType: 'order', businessKey: 'order-001', data: { amount: 'not-a-number' } }); }
            catch (e) { error = e; }
            expect(error.cause).to.be.a('string').that.includes('validation failed');
        });

        it('succeeds when data matches the entity type dataSchema', async () => {
            const result = await executeService(SERVICE, 'create', {
                entityType: 'order', businessKey: 'order-001', data: { amount: 100, currency: 'USD' }
            });
            expect(result.entityType).to.equal('order');
        });

        it('throws when businessKey is missing and no rule is registered', async () => {
            let error;
            try { await executeService(SERVICE, 'create', { entityType: 'order', data: { amount: 100, currency: 'USD' } }); }
            catch (e) { error = e; }
            expect(error.cause).to.be.a('string').that.includes('businessKey is required');
        });

        it('throws when data is missing', async () => {
            let error;
            try { await executeService(SERVICE, 'create', { entityType: 'order', businessKey: 'order-001' }); }
            catch (e) { error = e; }
            expect(error.cause).to.be.a('string').that.includes('input is not valid');
        });

    });

    // -------------------------------------------------------------------------
    describe('create — initial state', () => {

        it('uses the default initial state when no initialState is provided', async () => {
            const result = await executeService(SERVICE, 'create', {
                entityType: 'order-with-states', businessKey: 'bk-init-default', data: { amount: 100, currency: 'USD' }
            });
            expect(result.state).to.deep.equal({ dimensions: { status: 'draft' } });
        });

        it('uses the named initial state when initialState is provided', async () => {
            const result = await executeService(SERVICE, 'create', {
                entityType: 'order-with-states', businessKey: 'bk-init-vip', data: { amount: 100, currency: 'USD' }, initialState: 'vip'
            });
            expect(result.state).to.deep.equal({ dimensions: { status: 'draft', tier: 'premium' } });
        });

        it('passes empty dimensions state when entity type has no initialStates', async () => {
            const result = await executeService(SERVICE, 'create', {
                entityType: 'order', businessKey: 'bk-no-state', data: { amount: 100, currency: 'USD' }
            });
            expect(result.state).to.deep.equal({ dimensions: {} });
        });

    });

    // -------------------------------------------------------------------------
    describe('create — middleware', () => {

        it('invokes post-action middleware with the created entity record', async () => {
            const _ctx = {};
            await executeService(SERVICE, 'create', {
                entityType: 'order-with-handler', businessKey: 'bk-handler-test', data: { amount: 100, currency: 'USD' }
            }, _ctx);
            expect(_ctx.handlerCalledWith).to.exist;
            expect(_ctx.handlerCalledWith.businessKey).to.equal('bk-handler-test');
        });

        it('create still returns the entity record when middleware is present', async () => {
            const result = await executeService(SERVICE, 'create', {
                entityType: 'order-with-handler', businessKey: 'bk-handler-return', data: { amount: 50, currency: 'USD' }
            });
            expect(result.businessKey).to.equal('bk-handler-return');
        });

        it('create works normally when no middleware is registered for the entity type', async () => {
            const result = await executeService(SERVICE, 'create', {
                entityType: 'order', businessKey: 'bk-no-handler', data: { amount: 10, currency: 'USD' }
            });
            expect(result.entityType).to.equal('order');
        });

    });

    // -------------------------------------------------------------------------
    describe('create — transaction boundary', () => {

        it('post-transaction middleware (ordering > 50) runs when pre-transaction guard allows the operation', async () => {
            const _ctx = {};
            await executeService(SERVICE, 'create', {
                entityType: 'order-tx-boundary', businessKey: 'tx-allow', data: { amount: 100, currency: 'USD' }
            }, _ctx);
            expect(_ctx.postTxObserved).to.be.true;
            expect(_ctx.postTxResult).to.exist;
        });

        it('pre-transaction middleware (ordering < 50) aborting prevents post-transaction middleware from running', async () => {
            let error;
            const _ctx = {};
            try {
                await executeService(SERVICE, 'create', {
                    entityType: 'order-tx-boundary', businessKey: 'tx-deny', data: { amount: -1, currency: 'USD' }
                }, _ctx);
            } catch (e) { error = e; }
            expect(error.cause).to.include('pre-tx guard rejected');
            expect(_ctx.postTxObserved).to.be.undefined;
        });

    });

    // -------------------------------------------------------------------------
    describe('create — business key rules', () => {

        it('generates businessKey from the rule when not provided in input', async () => {
            const result = await executeService(SERVICE, 'create', {
                entityType: 'order-with-bk-rule', data: { amount: 100, currency: 'USD' }
            });
            expect(result.businessKey).to.equal('generated-USD');
        });

        it('uses input businessKey when provided, ignoring the rule', async () => {
            const result = await executeService(SERVICE, 'create', {
                entityType: 'order-with-bk-rule', businessKey: 'explicit-key', data: { amount: 100, currency: 'USD' }
            });
            expect(result.businessKey).to.equal('explicit-key');
        });

        it('throws when businessKey is omitted and no rule is registered for the entity type', async () => {
            let error;
            try { await executeService(SERVICE, 'create', { entityType: 'order', data: { amount: 100, currency: 'USD' } }); }
            catch (e) { error = e; }
            expect(error.cause).to.be.a('string').that.includes('businessKey is required');
        });

    });

    // -------------------------------------------------------------------------
    describe('read', () => {

        it('passes entityType and businessKey to entity-database', async () => {
            const result = await executeService(SERVICE, 'read', {
                entityType: 'order', businessKey: 'order-001'
            });
            expect(result.entityType).to.equal('order');
            expect(result.businessKey).to.equal('order-001');
        });

    });

    // -------------------------------------------------------------------------
    describe('update', () => {

        it('passes entityType, revision and data to entity-database', async () => {
            const result = await executeService(SERVICE, 'update', {
                entityType: 'order', businessKey: 'order-001', revision: 2, data: { amount: 200, currency: 'USD' }
            });
            expect(result.entityType).to.equal('order');
            expect(result.businessKey).to.equal('order-001');
            expect(result.revision).to.equal(2);
            expect(result.data).to.deep.equal({ amount: 200, currency: 'USD' });
        });

        it('throws when data does not match the entity type dataSchema', async () => {
            let error;
            try { await executeService(SERVICE, 'update', { entityType: 'order', businessKey: 'order-001', revision: 1, data: { amount: 'bad' } }); }
            catch (e) { error = e; }
            expect(error.cause).to.be.a('string').that.includes('validation failed');
        });

    });

    // -------------------------------------------------------------------------
    describe('update — post-action middleware', () => {

        it('invokes post-action middleware with the updated entity record', async () => {
            const _ctx = {};
            await executeService(SERVICE, 'update', {
                entityType: 'order-with-update-handler', businessKey: 'bk-update-handler-test', revision: 1, data: { amount: 200, currency: 'USD' }
            }, _ctx);
            expect(_ctx.updateHandlerCalledWith).to.exist;
            expect(_ctx.updateHandlerCalledWith.businessKey).to.equal('bk-update-handler-test');
        });

        it('update still returns the entity record when middleware is present', async () => {
            const result = await executeService(SERVICE, 'update', {
                entityType: 'order-with-update-handler', businessKey: 'bk-update-handler-return', revision: 1, data: { amount: 50, currency: 'USD' }
            });
            expect(result.businessKey).to.equal('bk-update-handler-return');
        });

        it('update works normally when no middleware is registered for the entity type', async () => {
            const result = await executeService(SERVICE, 'update', {
                entityType: 'order', businessKey: 'bk-no-update-handler', revision: 1, data: { amount: 10, currency: 'USD' }
            });
            expect(result.entityType).to.equal('order');
        });

    });

    // -------------------------------------------------------------------------
    describe('update — pre-action middleware', () => {

        it('throws when middleware blocks the operation', async () => {
            let error;
            try {
                await executeService(SERVICE, 'update', {
                    entityType: 'order-with-update-guard', businessKey: 'order-001', revision: 1, data: { amount: -1, currency: 'USD' }
                });
            } catch (e) { error = e; }
            expect(error.cause).to.be.a('string').that.includes('amount must be positive');
        });

        it('proceeds when middleware allows the operation', async () => {
            const result = await executeService(SERVICE, 'update', {
                entityType: 'order-with-update-guard', businessKey: 'order-001', revision: 1, data: { amount: 100, currency: 'USD' }
            });
            expect(result.data.amount).to.equal(100);
        });

        it('stops at first failing middleware in chain', async () => {
            let error;
            try {
                await executeService(SERVICE, 'update', {
                    entityType: 'order-with-multi-guards', businessKey: 'order-001', revision: 1, data: { amount: 100, currency: 'USD' }
                });
            } catch (e) { error = e; }
            expect(error.cause).to.be.a('string').that.includes('error from middleware A');
        });

        it('proceeds normally when no middleware is registered', async () => {
            const result = await executeService(SERVICE, 'update', {
                entityType: 'order', businessKey: 'order-001', revision: 1, data: { amount: 10, currency: 'USD' }
            });
            expect(result.entityType).to.equal('order');
        });

    });

    // -------------------------------------------------------------------------
    describe('delete', () => {

        it('passes entityType and revision to entity-database', async () => {
            const result = await executeService(SERVICE, 'delete', {
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
            const result = await executeService(SERVICE, 'amend', {
                entityType: 'order', businessKey: 'order-001', revision: 3, data: { amount: 500, currency: 'USD' }
            });
            expect(result.entityType).to.equal('order');
            expect(result.businessKey).to.equal('order-001');
            expect(result.revision).to.equal(3);
            expect(result.data).to.deep.equal({ amount: 500, currency: 'USD' });
        });

        it('throws when data does not match the entity type dataSchema', async () => {
            let error;
            try { await executeService(SERVICE, 'amend', { entityType: 'order', businessKey: 'order-001', revision: 1, data: { amount: 'bad' } }); }
            catch (e) { error = e; }
            expect(error.cause).to.be.a('string').that.includes('validation failed');
        });

        it('throws when revision is missing', async () => {
            let error;
            try { await executeService(SERVICE, 'amend', { entityType: 'order', businessKey: 'order-001', data: { amount: 100, currency: 'USD' } }); }
            catch (e) { error = e; }
            expect(error.cause).to.be.a('string').that.includes('input is not valid');
        });

    });

    // -------------------------------------------------------------------------
    describe('amend — pre-action middleware', () => {

        it('throws when middleware blocks the operation', async () => {
            let error;
            try {
                await executeService(SERVICE, 'amend', {
                    entityType: 'order-with-amend-guard', businessKey: 'order-001', revision: 1, data: { amount: 0, currency: 'USD' }
                });
            } catch (e) { error = e; }
            expect(error.cause).to.be.a('string').that.includes('amount must be positive');
        });

        it('proceeds when middleware allows the operation', async () => {
            const result = await executeService(SERVICE, 'amend', {
                entityType: 'order-with-amend-guard', businessKey: 'order-001', revision: 1, data: { amount: 50, currency: 'USD' }
            });
            expect(result.data.amount).to.equal(50);
        });

        it('proceeds normally when no middleware is registered', async () => {
            const result = await executeService(SERVICE, 'amend', {
                entityType: 'order', businessKey: 'order-001', revision: 1, data: { amount: 10, currency: 'USD' }
            });
            expect(result.entityType).to.equal('order');
        });

    });

    // -------------------------------------------------------------------------
    describe('transition', () => {

        it('applies the transition and returns updated state', async () => {
            const result = await executeService(SERVICE, 'transition', {
                entityType: 'order-with-states', businessKey: 'order-001', transition: 'confirm'
            });
            expect(result.state.dimensions.status).to.equal('confirmed');
            expect(result.state.fromTransition).to.equal('confirm');
        });

        it('carries forward dimensions not listed in to', async () => {
            const result = await executeService(SERVICE, 'transition', {
                entityType: 'order-with-states', businessKey: 'order-001', transition: 'confirm'
            });
            // 'status' is set by to; other dims from current state are preserved
            expect(result.state.dimensions).to.include.keys('status');
        });

        it('accepts transition when from matches an array of allowed values', async () => {
            const result = await executeService(SERVICE, 'transition', {
                entityType: 'order-with-states', businessKey: 'order-001', transition: 'cancel'
            });
            expect(result.state.dimensions.status).to.equal('cancelled');
        });

        it('throws when transition name is not defined', async () => {
            let error;
            try { await executeService(SERVICE, 'transition', { entityType: 'order-with-states', businessKey: 'order-001', transition: 'nonexistent' }); }
            catch (e) { error = e; }
            expect(error.cause).to.be.a('string').that.includes('transition is not defined');
        });

        it('throws when current state does not match from conditions', async () => {
            let error;
            // mock read returns status='draft'; 'escalate' requires tier='standard' which is absent
            try { await executeService(SERVICE, 'transition', { entityType: 'order-with-states', businessKey: 'order-001', transition: 'escalate' }); }
            catch (e) { error = e; }
            expect(error.cause).to.be.a('string').that.includes('transition failed');
        });

        it('does not pass data to entity-database update', async () => {
            const result = await executeService(SERVICE, 'transition', {
                entityType: 'order-with-states', businessKey: 'order-001', transition: 'confirm'
            });
            expect(result).to.not.have.property('data');
        });

    });

    // -------------------------------------------------------------------------
    describe('transition — post-action middleware', () => {

        it('invokes post-action middleware with the transitioned entity record', async () => {
            const _ctx = {};
            await executeService(SERVICE, 'transition', {
                entityType: 'order-with-transition-handler', businessKey: 'order-001', transition: 'confirm'
            }, _ctx);
            expect(_ctx.transitionHandlerCalledWith).to.exist;
        });

        it('transition still returns the entity record when middleware is present', async () => {
            const result = await executeService(SERVICE, 'transition', {
                entityType: 'order-with-transition-handler', businessKey: 'order-001', transition: 'confirm'
            });
            expect(result.state.dimensions.status).to.equal('confirmed');
        });

        it('transition works normally when no middleware is registered for the entity type', async () => {
            const result = await executeService(SERVICE, 'transition', {
                entityType: 'order-with-states', businessKey: 'order-001', transition: 'confirm'
            });
            expect(result.state.dimensions.status).to.equal('confirmed');
        });

    });

    // -------------------------------------------------------------------------
    describe('transition — pre-action middleware', () => {

        it('throws when middleware blocks the transition', async () => {
            let error;
            try {
                await executeService(SERVICE, 'transition', {
                    entityType: 'order-with-transition-guard', businessKey: 'order-001', transition: 'forbidden'
                });
            } catch (e) { error = e; }
            expect(error.cause).to.be.a('string').that.includes('transition forbidden by guard');
        });

        it('proceeds when middleware allows the transition', async () => {
            const result = await executeService(SERVICE, 'transition', {
                entityType: 'order-with-transition-guard', businessKey: 'order-001', transition: 'confirm'
            });
            expect(result.state.dimensions.status).to.equal('confirmed');
        });

        it('proceeds normally when no middleware is registered', async () => {
            const result = await executeService(SERVICE, 'transition', {
                entityType: 'order-with-states', businessKey: 'order-001', transition: 'confirm'
            });
            expect(result.state.dimensions.status).to.equal('confirmed');
        });

    });

    // -------------------------------------------------------------------------
    describe('execute', () => {

        it('sets _ctx.entity to the entity record before calling the extension', async () => {
            const result = await executeService(SERVICE, 'execute', {
                entityType: 'order', businessKey: 'order-001', method: 'captureEntity'
            });
            expect(result.entityType).to.equal('order');
            expect(result.businessKey).to.equal('order-001');
        });

        it('passes methodInput as input to the extension method', async () => {
            const result = await executeService(SERVICE, 'execute', {
                entityType: 'order', businessKey: 'order-001',
                method: 'echoInput', methodInput: { threshold: 500 }
            });
            expect(result).to.deep.equal({ threshold: 500 });
        });

        it('passes empty object as input when methodInput is omitted', async () => {
            const result = await executeService(SERVICE, 'execute', {
                entityType: 'order', businessKey: 'order-001', method: 'echoInput'
            });
            expect(result).to.deep.equal({});
        });

        it('throws when revision is provided and does not match the entity record', async () => {
            let error;
            try {
                await executeService(SERVICE, 'execute', {
                    entityType: 'order', businessKey: 'order-001',
                    method: 'captureEntity', revision: 99
                });
            } catch (e) { error = e; }
            expect(error.cause).to.be.a('string').that.includes('revision mismatch');
        });

        it('succeeds when revision matches the entity record', async () => {
            // mock entity-database read returns revision: 1
            const result = await executeService(SERVICE, 'execute', {
                entityType: 'order', businessKey: 'order-001',
                method: 'captureEntity', revision: 1
            });
            expect(result.revision).to.equal(1);
        });

        it('throws when no extension has the requested method', async () => {
            let error;
            try {
                await executeService(SERVICE, 'execute', {
                    entityType: 'order', businessKey: 'order-001', method: 'nonexistent'
                });
            } catch (e) { error = e; }
            expect(error.cause).to.be.a('string').that.includes('method not found');
        });

    });

});
