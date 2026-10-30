import { expect } from 'chai';
import { boot, invoke, packageElements, start, stop, validate } from '@business-framework/core';
import { skipWithoutPostgres } from './helpers.js';

const TABLE = `test_pg_${Date.now()}`;

const sql = (command, parameters) => invoke('default-postgresql-database', 'execute', { command, ...(parameters && { parameters }) });

describe('postgresql', function () {
    before(async function () {
        await skipWithoutPostgres(this);
        await boot({ paths: ['@business-framework/integration', '@business-framework/database', '@business-framework/postgresql'].map(packageElements) });
        await start();
        await sql(`CREATE TABLE ${TABLE} (id SERIAL, status TEXT, type TEXT)`);
        await sql(`INSERT INTO ${TABLE} (status, type) VALUES ('pending', 'online'), ('shipped', 'offline')`);
    });

    after(async () => {
        await sql(`DROP TABLE IF EXISTS ${TABLE}`).catch(() => null);
        await stop();
    });

    it('validates', () => {
        expect(validate()).to.deep.equal([]);
    });

    it('executes with positional parameters', async () => {
        const { rows } = await sql(`SELECT * FROM ${TABLE} WHERE status = $1`, ['pending']);
        expect(rows.map(row => row.status)).to.deep.equal(['pending']);
    });

    it('executes with named parameters, repeated or not', async () => {
        const { rows } = await sql(`SELECT * FROM ${TABLE} WHERE status = :status AND type = :type OR status = :status`, { status: 'shipped', type: 'offline' });
        expect(rows.map(row => row.type)).to.deep.equal(['offline']);
    });

    it('returns rowCount for DML', async () => {
        const { rowCount } = await sql(`UPDATE ${TABLE} SET type = :type WHERE status = :status`, { type: 'express', status: 'pending' });
        expect(rowCount).to.equal(1);
    });

    it('rejects a command without text', async () => {
        expect((await invoke('default-postgresql-database', 'execute', {}).catch(e => e)).code).to.equal('invalid');
    });
});
