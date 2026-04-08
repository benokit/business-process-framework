import { expect } from 'chai';
import pg from 'pg';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { connect, disconnect, getPool } from '@business-framework/postgres-client';
import { loadElements } from '@business-framework/core/elements-loader';
import { executeService } from '@business-framework/core/execution';
import { registerElement } from '@business-framework/core/elements-registry';

const __dirname = dirname(fileURLToPath(import.meta.url));

const ELEMENTS_DIR             = join(__dirname, '../elements');
const CORE_ELEMENTS_DIR        = join(__dirname, '../../../core/elements');
const ENTITY_DB_ELEMENTS_DIR   = join(__dirname, '../../../infrastructure/entity-database/elements');
const TRANSACTION_ELEMENTS_DIR = join(__dirname, '../../../infrastructure/transaction/elements');
const MESSAGING_ELEMENTS_DIR   = join(__dirname, '../../../infrastructure/messaging/elements');
const OUTBOX_ELEMENTS_DIR      = join(__dirname, '../../../infrastructure/transactional-outbox/elements');
const SEQUENCE_ELEMENTS_DIR    = join(__dirname, '../../../infrastructure/sequence-generator/elements');

const POSTGRES_URL = process.env.POSTGRES_URL ?? 'postgresql://admin:password@localhost:5432/app';
const SERVICE = 'entity';
const ENTITY_TYPE    = `integration-order-${Date.now()}`;
const BK_ENTITY_TYPE = `integration-order-bk-${Date.now()}`;

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
            CORE_ELEMENTS_DIR,
            ENTITY_DB_ELEMENTS_DIR,
            TRANSACTION_ELEMENTS_DIR,
            MESSAGING_ELEMENTS_DIR,
            OUTBOX_ELEMENTS_DIR,
            SEQUENCE_ELEMENTS_DIR,
            ELEMENTS_DIR
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
});
