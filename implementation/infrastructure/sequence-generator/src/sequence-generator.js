import { getPool } from '@business-framework/postgresql';

async function next({ input: { sequence } }) {
    const pool = getPool();
    const seqName = `seq_${sequence.replace(/[^a-zA-Z0-9_]/g, '_')}`;
    await pool.query(`CREATE SEQUENCE IF NOT EXISTS ${seqName} START 1`);
    const result = await pool.query(`SELECT nextval('${seqName}') AS value`);
    return { value: Number(result.rows[0].value) };
}

export { next };
