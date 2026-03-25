import { expect } from 'chai';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { loadElements } from '@business-framework/core/elements-loader';
import { execute } from '@business-framework/core/service';
import { connect, disconnect } from '@business-framework/postgres-client';
import { registerElement } from '@business-framework/core/elements-registry';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ELEMENTS_DIR = join(__dirname, '../elements');
const POSTGRES_URL = process.env.POSTGRES_URL ?? 'postgresql://admin:password@localhost:5432/app';
const SERVICE = 'test-in-transaction-template';

describe('inTransaction node template', function () {
    let connected = false;

    before(async function () {
        const probe = new pg.Pool({ connectionString: POSTGRES_URL, max: 1 });
        try {
            const client = await probe.connect();
            client.release();
            await probe.end();
        } catch {
            console.warn('\n  WARNING: PostgreSQL not reachable — tests skipped\n');
            this.skip();
        }
        await loadElements([ELEMENTS_DIR]);
        await connect();
        connected = true;

        registerElement({
            type: 'service',
            id: SERVICE,
            interface: {
                captureTransaction:  { input: {}, output: {} },
                forwardInput:        { input: {}, output: {} },
                throwInside:         { input: {}, output: {} },
                nestedInTransaction: { input: {}, output: {} },
                sequential:          { input: {}, output: {} }
            },
            implementation: {
                captureTransaction: {
                    inTransaction: { return: '#._ctx.transaction' }
                },
                forwardInput: {
                    inTransaction: { return: '#.input' },
                    inputMap: '#.input.payload'
                },
                throwInside: {
                    inTransaction: { throw: 'inner error' }
                },
                nestedInTransaction: {
                    inTransaction: [
                        { name: 'outer', return: '#._ctx.transaction' },
                        { name: 'inner', inTransaction: { return: '#._ctx.transaction' } },
                        { return: { outer: '#.outer', inner: '#.inner' } }
                    ]
                },
                sequential: [
                    { name: 'first',  inTransaction: { return: '#._ctx.transaction' } },
                    { name: 'second', inTransaction: { return: '#._ctx.transaction' } },
                    { return: { first: '#.first', second: '#.second' } }
                ]
            }
        });
    });

    after(async function () {
        if (!connected) return;
        await disconnect();
    });

    it('executes the program inside a transaction', async () => {
        const result = await execute(SERVICE, 'captureTransaction', {});
        expect(result).to.have.property('sessionId').that.is.a('number');
    });

    it('forwards node input (inputMap result) to the program', async () => {
        const result = await execute(SERVICE, 'forwardInput', { payload: { x: 99 } });
        expect(result).to.deep.equal({ x: 99 });
    });

    it('propagates errors thrown inside the program', async () => {
        let error;
        try {
            await execute(SERVICE, 'throwInside', {});
        } catch (e) {
            error = e;
        }
        expect(error).to.equal('inner error');
    });

    it('reuses the outer transaction when nested', async () => {
        const result = await execute(SERVICE, 'nestedInTransaction', {});
        expect(result.outer.sessionId).to.be.a('number');
        expect(result.inner.sessionId).to.equal(result.outer.sessionId);
    });

    it('starts a fresh transaction for sequential inTransaction nodes', async () => {
        const result = await execute(SERVICE, 'sequential', {});
        expect(result.first.sessionId).to.be.a('number');
        expect(result.second.sessionId).to.be.a('number');
        expect(result.first.sessionId).to.not.equal(result.second.sessionId);
    });
});
