import { expect } from 'chai';
import { boot, invoke, packageElements, start, stop, validate } from '@business-framework/core';
import { skipWithoutMeilisearch } from './helpers.js';

const INDEX = `test-index-${Date.now()}`;

const engine = operation => input => invoke('default-meilisearch-engine', operation, { indexName: INDEX, ...input });

describe('meilisearch', function () {
    before(async function () {
        await skipWithoutMeilisearch(this);
        await boot({ paths: ['@business-framework/integration', '@business-framework/search', '@business-framework/meilisearch'].map(packageElements) });
        await start();
        await engine('configureIndex')({ settings: { searchableAttributes: ['name'], filterableAttributes: ['type'] } });
    });

    after(async () => {
        await engine('deleteIndex')({}).catch(() => null);
        await stop();
    });

    it('validates', () => {
        expect(validate()).to.deep.equal([]);
    });

    it('indexes, searches with a filter and removes documents', async () => {
        await engine('insertDocument')({ document: { id: 'a', name: 'blue bridge', type: 'x' } });
        await engine('insertDocument')({ document: { id: 'b', name: 'blue tunnel', type: 'y' } });
        expect((await engine('search')({ query: 'blue', filter: 'type = x' })).hits.map(hit => hit.id)).to.deep.equal(['a']);
        await engine('removeDocument')({ id: 'a' });
        const { hits, total } = await engine('search')({ query: 'blue' });
        expect([hits.map(hit => hit.id), total]).to.deep.equal([['b'], 1]);
    });
});
