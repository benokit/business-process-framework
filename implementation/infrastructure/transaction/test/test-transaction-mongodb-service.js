import { expect } from 'chai';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { MongoClient } from 'mongodb';
import { loadElements } from 'core/elements-loader';
import { execute } from 'core/service';
import { connect, disconnect } from 'mongodb-client';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ELEMENTS_DIR = join(__dirname, '../elements');
const MONGODB_URL = process.env.MONGODB_URL ?? 'mongodb://admin:password@localhost:27017/admin';
const LOW = 'transaction-mongodb-low';
const SERVICE = 'transaction-mongodb';

describe('transaction-mongodb (service elements)', function () {
    let connected = false;
    let transactionsSupported = false;

    before(async function () {
        const probe = new MongoClient(MONGODB_URL, { serverSelectionTimeoutMS: 2000 });
        try {
            await probe.connect();
            await probe.db().command({ ping: 1 });
            const info = await probe.db().admin().command({ isMaster: 1 });
            transactionsSupported = !!(info.setName || info.msg === 'isdbgrid');
            await probe.close();
        } catch {
            console.warn('\n  WARNING: MongoDB not reachable — tests skipped\n');
            this.skip();
        }
        await loadElements([ELEMENTS_DIR]);
        await connect();
        connected = true;
    });

    after(async function () {
        if (!connected) return;
        await disconnect();
    });

    describe('transaction-mongodb-low', () => {

        it('beginTransaction returns a sessionId', async function () {
            if (!transactionsSupported) return this.skip();
            const result = await execute(LOW, 'beginTransaction', {});
            expect(result).to.have.property('sessionId').that.is.a('string');
            await execute(LOW, 'rollbackTransaction', { sessionId: result.sessionId });
        });

        it('commitTransaction ends the session', async function () {
            if (!transactionsSupported) return this.skip();
            const { sessionId } = await execute(LOW, 'beginTransaction', {});
            const result = await execute(LOW, 'commitTransaction', { sessionId });
            expect(result).to.deep.equal({ sessionId });
        });

        it('rollbackTransaction ends the session', async function () {
            if (!transactionsSupported) return this.skip();
            const { sessionId } = await execute(LOW, 'beginTransaction', {});
            const result = await execute(LOW, 'rollbackTransaction', { sessionId });
            expect(result).to.deep.equal({ sessionId });
        });

        it('commitTransaction throws for an unknown sessionId', async () => {
            let error;
            try {
                await execute(LOW, 'commitTransaction', { sessionId: 'no-such-session' });
            } catch (e) {
                error = e;
            }
            expect(error).to.be.a('string').that.includes('commitTransaction failed');
        });

        it('rollbackTransaction throws for an unknown sessionId', async () => {
            let error;
            try {
                await execute(LOW, 'rollbackTransaction', { sessionId: 'no-such-session' });
            } catch (e) {
                error = e;
            }
            expect(error).to.be.a('string').that.includes('rollbackTransaction failed');
        });

    });

    describe('executeInTransaction', () => {

        it('runs the program and returns its result', async function () {
            if (!transactionsSupported) return this.skip();
            const program = { "return": { "ok": true } };
            const result = await execute(SERVICE, 'executeInTransaction', { program });
            expect(result).to.deep.equal({ ok: true });
        });

        it('supports a pipeline program', async function () {
            if (!transactionsSupported) return this.skip();
            const program = [
                { "name": "a", "return": { "value": 1 } },
                { "return": "#.a" }
            ];
            const result = await execute(SERVICE, 'executeInTransaction', { program });
            expect(result).to.deep.equal({ value: 1 });
        });

        it('rolls back and rethrows when the program throws', async function () {
            if (!transactionsSupported) return this.skip();
            let error;
            try {
                const program = { "throw": "program error" };
                await execute(SERVICE, 'executeInTransaction', { program });
            } catch (e) {
                error = e;
            }
            expect(error).to.equal('program error');
        });

    });

});
