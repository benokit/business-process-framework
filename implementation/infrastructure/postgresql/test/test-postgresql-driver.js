import { expect } from 'chai';
import { dirname } from 'path';
import { createRequire } from 'module';
import pg from 'pg';
import { loadElements } from '@business-framework/runtime/elements-loader';
import { connect, disconnect, getPool } from '@business-framework/postgresql';
import { execute } from '@business-framework/postgresql/driver';

const require = createRequire(import.meta.url);
const packageDir = name => dirname(require.resolve(`${name}/package.json`));
const POSTGRES_URL = process.env.POSTGRES_URL ?? 'postgresql://admin:password@localhost:5432/app';
const TABLE = `test_pg_driver_${Date.now()}`;

describe('postgresql driver', function () {
    let connected = false;

    before(async function () {
        const probe = new pg.Pool({ connectionString: POSTGRES_URL, max: 1 });
        try {
            const client = await probe.connect();
            client.release();
            await probe.end();
        } catch {
            console.warn('\n  WARNING: PostgreSQL not reachable — postgresql driver tests skipped\n');
            this.skip();
        }
        await loadElements([packageDir('@business-framework/postgresql')]);
        await connect();
        await getPool().query(`CREATE TABLE ${TABLE} (id SERIAL, status TEXT, type TEXT)`);
        await getPool().query(`INSERT INTO ${TABLE} (status, type) VALUES ('pending', 'online'), ('shipped', 'offline')`);
        connected = true;
    });

    after(async function () {
        if (!connected) return;
        await getPool().query(`DROP TABLE IF EXISTS ${TABLE}`).catch(() => {});
        await disconnect();
    });

    it('executes a command without parameters', async () => {
        const view = `${TABLE}_view`;
        await execute({ input: { command: `CREATE VIEW ${view} AS SELECT id FROM ${TABLE}` } });
        await getPool().query(`DROP VIEW ${view}`);
    });

    it('executes with positional parameters', async () => {
        const result = await execute({
            input: { command: `SELECT * FROM ${TABLE} WHERE status = $1`, parameters: ['pending'] }
        });
        expect(result.rows).to.have.length(1);
        expect(result.rows[0].status).to.equal('pending');
    });

    it('executes with named parameters', async () => {
        const result = await execute({
            input: {
                command: `SELECT * FROM ${TABLE} WHERE status = :status AND type = :type`,
                parameters: { status: 'shipped', type: 'offline' }
            }
        });
        expect(result.rows).to.have.length(1);
        expect(result.rows[0].type).to.equal('offline');
    });

    it('returns rowCount for DML', async () => {
        const result = await execute({
            input: {
                command: `UPDATE ${TABLE} SET type = :type WHERE status = :status`,
                parameters: { type: 'express', status: 'pending' }
            }
        });
        expect(result.rowCount).to.equal(1);
    });
});
