import { expect } from 'chai';
import { boot, invoke, packageElements, start, stop, validate } from '@business-framework/core';
import { migrate, skipWithoutPostgres } from '../../../infrastructure/postgresql/test/helpers.js';

const run = Date.now();
const REGIONAL = `regional-${run}`;
const CONTRACT = `contract-${run}`;
const PLAIN = `plain-${run}`;
const SIZED = `sized-${run}`;

const elements = [
    {
        id: REGIONAL,
        kind: 'kind',
        data: { extends: 'entity-type', fixed: { traits: { ownership: { configuration: { dimensions: { '!region': 'string', 'departments[]': 'string' } } } } } }
    },
    {
        id: CONTRACT,
        kind: REGIONAL,
        data: {
            traits: {
                body: { configuration: { schema: { '!region': 'string', '!team': 'string' } } },
                ownership: { configuration: { rule: { region: '#.data.body.region', departments: ['#.data.body.team'] } } }
            }
        }
    },
    {
        id: SIZED,
        kind: REGIONAL,
        data: { traits: { body: { configuration: { schema: { '!size': 'number' } } }, ownership: { configuration: { rule: { region: '#.data.body.size' } } } } }
    },
    { id: PLAIN, kind: 'entity-type', data: { traits: { body: { configuration: { schema: { '!name': 'string' } } } } } }
];

const packages = ['security', 'integration', 'database', 'postgresql', 'transaction', 'entities', 'entities-postgresql', 'entity-ownership'];

const errorOf = promise => promise.then(() => null, error => error);

const create = (businessKey, body) => invoke(CONTRACT, 'create', { businessKey, traits: { body } });

describe('entity-ownership', function () {
    before(async function () {
        await skipWithoutPostgres(this);
        await boot({ paths: packages.map(name => packageElements(`@business-framework/${name}`)), elements });
        await start();
        await migrate();
    });

    after(stop);

    it('validates', () => {
        expect(validate()).to.deep.equal([]);
    });

    it('derives the ownership from the data on create', async () => {
        const created = await create('c-1', { region: 'de', team: 'motor' });
        expect(created.data.ownership).to.deep.equal({ region: 'de', departments: ['motor'] });
    });

    it('rederives it in the revision of the write that changes the data', async () => {
        await create('c-2', { region: 'de', team: 'motor' });
        const moved = await invoke('entity-bodies', 'put', { entityType: CONTRACT, businessKey: 'c-2', revision: 1, value: { region: 'fr', team: 'motor' } });
        expect([moved.revision, moved.data.ownership]).to.deep.equal([2, { region: 'fr', departments: ['motor'] }]);
        const past = await invoke(CONTRACT, 'read', { businessKey: 'c-2', revision: 1 });
        expect(past.data.ownership.region).to.equal('de');
    });

    it('leaves the record alone when the ownership does not change', async () => {
        await create('c-3', { region: 'de', team: 'motor' });
        const written = await invoke('entity-bodies', 'put', { entityType: CONTRACT, businessKey: 'c-3', revision: 1, value: { region: 'de', team: 'motor' } });
        expect([written.revision, written.data.ownership]).to.deep.equal([2, { region: 'de', departments: ['motor'] }]);
    });

    it('refuses ownership as input and a rule that produces an undeclared dimension or a wrong type', async () => {
        const given = await errorOf(invoke(CONTRACT, 'create', { businessKey: 'c-4', traits: { body: { region: 'de', team: 'motor' }, ownership: { region: 'fr' } } }));
        expect(given.code).to.equal('invalid');
        const wrong = await errorOf(invoke(SIZED, 'create', { businessKey: 's-1', traits: { body: { size: 7 } } }));
        expect(wrong.code).to.equal('invalid');
    });

    it('refuses a string with uppercase letters, which a search filter would not tell from its lowercase', async () => {
        const shouting = await errorOf(create('c-6', { region: 'DE', team: 'motor' }));
        expect(shouting.code).to.equal('invalid');
    });

    it('leaves an entity type without the trait alone', async () => {
        const created = await invoke(PLAIN, 'create', { businessKey: 'p-1', traits: { body: { name: 'a' } } });
        expect(created.data).to.deep.equal({ body: { name: 'a' } });
    });
});
