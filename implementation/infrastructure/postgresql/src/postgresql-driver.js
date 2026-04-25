import { connect, getPool } from './postgres-client.js';

async function execute({ input: { command, parameters } }) {
    await connect();

    let query = command;
    let values = [];

    if (Array.isArray(parameters) && parameters.length > 0) {
        values = parameters;
    } else if (parameters && Object.keys(parameters).length > 0) {
        query = command.replace(/:(\w+)/g, (_, name) => {
            values.push(parameters[name]);
            return `$${values.length}`;
        });
    }

    return getPool().query(query, values.length ? values : undefined);
}

export { execute };
