import { expect } from 'chai';
import { boot, invoke, packageElements, start, stop, validate } from '@business-framework/core';

const TABLE = `test_models_${Date.now()}`;

const fill = (id, command, order = {}) => ({ id, kind: 'slot-fill', data: { target: 'postgresql-database', slot: 'models', value: { command }, ...order } });

describe('database', () => {
    it('validates', async () => {
        await boot({ paths: ['@business-framework/integration', '@business-framework/database'].map(packageElements) });
        expect(validate()).to.deep.equal([]);
    });

    it('creates the models when the database starts, in slot order', async function () {
        const { skipWithoutPostgres } = await import('../../../infrastructure/postgresql/test/helpers.js');
        await skipWithoutPostgres(this);
        await boot({
            paths: ['@business-framework/integration', '@business-framework/database', '@business-framework/postgresql'].map(packageElements),
            elements: [
                fill('b-index', `CREATE INDEX ${TABLE}_name ON ${TABLE} (name)`, { after: ['z-table'] }),
                fill('z-table', `CREATE TABLE ${TABLE} (name TEXT)`)
            ]
        });
        await start();
        const { rows } = await invoke('postgresql', 'execute', { command: 'SELECT indexname FROM pg_indexes WHERE tablename = $1', parameters: [TABLE] });
        await invoke('postgresql', 'execute', { command: `DROP TABLE ${TABLE}` });
        await stop();
        expect(rows.map(row => row.indexname)).to.deep.equal([`${TABLE}_name`]);
    });
});
