import pg from 'pg';
import { CoreError } from '@business-framework/core';

let pool = null;

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

export const execute = ({ input }) => getPool().query(queryOf(input));
