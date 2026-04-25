import { expect } from 'chai';
import pg from 'pg';
import { dirname } from 'path';
import { createRequire } from 'module';
import { connect, disconnect, getPool } from '@business-framework/postgresql';
import { loadElements } from '@business-framework/runtime/elements-loader';
import { executeService } from '@business-framework/runtime/execution';
import { registerElement } from '@business-framework/runtime/elements-registry';

const require = createRequire(import.meta.url);
const packageDir = name => dirname(require.resolve(`${name}/package.json`));

const POSTGRES_URL = process.env.POSTGRES_URL ?? 'postgresql://admin:password@localhost:5432/app';

const ORDER_TYPE    = `rel-order-${Date.now()}`;
const CUSTOMER_TYPE = `rel-customer-${Date.now()}`;

async function queryRelations(sourceEntityId) {
    const { rows } = await getPool().query(
        'SELECT source_entity_id, source_entity_version, target_entity_id, relation_type FROM entity_relations WHERE source_entity_id = $1 ORDER BY relation_type',
        [sourceEntityId]
    );
    return rows;
}

describe('entity relations — integration', function () {
    let connected = false;

    before(async function () {
        const probe = new pg.Pool({ connectionString: POSTGRES_URL, max: 1 });
        try {
            const client = await probe.connect();
            client.release();
            await probe.end();
        } catch {
            console.warn('\n  WARNING: PostgreSQL not reachable — entity relations integration tests skipped\n');
            this.skip();
        }

        await loadElements([
            packageDir('@business-framework/runtime'),
            packageDir('@business-framework/middleware'),
            packageDir('@business-framework/transaction'),
            packageDir('@business-framework/messaging'),
            packageDir('@business-framework/transactional-outbox'),
            packageDir('@business-framework/sequence-generator'),
            packageDir('@business-framework/postgresql'),
            packageDir('@business-framework/database'),
            packageDir('@business-framework/entities')
        ]);

        await connect();
        await executeService('db-modeling', 'createModels', { dbType: 'postgresql' });
        connected = true;

        // Customer entity type (targets of relations).
        registerElement({ type: 'data', id: CUSTOMER_TYPE, data: {
            dataSchema: { '!name': 'string' }
        }});

        // Order entity type with a relation rule that maps data.customerId to a customer relation.
        registerElement({ type: 'data', id: ORDER_TYPE, data: {
            dataSchema: { '!amount': 'number', '!currency': 'string', 'customerId': 'string', 'secondCustomerId': 'string' }
        }});
        registerElement({
            kind: `entity-rule/relations/${ORDER_TYPE}`,
            id: `${ORDER_TYPE}-relation-rule`,
            data: [
                {
                    outputKey: 'primary',
                    if: '#.input.data.customerId',
                    then: [{ set: [{ targetEntityBusinessKey: '#.input.data.customerId', relationType: 'customer' }] }],
                    else: [{ set: [] }]
                },
                {
                    outputKey: 'secondary',
                    if: '#.input.data.secondCustomerId',
                    then: [{ set: [{ targetEntityBusinessKey: '#.input.data.secondCustomerId', relationType: 'secondary-customer' }] }],
                    else: [{ set: [] }]
                },
                { return: { relations: { '$concat': ['#.primary', '#.secondary'] } } }
            ]
        });
    });

    after(async function () {
        if (!connected) return;
        await getPool().query(`DELETE FROM entities WHERE entity_type = $1`, [ORDER_TYPE]).catch(() => {});
        await getPool().query(`DELETE FROM entities WHERE entity_type = $1`, [CUSTOMER_TYPE]).catch(() => {});
        await getPool().query(`DELETE FROM entity_history WHERE id NOT IN (SELECT id FROM entities)`).catch(() => {});
        await getPool().query(`DELETE FROM entity_versions WHERE id NOT IN (SELECT id FROM entities)`).catch(() => {});
        await getPool().query(`DELETE FROM transactional_outbox WHERE channel = 'entity-events'`).catch(() => {});
        await disconnect();
    });

    let customerA, customerB, customerC, order;

    it('creates target entities used by relation tests', async () => {
        customerA = await executeService('entity', 'create', {
            entityType: CUSTOMER_TYPE, businessKey: 'cust-a', data: { name: 'Alice' }
        });
        customerB = await executeService('entity', 'create', {
            entityType: CUSTOMER_TYPE, businessKey: 'cust-b', data: { name: 'Bob' }
        });
        customerC = await executeService('entity', 'create', {
            entityType: CUSTOMER_TYPE, businessKey: 'cust-c', data: { name: 'Carol' }
        });
        expect(customerA.id).to.exist;
        expect(customerB.id).to.exist;
        expect(customerC.id).to.exist;
    });

    it('creates a relation when creating an entity with a relation rule', async () => {
        order = await executeService('entity', 'create', {
            entityType: ORDER_TYPE, businessKey: 'order-001',
            data: { amount: 100, currency: 'EUR', customerId: 'cust-a' }
        });

        const rows = await queryRelations(order.id);
        expect(rows).to.have.length(1);
        expect(rows[0].target_entity_id).to.equal(customerA.id);
        expect(rows[0].relation_type).to.equal('customer');
        expect(rows[0].source_entity_version).to.equal(1);
    });

    it('creates multiple relations when the rule returns multiple items', async () => {
        const multi = await executeService('entity', 'create', {
            entityType: ORDER_TYPE, businessKey: 'order-multi',
            data: { amount: 200, currency: 'EUR', customerId: 'cust-a', secondCustomerId: 'cust-b' }
        });

        const rows = await queryRelations(multi.id);
        expect(rows).to.have.length(2);
        const types = rows.map(r => r.relation_type).sort();
        expect(types).to.deep.equal(['customer', 'secondary-customer']);
    });

    it('inserts new relations and deletes removed ones on update', async () => {
        const updated = await executeService('entity', 'update', {
            entityType: ORDER_TYPE, businessKey: 'order-001',
            revision: order.revision,
            data: { amount: 150, currency: 'EUR', customerId: 'cust-b' }
        });

        const rows = await queryRelations(order.id);
        expect(rows).to.have.length(1);
        expect(rows[0].target_entity_id).to.equal(customerB.id);
        expect(rows[0].relation_type).to.equal('customer');
        order = updated;
    });

    it('preserves an unchanged relation and only inserts/deletes the diff', async () => {
        // Add secondCustomerId: cust-c alongside the existing cust-b.
        const withTwo = await executeService('entity', 'update', {
            entityType: ORDER_TYPE, businessKey: 'order-001',
            revision: order.revision,
            data: { amount: 150, currency: 'EUR', customerId: 'cust-b', secondCustomerId: 'cust-c' }
        });

        let rows = await queryRelations(order.id);
        expect(rows).to.have.length(2);

        // Now remove secondCustomerId — only the secondary-customer relation should be deleted.
        const withOne = await executeService('entity', 'update', {
            entityType: ORDER_TYPE, businessKey: 'order-001',
            revision: withTwo.revision,
            data: { amount: 150, currency: 'EUR', customerId: 'cust-b' }
        });

        rows = await queryRelations(order.id);
        expect(rows).to.have.length(1);
        expect(rows[0].target_entity_id).to.equal(customerB.id);
        order = withOne;
    });

    it('clears relations on delete', async () => {
        await executeService('entity', 'delete', {
            entityType: ORDER_TYPE, businessKey: 'order-001'
        });

        const rows = await queryRelations(order.id);
        expect(rows).to.have.length(0);
    });

    it('throws when a target entity does not exist', async () => {
        let error;
        try {
            await executeService('entity', 'create', {
                entityType: ORDER_TYPE, businessKey: 'order-bad-target',
                data: { amount: 10, currency: 'USD', customerId: 'nonexistent-entity' }
            });
        } catch (e) {
            error = e;
        }
        expect(error).to.exist;
        expect(error.cause).to.be.a('string').that.includes('target entity not found');
    });

    it('amend updates the relation to match the amended data', async () => {
        const created = await executeService('entity', 'create', {
            entityType: ORDER_TYPE, businessKey: 'order-amend-test',
            data: { amount: 500, currency: 'USD', customerId: 'cust-a' }
        });

        const amended = await executeService('entity', 'amend', {
            entityType: ORDER_TYPE, businessKey: 'order-amend-test',
            revision: created.revision,
            data: { amount: 600, currency: 'USD', customerId: 'cust-c' },
            validFrom: '2025-01-01T00:00:00.000Z'
        });

        const rows = await queryRelations(created.id);
        expect(rows).to.have.length(1);
        expect(rows[0].target_entity_id).to.equal(customerC.id);
        expect(rows[0].source_entity_version).to.equal(amended.version);
    });

});
