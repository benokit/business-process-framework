import { expect } from 'chai';
import { boot, invoke, packageElements, start, stop, validate } from '@business-framework/core';
import { skipWithoutPostgres } from '../../../infrastructure/postgresql/test/helpers.js';
import { headerPrincipal, ROLE_HEADER } from '../../authorization/test/principal.js';

const run = Date.now();
const ORDER = `order-http-${run}`;

const elements = [
    { kind: 'app-config', data: { http: { port: 0 } } },
    { id: ORDER, kind: 'entity-type', data: { bodySchema: { '!amount': 'number' } } },
    { id: 'editor-role', kind: 'role', data: { actors: ['entity-editor-actor'] } },
    ...headerPrincipal
];

const packages = ['integration', 'database', 'postgresql', 'transaction', 'entities', 'entities-postgresql', 'http-server', 'security', 'authorization', 'entities-http'];

const call = async (method, path, { body, headers = {} } = {}) => {
    const { port } = await invoke('http-server', 'address', null);
    const response = await fetch(`http://localhost:${port}${path}`, {
        method,
        headers: { 'content-type': 'application/json', [ROLE_HEADER]: 'editor-role', ...headers },
        ...(body && { body: JSON.stringify(body) })
    });
    return { status: response.status, etag: response.headers.get('etag'), body: await response.json() };
};

describe('entities-http', function () {
    before(async function () {
        await skipWithoutPostgres(this);
        await boot({ paths: packages.map(name => packageElements(`@business-framework/${name}`)), elements });
        await start();
    });

    after(stop);

    it('validates', () => {
        expect(validate()).to.deep.equal([]);
    });

    it('creates, reads, updates and deletes with ETags', async () => {
        const created = await call('POST', `/entities/${ORDER}`, { body: { businessKey: 'h-1', body: { amount: 1 } } });
        expect([created.status, created.etag]).to.deep.equal([201, '"1"']);
        const read = await call('GET', `/entities/${ORDER}/h-1`);
        expect([read.status, read.body.data]).to.deep.equal([200, { body: { amount: 1 } }]);
        const updated = await call('PUT', `/entities/${ORDER}/h-1`, { body: { body: { amount: 2 } }, headers: { 'if-match': read.etag } });
        expect([updated.status, updated.etag]).to.deep.equal([200, '"2"']);
        const stale = await call('PUT', `/entities/${ORDER}/h-1`, { body: { body: { amount: 3 } }, headers: { 'if-match': '"1"' } });
        expect(stale.status).to.equal(409);
        const past = await call('GET', `/entities/${ORDER}/h-1?revision=1`);
        expect(past.body.data).to.deep.equal({ body: { amount: 1 } });
        expect((await call('DELETE', `/entities/${ORDER}/h-1`)).status).to.equal(400);
        expect((await call('DELETE', `/entities/${ORDER}/h-1`, { headers: { 'if-match': updated.etag } })).status).to.equal(200);
        expect((await call('GET', `/entities/${ORDER}/h-1`)).status).to.equal(404);
    });

    it('requires If-Match for updates', async () => {
        await call('POST', `/entities/${ORDER}`, { body: { businessKey: 'h-2', body: { amount: 1 } } });
        expect((await call('PUT', `/entities/${ORDER}/h-2`, { body: { body: { amount: 2 } } })).status).to.equal(400);
    });

    it('lists entities and entity types', async () => {
        const { body: { items, total } } = await call('GET', `/entities/${ORDER}?limit=1`);
        expect([items.length, total >= 1]).to.deep.equal([1, true]);
        const types = await call('GET', '/entity-types');
        expect(types.body.items.find(type => type.id === ORDER)).to.deep.include({ bodySchema: { '!amount': 'number' }, traits: {} });
    });

    it('refuses elements that are not entity types', async () => {
        const response = await call('POST', '/entities/postgresql', { body: { businessKey: 'x', body: {} } });
        expect([response.status, response.body.error.code]).to.deep.equal([404, 'not-found']);
    });
});
