import { expect } from 'chai';
import { MongoClient } from 'mongodb';
import { connect, disconnect, getCollection } from 'mongodb-client';
import * as db from '../src/entity-database-mongodb.js';

const MONGODB_URL = process.env.MONGODB_URL ?? 'mongodb://admin:password@localhost:27017/admin';
const COLLECTION = `test-entity-database-${Date.now()}`;

describe('entity-database-mongodb', function () {
    let connected = false;

    before(async function () {
        const probe = new MongoClient(MONGODB_URL, { serverSelectionTimeoutMS: 2000 });
        try {
            await probe.connect();
            await probe.db().command({ ping: 1 });
            await probe.close();
        } catch {
            console.warn('\n  WARNING: MongoDB not reachable at default URL — entity-database tests skipped\n');
            this.skip();
        }
        await connect();
        connected = true;
    });

    after(async function () {
        if (!connected) return;
        await getCollection(COLLECTION).drop().catch(() => {});
        await disconnect();
    });

    describe('create', () => {

        it('returns an entity record with id, businessKey, version 1, and the given data', async () => {
            const result = await db.create({ collection: COLLECTION, businessKey: 'bk-create-alice', data: { name: 'Alice' } });
            expect(result).to.include.keys('id', 'businessKey', 'version', 'data');
            expect(result.businessKey).to.equal('bk-create-alice');
            expect(result.version).to.equal(1);
            expect(result.data).to.deep.equal({ name: 'Alice' });
        });

        it('throws when businessKey is missing', async () => {
            let error;
            try {
                await db.create({ collection: COLLECTION, data: { name: 'X' } });
            } catch (e) {
                error = e;
            }
            expect(error).to.be.a('string').that.includes('businessKey');
        });

        it('throws when businessKey is an empty string', async () => {
            let error;
            try {
                await db.create({ collection: COLLECTION, businessKey: '', data: { name: 'X' } });
            } catch (e) {
                error = e;
            }
            expect(error).to.be.a('string').that.includes('businessKey');
        });

        it('throws on duplicate businessKey', async () => {
            await db.create({ collection: COLLECTION, businessKey: 'bk-create-dup', data: { name: 'Original' } });
            let error;
            try {
                await db.create({ collection: COLLECTION, businessKey: 'bk-create-dup', data: { name: 'Duplicate' } });
            } catch (e) {
                error = e;
            }
            expect(error).to.exist;
        });

    });

    describe('read by id', () => {
        let id;

        before(async () => {
            ({ id } = await db.create({ collection: COLLECTION, businessKey: 'bk-read-bob', data: { name: 'Bob' } }));
        });

        it('returns the entity record for an existing id', async () => {
            const result = await db.read({ collection: COLLECTION, id });
            expect(result.id).to.equal(id);
            expect(result.businessKey).to.equal('bk-read-bob');
            expect(result.version).to.equal(1);
            expect(result.data).to.deep.equal({ name: 'Bob' });
        });

        it('returns null for a non-existent id', async () => {
            const result = await db.read({ collection: COLLECTION, id: '000000000000000000000000' });
            expect(result).to.be.null;
        });

    });

    describe('read by businessKey', () => {

        before(async () => {
            await db.create({ collection: COLLECTION, businessKey: 'bk-read-bk-charlie', data: { name: 'Charlie' } });
        });

        it('returns the entity record for an existing businessKey', async () => {
            const result = await db.read({ collection: COLLECTION, businessKey: 'bk-read-bk-charlie' });
            expect(result.businessKey).to.equal('bk-read-bk-charlie');
            expect(result.data).to.deep.equal({ name: 'Charlie' });
        });

        it('returns null for a non-existent businessKey', async () => {
            const result = await db.read({ collection: COLLECTION, businessKey: 'no-such-key' });
            expect(result).to.be.null;
        });

    });

    describe('update by id', () => {
        let id, version;

        before(async () => {
            ({ id, version } = await db.create({ collection: COLLECTION, businessKey: 'bk-update-carol', data: { name: 'Carol' } }));
        });

        it('updates data and increments version', async () => {
            const result = await db.update({ collection: COLLECTION, id, version, data: { name: 'Caroline' } });
            expect(result.id).to.equal(id);
            expect(result.version).to.equal(2);
            expect(result.data).to.deep.equal({ name: 'Caroline' });
        });

        it('throws when version does not match', async () => {
            let error;
            try {
                await db.update({ collection: COLLECTION, id, version: 99, data: { name: 'X' } });
            } catch (e) {
                error = e;
            }
            expect(error).to.be.a('string').that.includes('update failed');
        });

    });

    describe('update by businessKey', () => {
        let version;

        before(async () => {
            ({ version } = await db.create({ collection: COLLECTION, businessKey: 'bk-update-bk-diana', data: { name: 'Diana' } }));
        });

        it('updates data and increments version', async () => {
            const result = await db.update({ collection: COLLECTION, businessKey: 'bk-update-bk-diana', version, data: { name: 'Di' } });
            expect(result.businessKey).to.equal('bk-update-bk-diana');
            expect(result.version).to.equal(2);
            expect(result.data).to.deep.equal({ name: 'Di' });
        });

        it('throws when version does not match', async () => {
            let error;
            try {
                await db.update({ collection: COLLECTION, businessKey: 'bk-update-bk-diana', version: 99, data: { name: 'X' } });
            } catch (e) {
                error = e;
            }
            expect(error).to.be.a('string').that.includes('update failed');
        });

    });

    describe('delete by id', () => {
        let id, version;

        before(async () => {
            ({ id, version } = await db.create({ collection: COLLECTION, businessKey: 'bk-delete-dave', data: { name: 'Dave' } }));
        });

        it('removes the document and returns its record', async () => {
            const result = await db['delete']({ collection: COLLECTION, id, version });
            expect(result.id).to.equal(id);
            expect(result.data).to.deep.equal({ name: 'Dave' });
        });

        it('throws when the document no longer exists', async () => {
            let error;
            try {
                await db['delete']({ collection: COLLECTION, id, version: 1 });
            } catch (e) {
                error = e;
            }
            expect(error).to.be.a('string').that.includes('delete failed');
        });

    });

    describe('delete by businessKey', () => {
        let version;

        before(async () => {
            ({ version } = await db.create({ collection: COLLECTION, businessKey: 'bk-delete-bk-eve', data: { name: 'Eve' } }));
        });

        it('removes the document and returns its record', async () => {
            const result = await db['delete']({ collection: COLLECTION, businessKey: 'bk-delete-bk-eve', version });
            expect(result.businessKey).to.equal('bk-delete-bk-eve');
            expect(result.data).to.deep.equal({ name: 'Eve' });
        });

        it('throws when the document no longer exists', async () => {
            let error;
            try {
                await db['delete']({ collection: COLLECTION, businessKey: 'bk-delete-bk-eve', version: 1 });
            } catch (e) {
                error = e;
            }
            expect(error).to.be.a('string').that.includes('delete failed');
        });

    });

    describe('list', () => {
        const seeds = [
            { businessKey: 'bk-list-frank', data: { name: 'Frank', role: 'admin' } },
            { businessKey: 'bk-list-grace', data: { name: 'Grace', role: 'user'  } },
            { businessKey: 'bk-list-henry', data: { name: 'Henry', role: 'user'  } }
        ];

        before(async () => {
            await Promise.all(seeds.map(({ businessKey, data }) => db.create({ collection: COLLECTION, businessKey, data })));
        });

        it('returns all records in the collection', async () => {
            const { records } = await db.list({ collection: COLLECTION });
            const names = records.map(r => r.data.name);
            expect(names).to.include.members(['Frank', 'Grace', 'Henry']);
        });

        it('records include businessKey', async () => {
            const { records } = await db.list({ collection: COLLECTION, filter: { name: 'Frank' } });
            expect(records[0].businessKey).to.equal('bk-list-frank');
        });

        it('filters by a data field equality', async () => {
            const { records } = await db.list({ collection: COLLECTION, filter: { name: 'Frank' } });
            expect(records).to.have.length(1);
            expect(records[0].data.name).to.equal('Frank');
        });

        it('filters by multiple data fields', async () => {
            const { records } = await db.list({ collection: COLLECTION, filter: { role: 'user' } });
            expect(records.map(r => r.data.name)).to.include.members(['Grace', 'Henry']);
            expect(records.every(r => r.data.role === 'user')).to.be.true;
        });

        it('respects limit', async () => {
            const { records } = await db.list({ collection: COLLECTION, limit: 1 });
            expect(records).to.have.length(1);
        });

        it('skip + limit pages through results', async () => {
            const all = (await db.list({ collection: COLLECTION })).records;
            const page = (await db.list({ collection: COLLECTION, skip: 1, limit: 2 })).records;
            expect(page).to.have.length(Math.min(2, all.length - 1));
        });

    });

});
