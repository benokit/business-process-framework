import { CoreError } from '@business-framework/core';
import { getPool } from '@business-framework/postgresql';

const clients = new Map();
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

const end = statement => async ({ input: { sessionId } }) => {
    const client = clientOf(sessionId);
    try {
        await client.query(statement);
    } finally {
        client.release();
        clients.delete(sessionId);
    }
    return null;
};

export const commitTransaction = end('COMMIT');

export const rollbackTransaction = end('ROLLBACK');

export const queryable = _ctx => _ctx.transaction ? clientOf(_ctx.transaction.sessionId) : getPool();
