import { expect } from 'chai';
import pg from 'pg';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { connect, disconnect, getPool } from 'postgres-client';
import { loadElements } from 'core/elements-loader';
import { execute } from 'core/service';
import { registerElement } from 'core/elements-registry';

const __dirname = dirname(fileURLToPath(import.meta.url));

const ELEMENTS_DIR             = join(__dirname, '../elements');
const CORE_ELEMENTS_DIR        = join(__dirname, '../../../core/elements');
const ENTITY_DB_ELEMENTS_DIR   = join(__dirname, '../../../infrastructure/entity-database/elements');
const TRANSACTION_ELEMENTS_DIR = join(__dirname, '../../../infrastructure/transaction/elements');
const MESSAGING_ELEMENTS_DIR   = join(__dirname, '../../../infrastructure/messaging/elements');
const OUTBOX_ELEMENTS_DIR      = join(__dirname, '../../../infrastructure/transactional-outbox/elements');

const POSTGRES_URL = process.env.POSTGRES_URL ?? 'postgresql://admin:password@localhost:5432/app';
const SERVICE = 'entity';
const ENTITY_TYPE = `integration-order-${Date.now()}`;

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
            ELEMENTS_DIR
        ]);

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
                        default: { dimensions: { status: 'draft' } }
                    }
                }
            }
        });
    });

    after(async function () {
        if (!connected) return;
        await getPool().query(`DELETE FROM entities WHERE entity_type = $1`, [ENTITY_TYPE]).catch(() => {});
        await getPool().query(`DELETE FROM entity_history WHERE id NOT IN (SELECT id FROM entities)`).catch(() => {});
        await getPool().query(`DELETE FROM entity_versions WHERE id NOT IN (SELECT id FROM entities)`).catch(() => {});
        await getPool().query(`DELETE FROM transactional_outbox WHERE channel = 'entity-events'`).catch(() => {});
        await disconnect();
    });

    let record;

    it('creates an order and sets the default initial state', async () => {
        record = await execute(SERVICE, 'create', {
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
        const fetched = await execute(SERVICE, 'read', {
            entityType: ENTITY_TYPE,
            businessKey: 'order-001'
        });

        expect(fetched.id).to.equal(record.id);
        expect(fetched.data).to.deep.equal({ amount: 250, currency: 'EUR' });
        expect(fetched.state.dimensions.status).to.equal('draft');
    });

    it('updates the order data', async () => {
        const updated = await execute(SERVICE, 'update', {
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
        const transitioned = await execute(SERVICE, 'transition', {
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
            await execute(SERVICE, 'transition', {
                entityType: ENTITY_TYPE,
                businessKey: 'order-001',
                transition: 'confirm'
            });
        } catch (e) {
            error = e;
        }
        expect(error).to.equal('transition failed');
    });

    it('cancels the confirmed order', async () => {
        const cancelled = await execute(SERVICE, 'transition', {
            entityType: ENTITY_TYPE,
            businessKey: 'order-001',
            transition: 'cancel'
        });

        expect(cancelled.state.dimensions.status).to.equal('cancelled');
        expect(cancelled.state.fromTransition).to.equal('cancel');
        record = cancelled;
    });

    it('amends the order data and records a version snapshot', async () => {
        const amended = await execute(SERVICE, 'amend', {
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

    it('deletes the order', async () => {
        const deleted = await execute(SERVICE, 'delete', {
            entityType: ENTITY_TYPE,
            businessKey: 'order-001'
        });

        expect(deleted.businessKey).to.equal('order-001');

        const fetched = await execute(SERVICE, 'read', {
            entityType: ENTITY_TYPE,
            businessKey: 'order-001'
        });
        expect(fetched).to.be.null;
    });
});
