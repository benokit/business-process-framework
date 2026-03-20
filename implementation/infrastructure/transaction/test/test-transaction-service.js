import { expect } from 'chai';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { loadElements } from 'core/elements-loader';
import { execute } from 'core/service';
import { connect, disconnect } from 'postgres-client';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ELEMENTS_DIR = join(__dirname, '../elements');
const POSTGRES_URL = process.env.POSTGRES_URL ?? 'postgresql://admin:password@localhost:5432/app';
const LOW = 'transaction-low';
const SERVICE = 'transaction';

describe('transaction (service elements)', function () {
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
    });

    after(async function () {
        if (!connected) return;
        await disconnect();
    });

    describe('transaction-low', () => {

        it('beginTransaction returns a sessionId', async () => {
            const result = await execute(LOW, 'beginTransaction', {});
            expect(result).to.have.property('sessionId').that.is.a('number');
            await execute(LOW, 'rollbackTransaction', { sessionId: result.sessionId });
        });

        it('commitTransaction ends the session', async () => {
            const { sessionId } = await execute(LOW, 'beginTransaction', {});
            const result = await execute(LOW, 'commitTransaction', { sessionId });
            expect(result).to.deep.equal({ sessionId });
        });

        it('rollbackTransaction ends the session', async () => {
            const { sessionId } = await execute(LOW, 'beginTransaction', {});
            const result = await execute(LOW, 'rollbackTransaction', { sessionId });
            expect(result).to.deep.equal({ sessionId });
        });

        it('commitTransaction throws for an unknown sessionId', async () => {
            let error;
            try {
                await execute(LOW, 'commitTransaction', { sessionId: 999999 });
            } catch (e) {
                error = e;
            }
            expect(error).to.be.a('string').that.includes('commitTransaction failed');
        });

        it('rollbackTransaction throws for an unknown sessionId', async () => {
            let error;
            try {
                await execute(LOW, 'rollbackTransaction', { sessionId: 999999 });
            } catch (e) {
                error = e;
            }
            expect(error).to.be.a('string').that.includes('rollbackTransaction failed');
        });

    });

    describe('executeInTransaction', () => {

        it('runs the program and returns its result', async () => {
            const program = { "return": { "ok": true } };
            const result = await execute(SERVICE, 'executeInTransaction', { program });
            expect(result).to.deep.equal({ ok: true });
        });

        it('supports a pipeline program', async () => {
            const program = [
                { "name": "a", "return": { "value": 1 } },
                { "return": "#.a" }
            ];
            const result = await execute(SERVICE, 'executeInTransaction', { program });
            expect(result).to.deep.equal({ value: 1 });
        });

        it('rolls back and rethrows when the program throws', async () => {
            let error;
            try {
                const program = { "throw": "program error" };
                await execute(SERVICE, 'executeInTransaction', { program });
            } catch (e) {
                error = e;
            }
            expect(error).to.equal('program error');
        });

        it('exposes _ctx.transaction to the program', async () => {
            const program = { "return": "#._ctx.transaction" };
            const result = await execute(SERVICE, 'executeInTransaction', { program });
            expect(result).to.have.property('sessionId').that.is.a('number');
        });

        it('reuses the outer transaction when called nested', async () => {
            const innerProgram = { "return": "#._ctx.transaction" };
            const outerProgram = [
                { "name": "inner", "inputMap": { "program": "#.input.innerProgram" }, "service": { "id": "transaction", "method": "executeInTransaction" } },
                { "return": { "outer": "#._ctx.transaction", "inner": "#.inner" } }
            ];
            const result = await execute(SERVICE, 'executeInTransaction', { program: outerProgram, programInput: { innerProgram } });
            expect(result.outer.sessionId).to.be.a('number');
            expect(result.inner.sessionId).to.equal(result.outer.sessionId);
        });

        it('clears _ctx.transaction after commit so a sequential transaction can start', async () => {
            const captureTransaction = { "return": "#._ctx.transaction" };
            const _ctx = {};
            const first  = await execute(SERVICE, 'executeInTransaction', { program: captureTransaction }, _ctx);
            const second = await execute(SERVICE, 'executeInTransaction', { program: captureTransaction }, _ctx);
            expect(first.sessionId).to.be.a('number');
            expect(second.sessionId).to.be.a('number');
            expect(first.sessionId).to.not.equal(second.sessionId);
        });

    });

});
