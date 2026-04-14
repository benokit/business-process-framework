import pg from 'pg';

const url = process.env.POSTGRES_URL ?? 'postgresql://admin:password@localhost:5432/app';
let pool = null;

async function connect() {
    if (pool) return;
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
