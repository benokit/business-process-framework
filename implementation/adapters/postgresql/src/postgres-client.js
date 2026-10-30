import pg from 'pg';
import { CoreError } from '@business-framework/core';

let pool = null;
const sessions = new Map();
let lastSessionId = 0;

export const connect = async ({ input: { url } }) => {
    if (pool) return null;
    pool = new pg.Pool({ connectionString: url });
    (await pool.connect()).release();
    return null;
};

export const disconnect = async () => {
    await pool?.end();
    pool = null;
    return null;
};

export const getPool = () => pool ?? (() => {
    throw new CoreError('not-connected', 'postgresql is not connected: start it first', {});
})();

const namedToPositional = (command, parameters) => {
    const names = [...command.matchAll(/:(\w+)/g)].map(([, name]) => name);
    return {
        text: names.reduce((text, name, index) => text.replace(`:${name}`, `$${index + 1}`), command),
        values: names.map(name => parameters[name])
    };
};

const queryOf = ({ command, parameters }) => Array.isArray(parameters)
    ? { text: command, values: parameters }
    : parameters && Object.keys(parameters).length > 0
        ? namedToPositional(command, parameters)
        : { text: command, values: [] };

const clientOf = sessionId => sessions.get(sessionId)
    ?? (() => { throw new CoreError('unknown-session', `no transaction session ${sessionId}`, { sessionId }); })();

export const queryable = _ctx => _ctx.transaction ? clientOf(_ctx.transaction.sessionId) : getPool();

const ERRORS = { 23505: 'unique-violation' };

const jsonValue = value => value instanceof Date ? value.toISOString() : value;

const jsonRow = row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, jsonValue(value)]));

const normalized = error => ERRORS[error.code] ? new CoreError(ERRORS[error.code], error.message, { constraint: error.constraint }) : error;

export const execute = async ({ input, _ctx }) => {
    try {
        const { rows, rowCount } = await queryable(_ctx).query(queryOf(input));
        return { rows: rows.map(jsonRow), rowCount };
    } catch (error) {
        throw normalized(error);
    }
};

export const begin = async ({ input: { isolation } }) => {
    const client = await getPool().connect();
    await client.query(`BEGIN ISOLATION LEVEL ${isolation}`);
    lastSessionId += 1;
    sessions.set(lastSessionId, client);
    return { sessionId: lastSessionId };
};

const end = statement => async ({ input: { sessionId } }) => {
    const client = clientOf(sessionId);
    try {
        await client.query(statement);
    } finally {
        client.release();
        sessions.delete(sessionId);
    }
    return null;
};

export const commit = end('COMMIT');

export const rollback = end('ROLLBACK');
