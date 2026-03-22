import { expect } from 'chai';
import pg from 'pg';
import { connect, disconnect, getPool } from 'postgres-client';
import * as db from '../src/entity-database.js';

const POSTGRES_URL = process.env.POSTGRES_URL ?? 'postgresql://admin:password@localhost:5432/app';
const ENTITY_TYPE = `test-entity-database-${Date.now()}`;

describe('entity-database', function () {
    let connected = false;

    before(async function () {
        const probe = new pg.Pool({ connectionString: POSTGRES_URL, max: 1 });
        try {
            const client = await probe.connect();
            client.release();
            await probe.end();
        } catch {
            console.warn('\n  WARNING: PostgreSQL not reachable — entity-database tests skipped\n');
            this.skip();
        }
        await connect();
        connected = true;
    });

    after(async function () {
        if (!connected) return;
        await getPool().query(`DELETE FROM entities WHERE entity_type = $1`, [ENTITY_TYPE]).catch(() => {});
        await disconnect();
    });

    describe('create', () => {

        it('returns an entity record with id, businessKey, revision 1, and the given data', async () => {
            const result = await db.create({ input: { entityType: ENTITY_TYPE, businessKey: 'bk-create-alice', data: { name: 'Alice' } } });
            expect(result).to.include.keys('id', 'businessKey', 'revision', 'data');
            expect(result.businessKey).to.equal('bk-create-alice');
            expect(result.revision).to.equal(1);
            expect(result.data).to.deep.equal({ name: 'Alice' });
        });

        it('throws when businessKey is missing', async () => {
            let error;
            try {
                await db.create({ input: { entityType: ENTITY_TYPE, data: { name: 'X' } } });
            } catch (e) {
                error = e;
            }
            expect(error).to.be.a('string').that.includes('businessKey');
        });

        it('throws when businessKey is an empty string', async () => {
            let error;
            try {
                await db.create({ input: { entityType: ENTITY_TYPE, businessKey: '', data: { name: 'X' } } });
            } catch (e) {
                error = e;
            }
            expect(error).to.be.a('string').that.includes('businessKey');
        });

        it('throws on duplicate businessKey', async () => {
            await db.create({ input: { entityType: ENTITY_TYPE, businessKey: 'bk-create-dup', data: { name: 'Original' } } });
            let error;
            try {
                await db.create({ input: { entityType: ENTITY_TYPE, businessKey: 'bk-create-dup', data: { name: 'Duplicate' } } });
            } catch (e) {
                error = e;
            }
            expect(error).to.exist;
        });

    });

    describe('read by id', () => {
        let id;

        before(async () => {
            ({ id } = await db.create({ input: { entityType: ENTITY_TYPE, businessKey: 'bk-read-bob', data: { name: 'Bob' } } }));
        });

        it('returns the entity record for an existing id', async () => {
            const result = await db.read({ input: { entityType: ENTITY_TYPE, id } });
            expect(result.id).to.equal(id);
            expect(result.businessKey).to.equal('bk-read-bob');
            expect(result.revision).to.equal(1);
            expect(result.data).to.deep.equal({ name: 'Bob' });
        });

        it('returns null for a non-existent id', async () => {
            const result = await db.read({ input: { entityType: ENTITY_TYPE, id: '00000000-0000-0000-0000-000000000000' } });
            expect(result).to.be.null;
        });

    });

    describe('read by businessKey', () => {

        before(async () => {
            await db.create({ input: { entityType: ENTITY_TYPE, businessKey: 'bk-read-bk-charlie', data: { name: 'Charlie' } } });
        });

        it('returns the entity record for an existing businessKey', async () => {
            const result = await db.read({ input: { entityType: ENTITY_TYPE, businessKey: 'bk-read-bk-charlie' } });
            expect(result.businessKey).to.equal('bk-read-bk-charlie');
            expect(result.data).to.deep.equal({ name: 'Charlie' });
        });

        it('returns null for a non-existent businessKey', async () => {
            const result = await db.read({ input: { entityType: ENTITY_TYPE, businessKey: 'no-such-key' } });
            expect(result).to.be.null;
        });

    });

    describe('update by id', () => {
        let id, revision;

        before(async () => {
            ({ id, revision } = await db.create({ input: { entityType: ENTITY_TYPE, businessKey: 'bk-update-carol', data: { name: 'Carol' } } }));
        });

        it('updates data and increments revision', async () => {
            const result = await db.update({ input: { entityType: ENTITY_TYPE, id, revision, data: { name: 'Caroline' } } });
            expect(result.id).to.equal(id);
            expect(result.revision).to.equal(2);
            expect(result.data).to.deep.equal({ name: 'Caroline' });
        });

        it('throws when revision does not match', async () => {
            let error;
            try {
                await db.update({ input: { entityType: ENTITY_TYPE, id, revision: 99, data: { name: 'X' } } });
            } catch (e) {
                error = e;
            }
            expect(error).to.be.a('string').that.includes('update failed');
        });

    });

    describe('update by businessKey', () => {
        let revision;

        before(async () => {
            ({ revision } = await db.create({ input: { entityType: ENTITY_TYPE, businessKey: 'bk-update-bk-diana', data: { name: 'Diana' } } }));
        });

        it('updates data and increments revision', async () => {
            const result = await db.update({ input: { entityType: ENTITY_TYPE, businessKey: 'bk-update-bk-diana', revision, data: { name: 'Di' } } });
            expect(result.businessKey).to.equal('bk-update-bk-diana');
            expect(result.revision).to.equal(2);
            expect(result.data).to.deep.equal({ name: 'Di' });
        });

        it('throws when revision does not match', async () => {
            let error;
            try {
                await db.update({ input: { entityType: ENTITY_TYPE, businessKey: 'bk-update-bk-diana', revision: 99, data: { name: 'X' } } });
            } catch (e) {
                error = e;
            }
            expect(error).to.be.a('string').that.includes('update failed');
        });

    });

    describe('delete by id', () => {
        let id, revision;

        before(async () => {
            ({ id, revision } = await db.create({ input: { entityType: ENTITY_TYPE, businessKey: 'bk-delete-dave', data: { name: 'Dave' } } }));
        });

        it('removes the document and returns its record', async () => {
            const result = await db['delete']({ input: { entityType: ENTITY_TYPE, id, revision } });
            expect(result.id).to.equal(id);
            expect(result.data).to.deep.equal({ name: 'Dave' });
        });

        it('throws when the document no longer exists', async () => {
            let error;
            try {
                await db['delete']({ input: { entityType: ENTITY_TYPE, id, revision: 1 } });
            } catch (e) {
                error = e;
            }
            expect(error).to.be.a('string').that.includes('delete failed');
        });

    });

    describe('delete by businessKey', () => {
        let revision;

        before(async () => {
            ({ revision } = await db.create({ input: { entityType: ENTITY_TYPE, businessKey: 'bk-delete-bk-eve', data: { name: 'Eve' } } }));
        });

        it('removes the document and returns its record', async () => {
            const result = await db['delete']({ input: { entityType: ENTITY_TYPE, businessKey: 'bk-delete-bk-eve', revision } });
            expect(result.businessKey).to.equal('bk-delete-bk-eve');
            expect(result.data).to.deep.equal({ name: 'Eve' });
        });

        it('throws when the document no longer exists', async () => {
            let error;
            try {
                await db['delete']({ input: { entityType: ENTITY_TYPE, businessKey: 'bk-delete-bk-eve', revision: 1 } });
            } catch (e) {
                error = e;
            }
            expect(error).to.be.a('string').that.includes('delete failed');
        });

    });

    describe('history', () => {
        let id, v1, v2, v3;

        before(async () => {
            ({ id, revision: v1 } = await db.create({ input: { entityType: ENTITY_TYPE, businessKey: 'bk-hist-iris', data: { name: 'Iris', score: 1 } } }));
            ({ revision: v2 } = await db.update({ input: { entityType: ENTITY_TYPE, id, revision: v1, data: { name: 'Iris', score: 2 } } }));
            ({ revision: v3 } = await db.update({ input: { entityType: ENTITY_TYPE, id, revision: v2, data: { name: 'Iris', score: 3 } } }));
        });

        it('read without revision returns current data', async () => {
            const result = await db.read({ input: { entityType: ENTITY_TYPE, id } });
            expect(result.revision).to.equal(v3);
            expect(result.data.score).to.equal(3);
        });

        it('read with current revision returns current data', async () => {
            const result = await db.read({ input: { entityType: ENTITY_TYPE, id, revision: v3 } });
            expect(result.data.score).to.equal(3);
        });

        it('read with previous revision reconstructs v2 data', async () => {
            const result = await db.read({ input: { entityType: ENTITY_TYPE, id, revision: v2 } });
            expect(result.revision).to.equal(v2);
            expect(result.data.score).to.equal(2);
        });

        it('read with initial revision reconstructs v1 data', async () => {
            const result = await db.read({ input: { entityType: ENTITY_TYPE, id, revision: v1 } });
            expect(result.revision).to.equal(v1);
            expect(result.data.score).to.equal(1);
        });

        it('read with out-of-range revision returns null', async () => {
            const result = await db.read({ input: { entityType: ENTITY_TYPE, id, revision: 99 } });
            expect(result).to.be.null;
        });

        it('delete removes history rows', async () => {
            const { id: hId, revision } = await db.create({ input: { entityType: ENTITY_TYPE, businessKey: 'bk-hist-jack', data: { x: 1 } } });
            await db.update({ input: { entityType: ENTITY_TYPE, id: hId, revision, data: { x: 2 } } });
            await db['delete']({ input: { entityType: ENTITY_TYPE, id: hId } });
            const pool = (await import('postgres-client')).getPool();
            const { rows } = await pool.query('SELECT * FROM entity_history WHERE id = $1', [hId]);
            expect(rows).to.have.length(0);
        });

    });

    describe('state', () => {

        it('create stores the provided state and returns it in the record', async () => {
            const result = await db.create({ input: { entityType: ENTITY_TYPE, businessKey: 'bk-state-create', data: { x: 1 }, state: { status: 'draft' } } });
            expect(result.state).to.deep.equal({ status: 'draft' });
        });

        it('create defaults state to {} when omitted', async () => {
            const result = await db.create({ input: { entityType: ENTITY_TYPE, businessKey: 'bk-state-default', data: { x: 1 } } });
            expect(result.state).to.deep.equal({});
        });

        it('read returns the stored state', async () => {
            const { id } = await db.create({ input: { entityType: ENTITY_TYPE, businessKey: 'bk-state-read', data: { x: 1 }, state: { status: 'pending' } } });
            const result = await db.read({ input: { entityType: ENTITY_TYPE, id } });
            expect(result.state).to.deep.equal({ status: 'pending' });
        });

        it('update stores the new state and returns it in the record', async () => {
            const { id, revision } = await db.create({ input: { entityType: ENTITY_TYPE, businessKey: 'bk-state-update', data: { x: 1 }, state: { status: 'draft' } } });
            const result = await db.update({ input: { entityType: ENTITY_TYPE, id, revision, data: { x: 2 }, state: { status: 'confirmed' } } });
            expect(result.state).to.deep.equal({ status: 'confirmed' });
        });

        it('update preserves state when omitted', async () => {
            const { id, revision } = await db.create({ input: { entityType: ENTITY_TYPE, businessKey: 'bk-state-update-preserve', data: { x: 1 }, state: { status: 'draft' } } });
            const result = await db.update({ input: { entityType: ENTITY_TYPE, id, revision, data: { x: 2 } } });
            expect(result.state).to.deep.equal({ status: 'draft' });
        });

    });

    describe('history — state', () => {
        let id, v1, v2, v3;

        before(async () => {
            ({ id, revision: v1 } = await db.create({ input: { entityType: ENTITY_TYPE, businessKey: 'bk-state-hist', data: { score: 1 }, state: { status: 'draft' } } }));
            ({ revision: v2 } = await db.update({ input: { entityType: ENTITY_TYPE, id, revision: v1, data: { score: 2 }, state: { status: 'active' } } }));
            ({ revision: v3 } = await db.update({ input: { entityType: ENTITY_TYPE, id, revision: v2, data: { score: 3 }, state: { status: 'closed' } } }));
        });

        it('read without revision returns current state', async () => {
            const result = await db.read({ input: { entityType: ENTITY_TYPE, id } });
            expect(result.state).to.deep.equal({ status: 'closed' });
        });

        it('read with previous revision reconstructs v2 state', async () => {
            const result = await db.read({ input: { entityType: ENTITY_TYPE, id, revision: v2 } });
            expect(result.state).to.deep.equal({ status: 'active' });
            expect(result.data.score).to.equal(2);
        });

        it('read with initial revision reconstructs v1 state', async () => {
            const result = await db.read({ input: { entityType: ENTITY_TYPE, id, revision: v1 } });
            expect(result.state).to.deep.equal({ status: 'draft' });
            expect(result.data.score).to.equal(1);
        });

    });

    describe('list', () => {
        const seeds = [
            { businessKey: 'bk-list-frank', data: { name: 'Frank', role: 'admin' } },
            { businessKey: 'bk-list-grace', data: { name: 'Grace', role: 'user'  } },
            { businessKey: 'bk-list-henry', data: { name: 'Henry', role: 'user'  } }
        ];

        before(async () => {
            await Promise.all(seeds.map(({ businessKey, data }) => db.create({ input: { entityType: ENTITY_TYPE, businessKey, data } })));
        });

        it('returns all records in the entity type', async () => {
            const { records } = await db.list({ input: { entityType: ENTITY_TYPE } });
            const names = records.map(r => r.data.name);
            expect(names).to.include.members(['Frank', 'Grace', 'Henry']);
        });

        it('records include businessKey', async () => {
            const { records } = await db.list({ input: { entityType: ENTITY_TYPE, filter: { name: 'Frank' } } });
            expect(records[0].businessKey).to.equal('bk-list-frank');
        });

        it('filters by a data field equality', async () => {
            const { records } = await db.list({ input: { entityType: ENTITY_TYPE, filter: { name: 'Frank' } } });
            expect(records).to.have.length(1);
            expect(records[0].data.name).to.equal('Frank');
        });

        it('filters by multiple data fields', async () => {
            const { records } = await db.list({ input: { entityType: ENTITY_TYPE, filter: { role: 'user' } } });
            expect(records.map(r => r.data.name)).to.include.members(['Grace', 'Henry']);
            expect(records.every(r => r.data.role === 'user')).to.be.true;
        });

        it('respects limit', async () => {
            const { records } = await db.list({ input: { entityType: ENTITY_TYPE, limit: 1 } });
            expect(records).to.have.length(1);
        });

        it('skip + limit pages through results', async () => {
            const all = (await db.list({ input: { entityType: ENTITY_TYPE } })).records;
            const page = (await db.list({ input: { entityType: ENTITY_TYPE, skip: 1, limit: 2 } })).records;
            expect(page).to.have.length(Math.min(2, all.length - 1));
        });

    });

});
