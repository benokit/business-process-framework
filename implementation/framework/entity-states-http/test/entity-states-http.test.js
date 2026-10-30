import { expect } from 'chai';
import { boot, invoke, packageElements, start, stop, validate } from '@business-framework/core';
import { migrate, skipWithoutPostgres } from '../../../infrastructure/postgresql/test/helpers.js';
import { headerPrincipal, ROLE_HEADER } from '../../authorization/test/principal.js';

const run = Date.now();
const ORDER = `order-states-http-${run}`;

const elements = [
    { kind: 'app-config', data: { 'http-server': { port: 0 } } },
    { id: ORDER, kind: 'entity-type', data: { traits: { body: { configuration: { schema: { '!amount': 'number' } } } } } },
    {
        id: `${ORDER}-lifecycle`,
        kind: 'slot-fill',
        data: { target: ORDER, slot: 'traits', value: { trait: 'state', configuration: { states: { status: { draft: true, done: true } }, transitions: { finish: { status: { draft: 'done' } } }, initialStates: { default: { status: 'draft' } } } } }
    },
    { id: 'lifecycle-role', kind: 'role', data: { actors: ['entity-lifecycle-actor'] } },
    ...headerPrincipal
];

const packages = ['integration', 'database', 'postgresql', 'transaction', 'entities', 'entities-postgresql', 'entity-states', 'http-server', 'security', 'authorization', 'entities-http', 'entity-states-http'];

const post = async (path, headers = {}) => {
    const { port } = await invoke('http-server', 'address', null);
    const response = await fetch(`http://localhost:${port}${path}`, { method: 'POST', headers: { [ROLE_HEADER]: 'lifecycle-role', ...headers } });
    return { status: response.status, etag: response.headers.get('etag'), body: await response.json() };
};

describe('entity-states-http', function () {
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

    it('transitions with ETags', async () => {
        await invoke(ORDER, 'create', { businessKey: 't-1', traits: { body: { amount: 1 } } });
        expect((await post(`/entities/${ORDER}/t-1/transitions/finish`, { 'if-match': '"5"' })).status).to.equal(409);
        const finished = await post(`/entities/${ORDER}/t-1/transitions/finish`, { 'if-match': '"1"' });
        expect([finished.status, finished.etag, finished.body.data.state]).to.deep.equal([200, '"2"', { status: 'done' }]);
        expect((await post(`/entities/${ORDER}/t-1/transitions/finish`)).status).to.equal(400);
        expect((await post(`/entities/${ORDER}/t-1/transitions/finish`, { 'if-match': finished.etag })).status).to.equal(409);
        expect((await post('/entities/postgresql/x/transitions/finish', { 'if-match': '"1"' })).status).to.equal(404);
    });
});
