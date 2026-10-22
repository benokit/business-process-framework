import { expect } from 'chai';
import { boot, invoke, packageElements, start, stop, validate } from '@business-framework/core';
import { skipWithoutPostgres } from '../../../infrastructure/postgresql/test/helpers.js';
import { skipWithoutMeilisearch } from '../../../infrastructure/meilisearch/test/helpers.js';

const run = Date.now();
const PROJECT = `project-${run}`;
const INDEX = `projects-${run}`;

const elements = [
    { id: PROJECT, kind: 'entity-type', data: { bodySchema: { '!name': 'string' } } },
    {
        kind: 'slot-fill',
        data: {
            target: PROJECT,
            slot: 'searchIndex',
            value: { searchEngine: 'meilisearch', indexName: INDEX, settings: { searchableAttributes: ['name'] }, mapping: { set: { name: '#.input.data.body.name', key: '#.input.businessKey' } } }
        }
    }
];

const packages = ['database', 'postgresql', 'transaction', 'entities', 'messaging', 'messaging-nats', 'transactional-outbox', 'entity-events', 'search', 'meilisearch', 'entity-search'];

const keysFor = async query => (await invoke('entity-search', 'search', { entityType: PROJECT, query })).hits.map(hit => hit.key).sort();

const eventually = async (check, timeout = 15000) => {
    const deadline = Date.now() + timeout;
    while (!(await check()) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 200));
    expect(await check()).to.equal(true);
};

describe('entity-search', function () {
    before(async function () {
        await skipWithoutPostgres(this);
        await skipWithoutMeilisearch(this);
        await boot({ paths: packages.map(name => packageElements(`@business-framework/${name}`)), elements });
        await start();
    });

    after(async () => {
        await invoke('meilisearch', 'deleteIndex', { indexName: INDEX }).catch(() => null);
        await stop();
    });

    it('validates', () => {
        expect(validate()).to.deep.equal([]);
    });

    it('indexes created entities and removes deleted ones', async () => {
        await invoke(PROJECT, 'create', { businessKey: 'p-1', body: { name: 'golden bridge' } });
        await invoke(PROJECT, 'create', { businessKey: 'p-2', body: { name: 'golden tunnel' } });
        await eventually(async () => (await keysFor('golden')).length === 2);
        await invoke(PROJECT, 'delete', { businessKey: 'p-1', revision: 1 });
        await eventually(async () => JSON.stringify(await keysFor('golden')) === JSON.stringify(['p-2']));
    });

    it('reindexes existing entities', async () => {
        await invoke('meilisearch', 'deleteIndex', { indexName: INDEX });
        await invoke('entity-search', 'reindex', { entityType: PROJECT });
        expect(await keysFor('tunnel')).to.deep.equal(['p-2']);
    });

    it('refuses entity types without an index', async () => {
        expect((await invoke('entity-search', 'search', { entityType: 'ajv' }).catch(e => e)).code).to.equal('not-found');
    });
});
