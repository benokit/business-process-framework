import { expect } from 'chai';
import { boot, invoke, packageElements, start, stop, validate } from '@business-framework/core';
import { migrate, skipWithoutPostgres } from '../../../adapters/postgresql/test/helpers.js';

const run = Date.now();
const REGIONAL = `regional-${run}`;
const CONTRACT = `contract-${run}`;
const PLAIN = `plain-${run}`;

const body = { configuration: { schema: { '!region': 'string' } } };

const unowned = [{ id: CONTRACT, kind: 'entity-type', data: { traits: { body } } }];

const owned = [
    { id: PLAIN, kind: 'entity-type', data: { traits: { body } } },
    { id: REGIONAL, kind: 'kind', data: { extends: 'entity-type', fixed: { traits: { ownership: { configuration: { dimensions: { '!region': 'string' } } } } } } },
    {
        id: `ownership-backfill-${run}`,
        kind: 'slot-fill',
        data: {
            target: 'database',
            slot: 'migrations',
            position: 'last',
            value: { run: { inputMap: { entityType: CONTRACT }, invoke: 'entity-ownership-backfiller', operation: 'run' } }
        }
    },
    { id: CONTRACT, kind: REGIONAL, data: { traits: { body, ownership: { configuration: { rule: { region: '#.data.body.region' } } } } } }
];

const packages = ['security', 'integration', 'database', 'postgresql', 'transaction', 'entities', 'entities-postgresql', 'entity-ownership'];

const bootWith = async elements => {
    await boot({ paths: packages.map(name => packageElements(`@business-framework/${name}`)), elements });
    await start();
};

describe('ownership backfill', function () {
    before(async function () {
        await skipWithoutPostgres(this);
        await bootWith(unowned);
        await migrate();
        await Promise.all(['de', 'fr', 'it'].map(region => invoke(CONTRACT, 'create', { businessKey: region, traits: { body: { region } } })));
        await stop();
        await bootWith(owned);
        await migrate();
    });

    after(stop);

    it('validates', () => {
        expect(validate()).to.deep.equal([]);
    });

    it('derives, in a migration, the ownership of the records written before the trait, once', async () => {
        const record = await invoke(CONTRACT, 'read', { businessKey: 'fr' });
        expect([record.revision, record.data.ownership]).to.deep.equal([2, { region: 'fr' }]);
        expect(await invoke('entity-ownership-backfiller', 'run', { entityType: CONTRACT })).to.deep.equal({ updated: 0 });
    });

    it('refuses an entity type without the trait', async () => {
        const failure = await invoke('entity-ownership-backfiller', 'run', { entityType: PLAIN }).catch(error => error);
        expect(failure.code).to.equal('invalid');
    });
});
