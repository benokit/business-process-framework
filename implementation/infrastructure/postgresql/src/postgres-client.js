import pg from 'pg';
import { getAppConfig } from '@business-framework/runtime/elements-registry';

let pool = null;

async function connect() {
    if (pool) return;
    const url = getAppConfig().postgresUrl;
    pool = new pg.Pool({ connectionString: url });
    const client = await pool.connect();
    client.release();
}

async function disconnect() {
    if (pool) {
        await pool.end();
        pool = null;
    }
}

function getPool() {
    return pool;
}

export { connect, disconnect, getPool };
