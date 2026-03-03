import { expect } from 'chai';
import { MongoClient } from 'mongodb';
import { connect, disconnect, getCollection } from 'mongodb-client';
import { next } from '../src/sequence-generator-mongodb.js';

const MONGODB_URL = process.env.MONGODB_URL ?? 'mongodb://admin:password@localhost:27017/admin';
const SEQUENCE = `test-seq-${Date.now()}`;

describe('sequence-generator-mongodb', function () {
    let connected = false;

    before(async function () {
        const probe = new MongoClient(MONGODB_URL, { serverSelectionTimeoutMS: 2000 });
        try {
            await probe.connect();
            await probe.db().command({ ping: 1 });
            await probe.close();
        } catch {
            console.warn('\n  WARNING: MongoDB not reachable at default URL — sequence-generator tests skipped\n');
            this.skip();
        }
        await connect();
        connected = true;
    });

    after(async function () {
        if (!connected) return;
        await getCollection('sequences').deleteMany({ _id: { $regex: `^test-seq-` } }).catch(() => {});
        await disconnect();
    });

    it('returns 1 on the first call for a new sequence', async () => {
        const result = await next({ sequence: SEQUENCE });
        expect(result).to.deep.equal({ value: 1 });
    });

    it('increments on each subsequent call', async () => {
        const r2 = await next({ sequence: SEQUENCE });
        const r3 = await next({ sequence: SEQUENCE });
        expect(r2.value).to.equal(2);
        expect(r3.value).to.equal(3);
    });

    it('maintains independent counters for different sequences', async () => {
        const other = `${SEQUENCE}-other`;
        const result = await next({ sequence: other });
        expect(result).to.deep.equal({ value: 1 });
    });

});
