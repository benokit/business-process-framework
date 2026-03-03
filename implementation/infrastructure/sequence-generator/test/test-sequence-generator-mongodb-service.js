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
const SEQUENCE = `test-seq-service-${Date.now()}`;
const SERVICE = 'sequence-generator';

describe('sequence-generator (service element)', function () {
    let connected = false;

    before(async function () {
        const probe = new MongoClient(MONGODB_URL, { serverSelectionTimeoutMS: 2000 });
        try {
            await probe.connect();
            await probe.db().command({ ping: 1 });
            await probe.close();
        } catch {
            console.warn('\n  WARNING: MongoDB not reachable — sequence-generator service element tests skipped\n');
            this.skip();
        }
        await loadElements([ELEMENTS_DIR]);
        await connect();
        connected = true;
    });

    after(async function () {
        if (!connected) return;
        await getCollection('sequences').deleteMany({ _id: { $regex: `^test-seq-service-` } }).catch(() => {});
        await disconnect();
    });

    describe('input validation', () => {

        it('throws when sequence field is missing', async () => {
            let error;
            try {
                await execute(SERVICE, 'next', {});
            } catch (e) {
                error = e;
            }
            expect(error).to.be.a('string').that.includes('input is not valid');
        });

    });

    describe('next', () => {

        it('returns { value: 1 } on the first call', async () => {
            const result = await execute(SERVICE, 'next', { sequence: SEQUENCE });
            expect(result).to.deep.equal({ value: 1 });
        });

        it('returns monotonically increasing values on repeated calls', async () => {
            const r2 = await execute(SERVICE, 'next', { sequence: SEQUENCE });
            const r3 = await execute(SERVICE, 'next', { sequence: SEQUENCE });
            expect(r2.value).to.equal(2);
            expect(r3.value).to.equal(3);
        });

        it('maintains independent counters for different sequence names', async () => {
            const other = `${SEQUENCE}-other`;
            const result = await execute(SERVICE, 'next', { sequence: other });
            expect(result).to.deep.equal({ value: 1 });
        });

    });

});
