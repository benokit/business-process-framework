import { expect } from 'chai';
import pg from 'pg';
import { dirname } from 'path';
import { createRequire } from 'module';
import { connect, disconnect, getPool } from '@business-framework/postgresql';
import { loadElements } from '@business-framework/core/elements-loader';
import { executeService } from '@business-framework/core/execution';
import { registerElement } from '@business-framework/core/elements-registry';

const require = createRequire(import.meta.url);
const packageDir = name => dirname(require.resolve(`${name}/package.json`));

const POSTGRES_URL = process.env.POSTGRES_URL ?? 'postgresql://admin:password@localhost:5432/app';
const SERVICE = 'entity';
const ENTITY_TYPE    = `integration-order-${Date.now()}`;
const BK_ENTITY_TYPE = `integration-order-bk-${Date.now()}`;
const EXT_ENTITY_TYPE = `integration-ext-${Date.now()}`;
const TX_ENTITY_TYPE  = `integration-tx-${Date.now()}`;

describe('entity service — integration', function () {
    let connected = false;

    before(async function () {
        const probe = new pg.Pool({ connectionString: POSTGRES_URL, max: 1 });
        try {
            const client = await probe.connect();
            client.release();
            await probe.end();
        } catch {
            console.warn('\n  WARNING: PostgreSQL not reachable — integration tests skipped\n');
            this.skip();
        }

        await connect();
        connected = true;

        await loadElements([
            packageDir('@business-framework/core'),
            packageDir('@business-framework/middleware'),
            packageDir('@business-framework/transaction'),
            packageDir('@business-framework/messaging'),
            packageDir('@business-framework/transactional-outbox'),
            packageDir('@business-framework/sequence-generator'),
            packageDir('@business-framework/entities')
        ]);

        // Entity type with a business-key rule backed by a sequence generator.
        registerElement({ type: 'data', id: BK_ENTITY_TYPE, data: {
            dataSchema: { '!amount': 'number', '!currency': 'string' }
        }});
        registerElement({
            kind: `entity-rule/business-key/${BK_ENTITY_TYPE}`,
            data: {
                nextFromSequence: BK_ENTITY_TYPE,
                outputMap: { $printf: { _template: 'order-%d', _args: ['#'] } }
            }
        });

        // Entity type and extension used by execute integration tests.
        registerElement({ type: 'data', id: EXT_ENTITY_TYPE, data: {
            dataSchema: { '!amount': 'number', '!currency': 'string', 'note': 'string' }
        }});
        registerElement({
            kind: `service/entity-service-extension/${EXT_ENTITY_TYPE}`,
            id: `${EXT_ENTITY_TYPE}-extension`,
            data: {
                interface: {
                    captureEntity: { input: {}, output: {} },
                    addNote:       { input: { '!note': 'string' }, output: {} }
                },
                implementation: {
                    captureEntity: { return: '#._ctx.entity' },
                    addNote: [{
                        inputMap: {
                            entityType:  '#._ctx.entity.entityType',
                            businessKey: '#._ctx.entity.businessKey',
                            revision:    '#._ctx.entity.revision',
                            data: { '$merge': ['#._ctx.entity.data', { note: '#.input.note' }] }
                        },
                        service: 'entity', method: 'update'
                    }]
                }
            }
        });

        // Entity type for transaction boundary tests.
        // pre-observer (ordering=10) captures _ctx.transaction before the boundary.
        // post-observer (ordering=60) captures _ctx.transaction inside the transaction.
        registerElement({ type: 'data', id: TX_ENTITY_TYPE, data: {
            dataSchema: { '!amount': 'number', '!currency': 'string' }
        }});
        registerElement({
            kind: `middleware/entity-service/create/${TX_ENTITY_TYPE}`,
            id: `${TX_ENTITY_TYPE}-pre-observer`,
            data: {
                ordering: 10,
                implementation: [
                    { outputKey: '_ctx', set: { preTxTransaction: '#._ctx.transaction' } },
                    { inputMap: '#.input.input', execute: '#.input.next' }
                ]
            }
        });
        registerElement({
            kind: `middleware/entity-service/create/${TX_ENTITY_TYPE}`,
            id: `${TX_ENTITY_TYPE}-post-observer`,
            data: {
                ordering: 60,
                implementation: [
                    { outputKey: '_ctx', set: { postTxTransaction: '#._ctx.transaction' } },
                    { outputKey: 'result', inputMap: '#.input.input', execute: '#.input.next' },
                    { return: '#.result' }
                ]
            }
        });

        // Order entity type with a simple status lifecycle
        registerElement({
            type: 'data',
            id: ENTITY_TYPE,
            data: {
                dataSchema: {
                    '!amount': 'number',
                    '!currency': 'string',
                    'note': 'string'
                },
                statesModel: {
                    states: { status: ['draft', 'confirmed', 'cancelled'] },
                    transitions: {
                        confirm: { from: { status: ['draft'] },              to: { status: 'confirmed' } },
                        cancel:  { from: { status: ['draft', 'confirmed'] }, to: { status: 'cancelled' } }
                    },
                    initialStates: {
                        default: { status: 'draft' }
                    }
                }
            }
        });
    });

    after(async function () {
        if (!connected) return;
        await getPool().query(`DELETE FROM entities WHERE entity_type = $1`, [ENTITY_TYPE]).catch(() => {});
        await getPool().query(`DELETE FROM entities WHERE entity_type = $1`, [BK_ENTITY_TYPE]).catch(() => {});
        await getPool().query(`DELETE FROM entities WHERE entity_type = $1`, [EXT_ENTITY_TYPE]).catch(() => {});
        await getPool().query(`DELETE FROM entities WHERE entity_type = $1`, [TX_ENTITY_TYPE]).catch(() => {});
        await getPool().query(`DELETE FROM entity_history WHERE id NOT IN (SELECT id FROM entities)`).catch(() => {});
        await getPool().query(`DELETE FROM entity_versions WHERE id NOT IN (SELECT id FROM entities)`).catch(() => {});
        await getPool().query(`DELETE FROM transactional_outbox WHERE channel = 'entity-events'`).catch(() => {});
        await getPool().query(`DROP SEQUENCE IF EXISTS "${BK_ENTITY_TYPE}"`).catch(() => {});
        await disconnect();
    });

    let record;

    it('creates an order and sets the default initial state', async () => {
        record = await executeService(SERVICE, 'create', {
            entityType: ENTITY_TYPE,
            businessKey: 'order-001',
            data: { amount: 250, currency: 'EUR' }
        });

        expect(record.businessKey).to.equal('order-001');
        expect(record.revision).to.equal(1);
        expect(record.data).to.deep.equal({ amount: 250, currency: 'EUR' });
        expect(record.state.dimensions).to.deep.equal({ status: 'draft' });
    });

    it('reads the created order back', async () => {
        const fetched = await executeService(SERVICE, 'read', {
            entityType: ENTITY_TYPE,
            businessKey: 'order-001'
        });

        expect(fetched.id).to.equal(record.id);
        expect(fetched.data).to.deep.equal({ amount: 250, currency: 'EUR' });
        expect(fetched.state.dimensions.status).to.equal('draft');
    });

    it('updates the order data', async () => {
        const updated = await executeService(SERVICE, 'update', {
            entityType: ENTITY_TYPE,
            businessKey: 'order-001',
            revision: record.revision,
            data: { amount: 300, currency: 'EUR', note: 'adjusted' }
        });

        expect(updated.revision).to.equal(record.revision + 1);
        expect(updated.data.amount).to.equal(300);
        expect(updated.data.note).to.equal('adjusted');
        record = updated;
    });

    it('transitions the order to confirmed', async () => {
        const transitioned = await executeService(SERVICE, 'transition', {
            entityType: ENTITY_TYPE,
            businessKey: 'order-001',
            transition: 'confirm'
        });

        expect(transitioned.state.dimensions.status).to.equal('confirmed');
        expect(transitioned.state.fromTransition).to.equal('confirm');
        expect(transitioned.revision).to.equal(record.revision + 1);
        record = transitioned;
    });

    it('rejects a transition that violates the from constraint', async () => {
        let error;
        try {
            // order is now confirmed; confirm requires draft
            await executeService(SERVICE, 'transition', {
                entityType: ENTITY_TYPE,
                businessKey: 'order-001',
                transition: 'confirm'
            });
        } catch (e) {
            error = e;
        }
        expect(error.cause).to.equal('transition failed');
    });

    it('cancels the confirmed order', async () => {
        const cancelled = await executeService(SERVICE, 'transition', {
            entityType: ENTITY_TYPE,
            businessKey: 'order-001',
            transition: 'cancel'
        });

        expect(cancelled.state.dimensions.status).to.equal('cancelled');
        expect(cancelled.state.fromTransition).to.equal('cancel');
        record = cancelled;
    });

    it('amends the order data and records a version snapshot', async () => {
        const amended = await executeService(SERVICE, 'amend', {
            entityType: ENTITY_TYPE,
            businessKey: 'order-001',
            revision: record.revision,
            data: { amount: 400, currency: 'EUR', note: 'amended' },
            validFrom: '2025-01-01T00:00:00.000Z'
        });

        expect(amended.data.amount).to.equal(400);
        expect(amended.data.note).to.equal('amended');
        expect(amended.version).to.equal(2);
        // state must be preserved unchanged by amend
        expect(amended.state.dimensions.status).to.equal('cancelled');

        // verify the snapshot was written to entity_versions
        const { rows } = await getPool().query(
            `SELECT * FROM entity_versions WHERE id = $1 ORDER BY version`,
            [amended.id]
        );
        expect(rows).to.have.length(1);
        expect(rows[0].version).to.equal(1);
        expect(rows[0].data.amount).to.equal(300);
        expect(new Date(rows[0].valid_to).toISOString()).to.equal('2025-01-01T00:00:00.000Z');
    });

    it('generates businessKey from a sequence rule when not provided', async () => {
        const first = await executeService(SERVICE, 'create', {
            entityType: BK_ENTITY_TYPE, data: { amount: 10, currency: 'USD' }
        });
        const second = await executeService(SERVICE, 'create', {
            entityType: BK_ENTITY_TYPE, data: { amount: 20, currency: 'USD' }
        });

        expect(first.businessKey).to.match(/^order-\d+$/);
        expect(second.businessKey).to.match(/^order-\d+$/);
        expect(first.businessKey).to.not.equal(second.businessKey);
    });

    it('uses provided businessKey even when a rule is registered', async () => {
        const result = await executeService(SERVICE, 'create', {
            entityType: BK_ENTITY_TYPE, businessKey: 'explicit-bk', data: { amount: 30, currency: 'USD' }
        });

        expect(result.businessKey).to.equal('explicit-bk');
    });

    it('deletes the order', async () => {
        const deleted = await executeService(SERVICE, 'delete', {
            entityType: ENTITY_TYPE,
            businessKey: 'order-001'
        });

        expect(deleted.businessKey).to.equal('order-001');

        const fetched = await executeService(SERVICE, 'read', {
            entityType: ENTITY_TYPE,
            businessKey: 'order-001'
        });
        expect(fetched).to.be.null;
    });

    // -------------------------------------------------------------------------
    describe('execute — entity service extensions', function () {
        let extRecord;

        it('creates the entity used by extension tests', async () => {
            extRecord = await executeService(SERVICE, 'create', {
                entityType: EXT_ENTITY_TYPE,
                businessKey: 'ext-001',
                data: { amount: 100, currency: 'USD' }
            });
            expect(extRecord.businessKey).to.equal('ext-001');
            expect(extRecord.revision).to.equal(1);
        });

        it('exposes the entity record as _ctx.entity inside the extension method', async () => {
            const entity = await executeService(SERVICE, 'execute', {
                entityType: EXT_ENTITY_TYPE,
                businessKey: 'ext-001',
                method: 'captureEntity'
            });
            expect(entity.businessKey).to.equal('ext-001');
            expect(entity.revision).to.equal(1);
            expect(entity.data).to.deep.equal({ amount: 100, currency: 'USD' });
        });

        it('passes methodInput as the method input and persists changes via entity.update', async () => {
            const updated = await executeService(SERVICE, 'execute', {
                entityType: EXT_ENTITY_TYPE,
                businessKey: 'ext-001',
                method: 'addNote',
                methodInput: { note: 'hello from extension' }
            });
            expect(updated.data.note).to.equal('hello from extension');
            expect(updated.revision).to.equal(2);
            extRecord = updated;
        });

        it('succeeds when the provided revision matches the entity', async () => {
            const entity = await executeService(SERVICE, 'execute', {
                entityType: EXT_ENTITY_TYPE,
                businessKey: 'ext-001',
                method: 'captureEntity',
                revision: extRecord.revision
            });
            expect(entity.revision).to.equal(extRecord.revision);
        });

        it('throws revision mismatch when If-Match does not match the entity revision', async () => {
            let error;
            try {
                await executeService(SERVICE, 'execute', {
                    entityType: EXT_ENTITY_TYPE,
                    businessKey: 'ext-001',
                    method: 'captureEntity',
                    revision: 99
                });
            } catch (e) { error = e; }
            expect(error.cause).to.equal('revision mismatch');
        });

        it('throws method not found when no extension exposes the requested method', async () => {
            let error;
            try {
                await executeService(SERVICE, 'execute', {
                    entityType: EXT_ENTITY_TYPE,
                    businessKey: 'ext-001',
                    method: 'nonexistent'
                });
            } catch (e) { error = e; }
            expect(error.cause).to.equal('method not found');
        });
    });

    // -------------------------------------------------------------------------
    describe('transaction boundary', function () {

        it('middleware with ordering > 50 runs inside the database transaction', async () => {
            const _ctx = {};
            await executeService(SERVICE, 'create', {
                entityType: TX_ENTITY_TYPE, businessKey: 'tx-inside', data: { amount: 10, currency: 'USD' }
            }, _ctx);
            expect(_ctx.postTxTransaction).to.exist;
            expect(_ctx.postTxTransaction.sessionId).to.be.a('number');
        });

        it('middleware with ordering < 50 runs outside the database transaction', async () => {
            const _ctx = {};
            await executeService(SERVICE, 'create', {
                entityType: TX_ENTITY_TYPE, businessKey: 'tx-outside', data: { amount: 20, currency: 'USD' }
            }, _ctx);
            expect(_ctx.preTxTransaction).to.be.undefined;
        });

    });
});
