import { connect, getPool } from '@business-framework/postgresql';

const clients = new Map();
let nextId = 1;

async function beginTransaction() {
    await connect();
    const client = await getPool().connect();
    await client.query('BEGIN');
    const sessionId = nextId++;
    clients.set(sessionId, client);
    return { sessionId };
}

async function commitTransaction({ input: { sessionId } }) {
    const client = clients.get(sessionId);
    if (!client) throw 'commitTransaction failed: unknown session';
    try {
        await client.query('COMMIT');
    } finally {
        client.release();
        clients.delete(sessionId);
    }
    return { sessionId };
}

async function rollbackTransaction({ input: { sessionId } }) {
    const client = clients.get(sessionId);
    if (!client) throw 'rollbackTransaction failed: unknown session';
    try {
        await client.query('ROLLBACK');
    } finally {
        client.release();
        clients.delete(sessionId);
    }
    return { sessionId };
}

function getClient(sessionId) {
    return clients.get(sessionId);
}

export { beginTransaction, commitTransaction, rollbackTransaction, getClient };
