import { CoreError, execute } from '@business-framework/core';
import { getPool } from '@business-framework/postgresql';

const clients = new Map();
const afterCommitActions = new Map();
let lastSessionId = 0;

const clientOf = sessionId => clients.get(sessionId)
    ?? (() => { throw new CoreError('unknown-session', `no transaction session ${sessionId}`, { sessionId }); })();

export const beginTransaction = async ({ input: { isolation } }) => {
    const client = await getPool().connect();
    await client.query(`BEGIN ISOLATION LEVEL ${isolation}`);
    lastSessionId += 1;
    clients.set(lastSessionId, client);
    return { sessionId: lastSessionId };
};

const end = async (sessionId, statement) => {
    const client = clientOf(sessionId);
    const actions = afterCommitActions.get(sessionId) ?? [];
    afterCommitActions.delete(sessionId);
    try {
        await client.query(statement);
    } finally {
        client.release();
        clients.delete(sessionId);
    }
    return actions;
};

const withoutTransaction = _ctx => Object.freeze(Object.fromEntries(Object.entries(_ctx).filter(([key]) => key !== 'transaction')));

const run = action => execute(action).catch(() => null);

export const commitTransaction = async ({ input: { sessionId } }) => {
    for (const action of await end(sessionId, 'COMMIT')) await run(action);
    return null;
};

export const rollbackTransaction = async ({ input: { sessionId } }) => {
    await end(sessionId, 'ROLLBACK');
    return null;
};

export const afterCommit = async ({ input: { method, input, self }, _ctx }) => {
    const action = { method, input, self, _ctx: withoutTransaction(_ctx) };
    if (!_ctx.transaction) {
        await run(action);
        return null;
    }
    const { sessionId } = _ctx.transaction;
    afterCommitActions.set(sessionId, [...afterCommitActions.get(sessionId) ?? [], action]);
    return null;
};

export const queryable = _ctx => _ctx.transaction ? clientOf(_ctx.transaction.sessionId) : getPool();

const inOwnSession = async work => {
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        const result = await work(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

export const inSession = (_ctx, work) => _ctx.transaction ? work(clientOf(_ctx.transaction.sessionId)) : inOwnSession(work);
