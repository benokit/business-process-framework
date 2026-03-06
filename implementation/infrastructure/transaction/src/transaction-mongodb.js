import { getClient } from 'mongodb-client';
import { randomUUID } from 'crypto';

const sessions = new Map();

async function beginTransaction({ options } = {}) {
    const session = getClient().startSession();
    session.startTransaction(options);
    const sessionId = randomUUID();
    sessions.set(sessionId, session);
    return { sessionId };
}

async function commitTransaction({ sessionId }) {
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

async function rollbackTransaction({ sessionId }) {
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
