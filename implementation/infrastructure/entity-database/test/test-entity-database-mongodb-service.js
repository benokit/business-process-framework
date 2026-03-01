import { expect } from 'chai';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { MongoClient } from 'mongodb';
import { loadElements } from 'core/elements-loader';
import { execute } from 'core/service';
import { connect, disconnect, getCollection } from '../src/mongodb-client.js';

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

        it('throws when a required field is missing', async () => {
            let error;
            try {
                await execute(SERVICE, 'create', { data: { name: 'Alice' } }); // missing collection
            } catch (e) {
                error = e;
            }
            expect(error).to.be.a('string').that.includes('input is not valid');
        });

    });

    describe('create', () => {

        it('returns an entity record with the correct shape', async () => {
            const result = await execute(SERVICE, 'create', { collection: COLLECTION, data: { name: 'Alice' } });
            expect(result).to.include.keys('id', 'version', 'data');
            expect(result.version).to.equal(1);
            expect(result.data).to.deep.equal({ name: 'Alice' });
        });

    });

    describe('read', () => {
        let id;

        before(async () => {
            ({ id } = await execute(SERVICE, 'create', { collection: COLLECTION, data: { name: 'Bob' } }));
        });

        it('returns the entity record for an existing id', async () => {
            const result = await execute(SERVICE, 'read', { collection: COLLECTION, id });
            expect(result.id).to.equal(id);
            expect(result.version).to.equal(1);
            expect(result.data).to.deep.equal({ name: 'Bob' });
        });

        it('returns null for a non-existent id', async () => {
            const result = await execute(SERVICE, 'read', { collection: COLLECTION, id: '000000000000000000000000' });
            expect(result).to.be.null;
        });

    });

    describe('update', () => {
        let id, version;

        before(async () => {
            ({ id, version } = await execute(SERVICE, 'create', { collection: COLLECTION, data: { name: 'Carol' } }));
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

    describe('delete', () => {
        let id, version;

        before(async () => {
            ({ id, version } = await execute(SERVICE, 'create', { collection: COLLECTION, data: { name: 'Dave' } }));
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

    describe('list', () => {
        const seeds = [
            { name: 'Eve',   role: 'admin' },
            { name: 'Frank', role: 'user'  },
            { name: 'Grace', role: 'user'  }
        ];

        before(async () => {
            await Promise.all(seeds.map(data => execute(SERVICE, 'create', { collection: COLLECTION, data })));
        });

        it('returns all records in the collection', async () => {
            const { records } = await execute(SERVICE, 'list', { collection: COLLECTION });
            const names = records.map(r => r.data.name);
            expect(names).to.include.members(['Eve', 'Frank', 'Grace']);
        });

        it('filters by a data field equality', async () => {
            const { records } = await execute(SERVICE, 'list', { collection: COLLECTION, filter: { name: 'Eve' } });
            expect(records).to.have.length(1);
            expect(records[0].data.name).to.equal('Eve');
        });

        it('filters to multiple records by a shared field', async () => {
            const { records } = await execute(SERVICE, 'list', { collection: COLLECTION, filter: { role: 'user' } });
            expect(records.map(r => r.data.name)).to.include.members(['Frank', 'Grace']);
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
