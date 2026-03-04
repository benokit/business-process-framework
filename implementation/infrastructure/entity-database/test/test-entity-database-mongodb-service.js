import { expect } from 'chai';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { MongoClient } from 'mongodb';
import { loadElements } from 'core/elements-loader';
import { execute } from 'core/service';
import { connect, disconnect, getCollection } from 'mongodb-client';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ELEMENTS_DIR = join(__dirname, '../elements');
const MONGODB_URL = process.env.MONGODB_URL ?? 'mongodb://admin:password@localhost:27017/admin';
const COLLECTION = `test-service-element-${Date.now()}`;
const SERVICE = 'entity-database-mongodb';

describe('entity-database-mongodb (service element)', function () {
    let connected = false;

    before(async function () {
        const probe = new MongoClient(MONGODB_URL, { serverSelectionTimeoutMS: 2000 });
        try {
            await probe.connect();
            await probe.db().command({ ping: 1 });
            await probe.close();
        } catch {
            console.warn('\n  WARNING: MongoDB not reachable — service element tests skipped\n');
            this.skip();
        }
        await loadElements([ELEMENTS_DIR]);
        await connect();
        connected = true;
    });

    after(async function () {
        if (!connected) return;
        await getCollection(COLLECTION).drop().catch(() => {});
        await disconnect();
    });

    describe('input validation', () => {

        it('throws when collection is missing', async () => {
            let error;
            try {
                await execute(SERVICE, 'create', { businessKey: 'bk-val-1', data: { name: 'Alice' } });
            } catch (e) {
                error = e;
            }
            expect(error).to.be.a('string').that.includes('input is not valid');
        });

        it('throws when businessKey is missing from create', async () => {
            let error;
            try {
                await execute(SERVICE, 'create', { collection: COLLECTION, data: { name: 'Alice' } });
            } catch (e) {
                error = e;
            }
            expect(error).to.be.a('string').that.includes('input is not valid');
        });

    });

    describe('create', () => {

        it('returns an entity record with the correct shape including businessKey', async () => {
            const result = await execute(SERVICE, 'create', { collection: COLLECTION, businessKey: 'bk-svc-alice', data: { name: 'Alice' } });
            expect(result).to.include.keys('id', 'businessKey', 'version', 'data');
            expect(result.businessKey).to.equal('bk-svc-alice');
            expect(result.version).to.equal(1);
            expect(result.data).to.deep.equal({ name: 'Alice' });
        });

        it('throws on duplicate businessKey', async () => {
            await execute(SERVICE, 'create', { collection: COLLECTION, businessKey: 'bk-svc-dup', data: { name: 'Original' } });
            let error;
            try {
                await execute(SERVICE, 'create', { collection: COLLECTION, businessKey: 'bk-svc-dup', data: { name: 'Duplicate' } });
            } catch (e) {
                error = e;
            }
            expect(error).to.exist;
        });

    });

    describe('read by id', () => {
        let id;

        before(async () => {
            ({ id } = await execute(SERVICE, 'create', { collection: COLLECTION, businessKey: 'bk-svc-bob', data: { name: 'Bob' } }));
        });

        it('returns the entity record for an existing id', async () => {
            const result = await execute(SERVICE, 'read', { collection: COLLECTION, id });
            expect(result.id).to.equal(id);
            expect(result.businessKey).to.equal('bk-svc-bob');
            expect(result.version).to.equal(1);
            expect(result.data).to.deep.equal({ name: 'Bob' });
        });

        it('returns null for a non-existent id', async () => {
            const result = await execute(SERVICE, 'read', { collection: COLLECTION, id: '000000000000000000000000' });
            expect(result).to.be.null;
        });

    });

    describe('read by businessKey', () => {

        before(async () => {
            await execute(SERVICE, 'create', { collection: COLLECTION, businessKey: 'bk-svc-charlie', data: { name: 'Charlie' } });
        });

        it('returns the entity record for an existing businessKey', async () => {
            const result = await execute(SERVICE, 'read', { collection: COLLECTION, businessKey: 'bk-svc-charlie' });
            expect(result.businessKey).to.equal('bk-svc-charlie');
            expect(result.data).to.deep.equal({ name: 'Charlie' });
        });

        it('returns null for a non-existent businessKey', async () => {
            const result = await execute(SERVICE, 'read', { collection: COLLECTION, businessKey: 'no-such-key' });
            expect(result).to.be.null;
        });

    });

    describe('update by id', () => {
        let id, version;

        before(async () => {
            ({ id, version } = await execute(SERVICE, 'create', { collection: COLLECTION, businessKey: 'bk-svc-carol', data: { name: 'Carol' } }));
        });

        it('updates data and increments version', async () => {
            const result = await execute(SERVICE, 'update', { collection: COLLECTION, id, version, data: { name: 'Caroline' } });
            expect(result.id).to.equal(id);
            expect(result.version).to.equal(2);
            expect(result.data).to.deep.equal({ name: 'Caroline' });
        });

        it('throws on version mismatch', async () => {
            let error;
            try {
                await execute(SERVICE, 'update', { collection: COLLECTION, id, version: 99, data: { name: 'X' } });
            } catch (e) {
                error = e;
            }
            expect(error).to.be.a('string').that.includes('update failed');
        });

    });

    describe('update by businessKey', () => {
        let version;

        before(async () => {
            ({ version } = await execute(SERVICE, 'create', { collection: COLLECTION, businessKey: 'bk-svc-diana', data: { name: 'Diana' } }));
        });

        it('updates data and increments version', async () => {
            const result = await execute(SERVICE, 'update', { collection: COLLECTION, businessKey: 'bk-svc-diana', version, data: { name: 'Di' } });
            expect(result.businessKey).to.equal('bk-svc-diana');
            expect(result.version).to.equal(2);
            expect(result.data).to.deep.equal({ name: 'Di' });
        });

        it('throws on version mismatch', async () => {
            let error;
            try {
                await execute(SERVICE, 'update', { collection: COLLECTION, businessKey: 'bk-svc-diana', version: 99, data: { name: 'X' } });
            } catch (e) {
                error = e;
            }
            expect(error).to.be.a('string').that.includes('update failed');
        });

    });

    describe('delete by id', () => {
        let id, version;

        before(async () => {
            ({ id, version } = await execute(SERVICE, 'create', { collection: COLLECTION, businessKey: 'bk-svc-dave', data: { name: 'Dave' } }));
        });

        it('removes the document and returns its record', async () => {
            const result = await execute(SERVICE, 'delete', { collection: COLLECTION, id, version });
            expect(result.id).to.equal(id);
            expect(result.data).to.deep.equal({ name: 'Dave' });
        });

        it('throws when the document no longer exists', async () => {
            let error;
            try {
                await execute(SERVICE, 'delete', { collection: COLLECTION, id, version: 1 });
            } catch (e) {
                error = e;
            }
            expect(error).to.be.a('string').that.includes('delete failed');
        });

    });

    describe('delete by businessKey', () => {
        let version;

        before(async () => {
            ({ version } = await execute(SERVICE, 'create', { collection: COLLECTION, businessKey: 'bk-svc-eve', data: { name: 'Eve' } }));
        });

        it('removes the document and returns its record', async () => {
            const result = await execute(SERVICE, 'delete', { collection: COLLECTION, businessKey: 'bk-svc-eve', version });
            expect(result.businessKey).to.equal('bk-svc-eve');
            expect(result.data).to.deep.equal({ name: 'Eve' });
        });

        it('throws when the document no longer exists', async () => {
            let error;
            try {
                await execute(SERVICE, 'delete', { collection: COLLECTION, businessKey: 'bk-svc-eve', version: 1 });
            } catch (e) {
                error = e;
            }
            expect(error).to.be.a('string').that.includes('delete failed');
        });

    });

    describe('list', () => {
        const seeds = [
            { businessKey: 'bk-svc-list-frank', data: { name: 'Frank', role: 'admin' } },
            { businessKey: 'bk-svc-list-grace', data: { name: 'Grace', role: 'user'  } },
            { businessKey: 'bk-svc-list-henry', data: { name: 'Henry', role: 'user'  } }
        ];

        before(async () => {
            await Promise.all(seeds.map(({ businessKey, data }) => execute(SERVICE, 'create', { collection: COLLECTION, businessKey, data })));
        });

        it('returns all records in the collection', async () => {
            const { records } = await execute(SERVICE, 'list', { collection: COLLECTION });
            const names = records.map(r => r.data.name);
            expect(names).to.include.members(['Frank', 'Grace', 'Henry']);
        });

        it('records include businessKey', async () => {
            const { records } = await execute(SERVICE, 'list', { collection: COLLECTION, filter: { name: 'Frank' } });
            expect(records[0].businessKey).to.equal('bk-svc-list-frank');
        });

        it('filters by a data field equality', async () => {
            const { records } = await execute(SERVICE, 'list', { collection: COLLECTION, filter: { name: 'Frank' } });
            expect(records).to.have.length(1);
            expect(records[0].data.name).to.equal('Frank');
        });

        it('filters to multiple records by a shared field', async () => {
            const { records } = await execute(SERVICE, 'list', { collection: COLLECTION, filter: { role: 'user' } });
            expect(records.map(r => r.data.name)).to.include.members(['Grace', 'Henry']);
            expect(records.every(r => r.data.role === 'user')).to.be.true;
        });

        it('respects limit', async () => {
            const { records } = await execute(SERVICE, 'list', { collection: COLLECTION, limit: 1 });
            expect(records).to.have.length(1);
        });

        it('skip + limit pages through results', async () => {
            const all = (await execute(SERVICE, 'list', { collection: COLLECTION })).records;
            const page = (await execute(SERVICE, 'list', { collection: COLLECTION, skip: 1, limit: 2 })).records;
            expect(page).to.have.length(Math.min(2, all.length - 1));
        });

    });

});
