import { expect } from 'chai';
import { dirname } from 'path';
import { createRequire } from 'module';
import pg from 'pg';
import { loadElements } from '@business-framework/runtime/elements-loader';
import { connect, disconnect } from '@business-framework/postgresql';
import { next } from '../src/sequence-generator.js';

const require = createRequire(import.meta.url);
const packageDir = name => dirname(require.resolve(`${name}/package.json`));
const POSTGRES_URL = process.env.POSTGRES_URL ?? 'postgresql://admin:password@localhost:5432/app';
const SEQUENCE = `test-seq-${Date.now()}`;

describe('sequence-generator', function () {
    let connected = false;

    before(async function () {
        const probe = new pg.Pool({ connectionString: POSTGRES_URL, max: 1 });
        try {
            const client = await probe.connect();
            client.release();
            await probe.end();
        } catch {
            console.warn('\n  WARNING: PostgreSQL not reachable — sequence-generator tests skipped\n');
            this.skip();
        }
        await loadElements([packageDir('@business-framework/postgresql')]);
        await connect();
        connected = true;
    });

    after(async function () {
        if (!connected) return;
        await disconnect();
    });

    it('returns 1 on the first call for a new sequence', async () => {
        const result = await next({ input: { sequence: SEQUENCE } });
        expect(result).to.deep.equal({ value: 1 });
    });

    it('increments on each subsequent call', async () => {
        const r2 = await next({ input: { sequence: SEQUENCE } });
        const r3 = await next({ input: { sequence: SEQUENCE } });
        expect(r2.value).to.equal(2);
        expect(r3.value).to.equal(3);
    });

    it('maintains independent counters for different sequences', async () => {
        const other = `${SEQUENCE}-other`;
        const result = await next({ input: { sequence: other } });
        expect(result).to.deep.equal({ value: 1 });
    });

});
