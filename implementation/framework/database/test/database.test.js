import { expect } from 'chai';
import { boot, invoke, packageElements, start, stop, validate } from '@business-framework/core';

const run = Date.now();
const TABLE = `test_migrations_${run}`;
const MIGRATION = `migration-${run}`;

const fill = (id, value, order = {}) => ({ id, kind: 'slot-fill', data: { target: 'postgresql-database', slot: 'migrations', value, ...order } });

const packages = ['@business-framework/integration', '@business-framework/database', '@business-framework/postgresql'].map(packageElements);

const migrations = [
    fill(`${MIGRATION}-row`, { run: { inputMap: { command: `INSERT INTO ${TABLE} (name) VALUES ('first')` }, invoke: 'default-postgresql-database', operation: 'execute' } }, { position: 'last' }),
    fill(`${MIGRATION}-index`, { command: `CREATE INDEX ${TABLE}_name ON ${TABLE} (name)` }, { after: [`${MIGRATION}-table`] }),
    fill(`${MIGRATION}-table`, { command: `CREATE TABLE ${TABLE} (name TEXT)` })
];

const database = (command, parameters) => invoke('default-postgresql-database', 'execute', { command, parameters });

describe('database', () => {
    it('validates', async () => {
        await boot({ paths: ['@business-framework/integration', '@business-framework/database'].map(packageElements) });
        expect(validate()).to.deep.equal([]);
    });

    it('reports a migration with neither or both of a command and run', async () => {
        await boot({ paths: packages, elements: [fill('neither', {}), fill('both', { command: 'SELECT 1', run: { set: 1 } })] });
        expect(validate().flatMap(({ data }) => data.messages ?? [])).to.deep.equal(['migration both needs either a command or run', 'migration neither needs either a command or run']);
    });

    describe('migrate', function () {
        before(async function () {
            const { skipWithoutPostgres } = await import('../../../infrastructure/postgresql/test/helpers.js');
            await skipWithoutPostgres(this);
            await boot({ paths: packages, elements: migrations });
            await start();
        });

        after(async () => {
            await database(`DROP TABLE IF EXISTS ${TABLE}`);
            await database('DELETE FROM migrations WHERE id LIKE $1', [`${MIGRATION}%`]);
            await stop();
        });

        it('applies the migrations not yet applied, in slot order, once', async () => {
            const applied = (await invoke('default-postgresql-database', 'migrate', null)).applied.filter(id => id.startsWith(MIGRATION));
            expect(applied).to.deep.equal([`${MIGRATION}-table`, `${MIGRATION}-index`, `${MIGRATION}-row`]);
            expect((await invoke('default-postgresql-database', 'migrate', null)).applied).to.deep.equal([]);
            const { rows } = await database('SELECT indexname FROM pg_indexes WHERE tablename = $1', [TABLE]);
            expect([rows.map(row => row.indexname), (await database(`SELECT name FROM ${TABLE}`)).rows]).to.deep.equal([[`${TABLE}_name`], [{ name: 'first' }]]);
        });
    });
});
