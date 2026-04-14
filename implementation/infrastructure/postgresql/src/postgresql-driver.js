import { connect, getPool } from './postgres-client.js';

async function execute({ input: { command } }) {
    await connect();
    await getPool().query(command);
}

export { execute };
