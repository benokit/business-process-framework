import { expect } from 'chai';
import { boot, packageElements, start, stop } from '@business-framework/core';
import { applyMapping } from '@business-framework/core/mappings';
import { meilisearchFilter } from '../src/filter.js';
import { skipWithoutMeilisearch } from './helpers.js';
import { invoke } from '@business-framework/core';

const INDEX = `test-filter-${Date.now()}`;

const documents = [
    { id: 'a', ownership: { region: 'de', departments: ['motor', 'home'], level: 3, active: true } },
    { id: 'b', ownership: { region: 'fr', departments: ['home'], level: 5, active: false } },
    { id: 'c', ownership: { region: 'it', departments: [], active: true } },
    { id: 'd', ownership: { departments: ['motor'] } },
    { id: 'e' }
];

const filters = {
    equals: { $eq: ['#.ownership.region', 'de'] },
    differs: { $neq: ['#.ownership.region', 'de'] },
    'one of': { $includes: { collection: ['de', 'it'], value: '#.ownership.region' } },
    'array holds': { $includes: { collection: '#.ownership.departments', value: 'motor' } },
    'number': { $eq: ['#.ownership.level', 5] },
    'boolean': { $eq: ['#.ownership.active', true] },
    and: { $and: [{ $eq: ['#.ownership.active', true] }, { $includes: { collection: '#.ownership.departments', value: 'motor' } }] },
    or: { $or: [{ $eq: ['#.ownership.region', 'fr'] }, { $eq: ['#.ownership.region', 'it'] }] },
    not: { $not: { $includes: { collection: '#.ownership.departments', value: 'home' } } },
    'not of one of': { $not: { $includes: { collection: ['de', 'it'], value: '#.ownership.region' } } },
    nested: { $or: [{ $and: [{ $eq: ['#.ownership.region', 'de'] }, { $not: { $eq: ['#.ownership.active', false] } }] }, { $neq: ['#.ownership.region', 'fr'] }] }
};

describe('meilisearch filter', function () {
    it('translates a filter tree', () => {
        expect(meilisearchFilter({ $or: [{ $eq: ['#.ownership.region', 'de'] }, { $not: { $includes: { collection: ['a"b'], value: '#.ownership.region' } } }] }))
            .to.equal('(ownership.region = "de" OR NOT (ownership.region IN ["a\\"b"]))');
    });

    it('refuses what it cannot express', () => {
        expect(() => meilisearchFilter({ $lt: ['#.ownership.level', 3] })).to.throw("can't express");
        expect(() => meilisearchFilter({ $eq: ['#.ownership.region', '#.ownership.other'] })).to.throw("can't express");
    });

    describe('against an index', function () {
        before(async function () {
            await skipWithoutMeilisearch(this);
            await boot({ paths: ['@business-framework/integration', '@business-framework/search', '@business-framework/meilisearch'].map(packageElements) });
            await start();
            await invoke('default-meilisearch-engine', 'configureIndex', {
                indexName: INDEX,
                settings: { filterableAttributes: ['ownership.region', 'ownership.departments', 'ownership.level', 'ownership.active'] }
            });
            await Promise.all(documents.map(document => invoke('default-meilisearch-engine', 'insertDocument', { indexName: INDEX, document })));
        });

        after(async () => {
            await invoke('default-meilisearch-engine', 'deleteIndex', { indexName: INDEX }).catch(() => null);
            await stop();
        });

        Object.entries(filters).forEach(([name, filter]) => it(`finds what the mapping selects: ${name}`, async () => {
            const found = await invoke('default-meilisearch-engine', 'search', { indexName: INDEX, filter: meilisearchFilter(filter), limit: 100 });
            const selected = documents.filter(document => applyMapping({ mapping: filter, input: document })).map(({ id }) => id);
            expect(found.hits.map(({ id }) => id).sort()).to.deep.equal(selected.sort());
        }));
    });
});
