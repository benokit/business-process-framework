import { expect } from 'chai';
import { dirname } from 'path';
import { createRequire } from 'module';
import pg from 'pg';
import { loadElements } from '@business-framework/runtime/elements-loader';
import { executeService } from '@business-framework/runtime/execution';
import { connect, disconnect, getPool } from '@business-framework/postgresql';

const require = createRequire(import.meta.url);
const packageDir = name => dirname(require.resolve(`${name}/package.json`));
const POSTGRES_URL = process.env.POSTGRES_URL ?? 'postgresql://admin:password@localhost:5432/app';
const ENTITY_TYPE = `test-service-element-${Date.now()}`;
const SERVICE = 'entity-database';

describe('entity-database (service element)', function () {
    let connected = false;

    before(async function () {
        const probe = new pg.Pool({ connectionString: POSTGRES_URL, max: 1 });
        try {
            const client = await probe.connect();
            client.release();
            await probe.end();
        } catch {
            console.warn('\n  WARNING: PostgreSQL not reachable — service element tests skipped\n');
            this.skip();
        }
        await loadElements([
            packageDir('@business-framework/postgresql'),
            packageDir('@business-framework/db-modelling'),
            packageDir('@business-framework/entities')
        ]);
        await connect();
        await executeService('db-modeling', 'createModels', { dbType: 'postgresql' });
        connected = true;
    });

    after(async function () {
        if (!connected) return;
        await getPool().query(`DELETE FROM entities WHERE entity_type = $1`, [ENTITY_TYPE]).catch(() => {});
        await disconnect();
    });

    describe('input validation', () => {

        it('throws when entityType is missing', async () => {
            let error;
            try {
                await executeService(SERVICE, 'create', { businessKey: 'bk-val-1', data: { name: 'Alice' } });
            } catch (e) {
                error = e;
            }
            expect(error.cause).to.be.a('string').that.includes('input is not valid');
        });

        it('throws when businessKey is missing from create', async () => {
            let error;
            try {
                await executeService(SERVICE, 'create', { entityType: ENTITY_TYPE, data: { name: 'Alice' } });
            } catch (e) {
                error = e;
            }
            expect(error.cause).to.be.a('string').that.includes('input is not valid');
        });

    });

    describe('create', () => {

        it('returns an entity record with the correct shape including businessKey', async () => {
            const result = await executeService(SERVICE, 'create', { entityType: ENTITY_TYPE, businessKey: 'bk-svc-alice', data: { name: 'Alice' } });
            expect(result).to.include.keys('id', 'businessKey', 'revision', 'data');
            expect(result.businessKey).to.equal('bk-svc-alice');
            expect(result.revision).to.equal(1);
            expect(result.data).to.deep.equal({ name: 'Alice' });
        });

        it('throws on duplicate businessKey', async () => {
            await executeService(SERVICE, 'create', { entityType: ENTITY_TYPE, businessKey: 'bk-svc-dup', data: { name: 'Original' } });
            let error;
            try {
                await executeService(SERVICE, 'create', { entityType: ENTITY_TYPE, businessKey: 'bk-svc-dup', data: { name: 'Duplicate' } });
            } catch (e) {
                error = e;
            }
            expect(error).to.exist;
        });

    });

    describe('read by id', () => {
        let id;

        before(async () => {
            ({ id } = await executeService(SERVICE, 'create', { entityType: ENTITY_TYPE, businessKey: 'bk-svc-bob', data: { name: 'Bob' } }));
        });

        it('returns the entity record for an existing id', async () => {
            const result = await executeService(SERVICE, 'read', { entityType: ENTITY_TYPE, id });
            expect(result.id).to.equal(id);
            expect(result.businessKey).to.equal('bk-svc-bob');
            expect(result.revision).to.equal(1);
            expect(result.data).to.deep.equal({ name: 'Bob' });
        });

        it('returns null for a non-existent id', async () => {
            const result = await executeService(SERVICE, 'read', { entityType: ENTITY_TYPE, id: '00000000-0000-0000-0000-000000000000' });
            expect(result).to.be.null;
        });

    });

    describe('read by businessKey', () => {

        before(async () => {
            await executeService(SERVICE, 'create', { entityType: ENTITY_TYPE, businessKey: 'bk-svc-charlie', data: { name: 'Charlie' } });
        });

        it('returns the entity record for an existing businessKey', async () => {
            const result = await executeService(SERVICE, 'read', { entityType: ENTITY_TYPE, businessKey: 'bk-svc-charlie' });
            expect(result.businessKey).to.equal('bk-svc-charlie');
            expect(result.data).to.deep.equal({ name: 'Charlie' });
        });

        it('returns null for a non-existent businessKey', async () => {
            const result = await executeService(SERVICE, 'read', { entityType: ENTITY_TYPE, businessKey: 'no-such-key' });
            expect(result).to.be.null;
        });

    });

    describe('update by id', () => {
        let id, revision;

        before(async () => {
            ({ id, revision } = await executeService(SERVICE, 'create', { entityType: ENTITY_TYPE, businessKey: 'bk-svc-carol', data: { name: 'Carol' } }));
        });

        it('updates data and increments revision', async () => {
            const result = await executeService(SERVICE, 'update', { entityType: ENTITY_TYPE, id, revision, data: { name: 'Caroline' } });
            expect(result.id).to.equal(id);
            expect(result.revision).to.equal(2);
            expect(result.data).to.deep.equal({ name: 'Caroline' });
        });

        it('throws on revision mismatch', async () => {
            let error;
            try {
                await executeService(SERVICE, 'update', { entityType: ENTITY_TYPE, id, revision: 99, data: { name: 'X' } });
            } catch (e) {
                error = e;
            }
            expect(error.cause).to.be.a('string').that.includes('update failed');
        });

    });

    describe('update by businessKey', () => {
        let revision;

        before(async () => {
            ({ revision } = await executeService(SERVICE, 'create', { entityType: ENTITY_TYPE, businessKey: 'bk-svc-diana', data: { name: 'Diana' } }));
        });

        it('updates data and increments revision', async () => {
            const result = await executeService(SERVICE, 'update', { entityType: ENTITY_TYPE, businessKey: 'bk-svc-diana', revision, data: { name: 'Di' } });
            expect(result.businessKey).to.equal('bk-svc-diana');
            expect(result.revision).to.equal(2);
            expect(result.data).to.deep.equal({ name: 'Di' });
        });

        it('throws on revision mismatch', async () => {
            let error;
            try {
                await executeService(SERVICE, 'update', { entityType: ENTITY_TYPE, businessKey: 'bk-svc-diana', revision: 99, data: { name: 'X' } });
            } catch (e) {
                error = e;
            }
            expect(error.cause).to.be.a('string').that.includes('update failed');
        });

    });

    describe('delete by id', () => {
        let id, revision;

        before(async () => {
            ({ id, revision } = await executeService(SERVICE, 'create', { entityType: ENTITY_TYPE, businessKey: 'bk-svc-dave', data: { name: 'Dave' } }));
        });

        it('removes the document and returns its record', async () => {
            const result = await executeService(SERVICE, 'delete', { entityType: ENTITY_TYPE, id, revision });
            expect(result.id).to.equal(id);
            expect(result.data).to.deep.equal({ name: 'Dave' });
        });

        it('throws when the document no longer exists', async () => {
            let error;
            try {
                await executeService(SERVICE, 'delete', { entityType: ENTITY_TYPE, id, revision: 1 });
            } catch (e) {
                error = e;
            }
            expect(error.cause).to.be.a('string').that.includes('delete failed');
        });

    });

    describe('delete by businessKey', () => {
        let revision;

        before(async () => {
            ({ revision } = await executeService(SERVICE, 'create', { entityType: ENTITY_TYPE, businessKey: 'bk-svc-eve', data: { name: 'Eve' } }));
        });

        it('removes the document and returns its record', async () => {
            const result = await executeService(SERVICE, 'delete', { entityType: ENTITY_TYPE, businessKey: 'bk-svc-eve', revision });
            expect(result.businessKey).to.equal('bk-svc-eve');
            expect(result.data).to.deep.equal({ name: 'Eve' });
        });

        it('throws when the document no longer exists', async () => {
            let error;
            try {
                await executeService(SERVICE, 'delete', { entityType: ENTITY_TYPE, businessKey: 'bk-svc-eve', revision: 1 });
            } catch (e) {
                error = e;
            }
            expect(error.cause).to.be.a('string').that.includes('delete failed');
        });

    });
});
