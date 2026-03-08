import { expect } from 'chai';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { MongoClient } from 'mongodb';
import { loadElements } from 'core/elements-loader';
import { execute } from 'core/service';
import { connect, disconnect } from 'mongodb-client';
import { registerElement } from 'core/elements-registry';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ELEMENTS_DIR = join(__dirname, '../elements');
const MONGODB_URL = process.env.MONGODB_URL ?? 'mongodb://admin:password@localhost:27017/admin';
const SERVICE = 'test-in-transaction-template';

describe('inTransaction node template', function () {
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

    it('executes the program inside a transaction', async function () {
        if (!transactionsSupported) return this.skip();
        const result = await execute(SERVICE, 'captureTransaction', {});
        expect(result).to.have.property('sessionId').that.is.a('number');
    });

    it('forwards node input (inputMap result) to the program', async function () {
        if (!transactionsSupported) return this.skip();
        const result = await execute(SERVICE, 'forwardInput', { payload: { x: 99 } });
        expect(result).to.deep.equal({ x: 99 });
    });

    it('propagates errors thrown inside the program', async function () {
        if (!transactionsSupported) return this.skip();
        let error;
        try {
            await execute(SERVICE, 'throwInside', {});
        } catch (e) {
            error = e;
        }
        expect(error).to.equal('inner error');
    });

    it('reuses the outer transaction when nested', async function () {
        if (!transactionsSupported) return this.skip();
        const result = await execute(SERVICE, 'nestedInTransaction', {});
        expect(result.outer.sessionId).to.be.a('number');
        expect(result.inner.sessionId).to.equal(result.outer.sessionId);
    });

    it('starts a fresh transaction for sequential inTransaction nodes', async function () {
        if (!transactionsSupported) return this.skip();
        const result = await execute(SERVICE, 'sequential', {});
        expect(result.first.sessionId).to.be.a('number');
        expect(result.second.sessionId).to.be.a('number');
        expect(result.first.sessionId).to.not.equal(result.second.sessionId);
    });
});
