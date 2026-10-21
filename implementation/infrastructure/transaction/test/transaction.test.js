import { expect } from 'chai';
import { boot, invoke, packageElements, start, stop, validate } from '@business-framework/core';
import { skipWithoutPostgres } from '../../postgresql/test/helpers.js';

const TABLE = `test_tx_${Date.now()}`;
const ROWS = new URL('./fixtures/rows.js', import.meta.url).href;

const operations = {
    capture: { inTransaction: { set: '#._ctx.transaction' } },
    forward: { inputMap: '#.input.payload', inTransaction: { set: '#.input' } },
    callerOutputs: [{ outputKey: 'prefix', set: '\\seen' }, { inTransaction: { set: '#.prefix' } }],
    nested: {
        inTransaction: [
            { outputKey: 'outer', set: '#._ctx.transaction' },
            { outputKey: 'inner', inTransaction: { set: '#._ctx.transaction' } },
            { set: { outer: '#.outer', inner: '#.inner' } }
        ]
    },
    sequential: [
        { outputKey: 'first', inTransaction: { set: '#._ctx.transaction' } },
        { outputKey: 'second', inTransaction: { set: '#._ctx.transaction' } },
        { set: { first: '#.first', second: '#.second' } }
    ],
    insert: {
        inTransaction: [
            { inputMap: { command: `\\INSERT INTO ${TABLE} (name) VALUES ($1)`, values: ['#.input.name'] }, low: { module: ROWS, export: 'insert' } },
            { if: '#.input.fail', then: { throw: '\\failed on purpose' } }
        ]
    }
};

const fixtures = [
    {
        id: 'tx-user',
        kind: 'kind',
        data: {
            operations: Object.fromEntries(Object.entries(operations).map(([name, implementation]) => [name, { input: '@any', implementation }]))
        }
    },
    { id: 'the-user', kind: 'tx-user', data: {} }
];

const rows = () => invoke('postgresql', 'execute', { command: `SELECT name FROM ${TABLE} ORDER BY name` }).then(result => result.rows.map(row => row.name));

describe('transaction', function () {
    before(async function () {
        await skipWithoutPostgres(this);
        await boot({
            paths: ['@business-framework/database', '@business-framework/postgresql', '@business-framework/transaction'].map(packageElements),
            elements: fixtures
        });
        await start();
        await invoke('postgresql', 'execute', { command: `CREATE TABLE ${TABLE} (name TEXT)` });
    });

    after(async () => {
        await invoke('postgresql', 'execute', { command: `DROP TABLE IF EXISTS ${TABLE}` }).catch(() => null);
        await stop();
    });

    it('validates', () => {
        expect(validate()).to.deep.equal([]);
    });

    it('binds the session for the wrapped pipeline', async () => {
        expect(await invoke('the-user', 'capture', null)).to.have.property('sessionId').that.is.a('number');
    });

    it('passes the node input and the caller outputs to the wrapped pipeline', async () => {
        expect(await invoke('the-user', 'forward', { payload: { x: 99 } })).to.deep.equal({ x: 99 });
        expect(await invoke('the-user', 'callerOutputs', null)).to.equal('seen');
    });

    it('joins the enclosing transaction when nested', async () => {
        const { outer, inner } = await invoke('the-user', 'nested', null);
        expect(inner).to.deep.equal(outer);
    });

    it('starts a fresh transaction for sequential nodes', async () => {
        const { first, second } = await invoke('the-user', 'sequential', null);
        expect(first.sessionId).to.not.equal(second.sessionId);
    });

    it('commits on success and rolls back and rethrows on failure', async () => {
        await invoke('the-user', 'insert', { name: 'kept' });
        const error = await invoke('the-user', 'insert', { name: 'lost', fail: true }).catch(e => e);
        expect(error.message).to.equal('failed on purpose');
        expect(await rows()).to.deep.equal(['kept']);
    });

    it('fails on an unknown session', async () => {
        expect((await invoke('transaction', 'commit', { sessionId: 999999 }).catch(e => e)).code).to.equal('unknown-session');
    });
});
