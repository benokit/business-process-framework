import { expect } from 'chai';
import { dirname } from 'path';
import { createRequire } from 'module';
import pg from 'pg';
import { loadElements } from '@business-framework/runtime/elements-loader';
import { executeService } from '@business-framework/runtime/execution';
import { connect, disconnect } from '@business-framework/postgresql';

const require = createRequire(import.meta.url);
const packageDir = name => dirname(require.resolve(`${name}/package.json`));
const POSTGRES_URL = process.env.POSTGRES_URL ?? 'postgresql://admin:password@localhost:5432/app';
const SEQUENCE = `test-seq-service-${Date.now()}`;
const SERVICE = 'sequence-generator';

describe('sequence-generator (service element)', function () {
    let connected = false;

    before(async function () {
        const probe = new pg.Pool({ connectionString: POSTGRES_URL, max: 1 });
        try {
            const client = await probe.connect();
            client.release();
            await probe.end();
        } catch {
            console.warn('\n  WARNING: PostgreSQL not reachable — sequence-generator service element tests skipped\n');
            this.skip();
        }
        await loadElements([packageDir('@business-framework/postgresql'), packageDir('@business-framework/sequence-generator')]);
        await connect();
        connected = true;
    });

    after(async function () {
        if (!connected) return;
        await disconnect();
    });

    describe('input validation', () => {

        it('throws when sequence field is missing', async () => {
            let error;
            try {
                await executeService(SERVICE, 'next', {});
            } catch (e) {
                error = e;
            }
            expect(error.cause).to.be.a('string').that.includes('input is not valid');
        });

    });

    describe('next', () => {

        it('returns { value: 1 } on the first call', async () => {
            const result = await executeService(SERVICE, 'next', { sequence: SEQUENCE });
            expect(result).to.deep.equal({ value: 1 });
        });

        it('returns monotonically increasing values on repeated calls', async () => {
            const r2 = await executeService(SERVICE, 'next', { sequence: SEQUENCE });
            const r3 = await executeService(SERVICE, 'next', { sequence: SEQUENCE });
            expect(r2.value).to.equal(2);
            expect(r3.value).to.equal(3);
        });

        it('maintains independent counters for different sequence names', async () => {
            const other = `${SEQUENCE}-other`;
            const result = await executeService(SERVICE, 'next', { sequence: other });
            expect(result).to.deep.equal({ value: 1 });
        });

    });

});
