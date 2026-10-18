import { getPool } from '@business-framework/postgresql';

const sequenceName = sequence => `seq_${sequence.replace(/[^a-zA-Z0-9_]/g, '_')}`;

export const next = async ({ input: { sequence } }) => {
    const name = sequenceName(sequence);
    await getPool().query(`CREATE SEQUENCE IF NOT EXISTS ${name} START 1`);
    const { rows: [{ value }] } = await getPool().query(`SELECT nextval('${name}') AS value`);
    return { value: Number(value) };
};
