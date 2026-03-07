import { getClient } from 'mongodb-client';

const sessions = new Map();
let nextId = 1;

async function beginTransaction({ input: { options } = {} } = {}) {
    const session = getClient().startSession();
    session.startTransaction(options);
    const sessionId = nextId++;
    sessions.set(sessionId, session);
    return { sessionId };
}

async function commitTransaction({ input: { sessionId } }) {
    const session = sessions.get(sessionId);
    if (!session) throw 'commitTransaction failed: unknown session';
    try {
        await session.commitTransaction();
    } finally {
        await session.endSession();
        sessions.delete(sessionId);
    }
    return { sessionId };
}

async function rollbackTransaction({ input: { sessionId } }) {
    const session = sessions.get(sessionId);
    if (!session) throw 'rollbackTransaction failed: unknown session';
    try {
        await session.abortTransaction();
    } finally {
        await session.endSession();
        sessions.delete(sessionId);
    }
    return { sessionId };
}

export { beginTransaction, commitTransaction, rollbackTransaction };
