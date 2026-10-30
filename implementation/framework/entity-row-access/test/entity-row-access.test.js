import { expect } from 'chai';
import { boot, invoke, packageElements, start, stop, validate } from '@business-framework/core';
import { migrate, skipWithoutPostgres } from '../../../infrastructure/postgresql/test/helpers.js';
import { skipWithoutMeilisearch } from '../../../infrastructure/meilisearch/test/helpers.js';

const run = Date.now();
const REGIONAL = `regional-${run}`;
const CONTRACT = `contract-${run}`;
const INDEX = `contracts-${run}`;

const ROLE_HEADER = 'x-role';

const ACCESS_HEADER = 'x-access';

const scopeOf = region => ({ id: `${region}-${run}`, kind: 'ownership-scope', data: { filter: { $eq: ['#.ownership.region', region] } } });

const profileOf = region => ({ id: `${region}-access-${run}`, kind: 'access-profile', data: { permissions: [{ resource: CONTRACT, scopes: [`${region}-${run}`] }] } });

const elements = [
    { kind: 'app-config', data: { 'http-server': { port: 0 } } },
    { id: REGIONAL, kind: 'kind', data: { extends: 'entity-type', fixed: { traits: { ownership: { configuration: { dimensions: { '!region': 'string' } } } } } } },
    {
        id: CONTRACT,
        kind: REGIONAL,
        data: { traits: { body: { configuration: { schema: { '!region': 'string', '!name': 'string' } } }, ownership: { configuration: { rule: { region: '#.data.body.region' } } } } }
    },
    { kind: 'slot-fill', data: { target: CONTRACT, slot: 'searchIndex', value: { index: INDEX, mapping: { set: { name: '#.input.data.body.name' } } } } },
    { id: INDEX, kind: 'search-index', data: {} },
    { kind: 'slot-fill', data: { target: INDEX, slot: 'implementations', value: { provider: 'meilisearch-engine', settings: { searchableAttributes: ['name'], filterableAttributes: ['ownership.region'] } } } },
    scopeOf('de'),
    scopeOf('fr'),
    profileOf('de'),
    profileOf('fr'),
    { id: `all-access-${run}`, kind: 'access-profile', data: { permissions: [{ resource: REGIONAL, scopes: '*' }] } },
    { id: `de-and-fr-access-${run}`, kind: 'access-profile', data: { profiles: [`de-access-${run}`, `fr-access-${run}`] } },
    { id: 'everything-actor', kind: 'actor', data: { grants: [{ area: 'entities' }] } },
    { id: 'everything-role', kind: 'role', data: { actors: ['everything-actor'] } },
    {
        id: 'header-principal',
        kind: 'principal-execution-node-wrapper',
        data: {
            keyword: 'asHeaderUser',
            node: { '!asHeaderUser': '@method' },
            implementation: {
                withContext: { user: { userId: 'tester', roles: [`#.input.headers.${ROLE_HEADER}`], access: [`#.input.headers.${ACCESS_HEADER}`] } },
                do: { next: true }
            }
        }
    },
    { id: 'authenticate-by-header', kind: 'slot-fill', data: { target: 'http-endpoint', slot: 'requestMiddleware', position: 'first', before: ['authorize-requests'], value: { asHeaderUser: { next: true } } } }
];

const packages = [
    'integration', 'database', 'postgresql', 'transaction', 'entities', 'entities-postgresql', 'messaging', 'messaging-nats', 'transactional-outbox',
    'transactional-outbox-postgresql', 'entity-events', 'search', 'meilisearch', 'entity-search', 'http-server', 'security', 'authorization', 'entities-http',
    'entity-search-http', 'entity-ownership', 'entity-row-access'
];

const call = async (access, method, path, { body, headers = {} } = {}) => {
    const { port } = await invoke('http-server', 'address', null);
    const response = await fetch(`http://localhost:${port}${path}`, {
        method,
        headers: { 'content-type': 'application/json', [ROLE_HEADER]: 'everything-role', [ACCESS_HEADER]: access, ...headers },
        ...(body && { body: JSON.stringify(body) })
    });
    return { status: response.status, etag: response.headers.get('etag'), body: await response.json() };
};

const everything = (...args) => call(`all-access-${run}`, ...args);

const as = region => (...args) => call(`${region}-access-${run}`, ...args);

const german = as('de');

const nobody = (...args) => call('no-access', ...args);

const create = (caller, businessKey, region) => caller('POST', `/entities/${CONTRACT}`, { body: { businessKey, body: { region, name: `contract ${businessKey}` } } });

describe('entity-row-access', function () {
    before(async function () {
        await skipWithoutPostgres(this);
        await skipWithoutMeilisearch(this);
        await boot({ paths: packages.map(name => packageElements(`@business-framework/${name}`)), elements });
        await start();
        await migrate();
    });

    after(async () => {
        await invoke('default-meilisearch-engine', 'deleteIndex', { indexName: INDEX }).catch(() => null);
        await stop();
    });

    it('validates', () => {
        expect(validate()).to.deep.equal([]);
    });

    it('reads the rows of the access profile and hides the others as not found', async () => {
        await create(everything, 'c-de', 'de');
        await create(everything, 'c-fr', 'fr');
        expect([
            (await german('GET', `/entities/${CONTRACT}/c-de`)).status,
            (await german('GET', `/entities/${CONTRACT}/c-fr`)).status,
            (await everything('GET', `/entities/${CONTRACT}/c-fr`)).status
        ]).to.deep.equal([200, 404, 200]);
    });

    it('refuses changing a row outside the scopes as not found, and handing a row over as forbidden, rolling it back', async () => {
        const { etag } = await everything('GET', `/entities/${CONTRACT}/c-de`);
        const frenchEtag = (await everything('GET', `/entities/${CONTRACT}/c-fr`)).etag;
        expect((await german('PUT', `/entities/${CONTRACT}/c-fr`, { body: { body: { region: 'de', name: 'taken' } }, headers: { 'if-match': frenchEtag } })).status).to.equal(404);
        expect((await german('PUT', `/entities/${CONTRACT}/c-de`, { body: { body: { region: 'fr', name: 'given' } }, headers: { 'if-match': etag } })).status).to.equal(403);
        const unchanged = await everything('GET', `/entities/${CONTRACT}/c-de`);
        expect([unchanged.etag, unchanged.body.data.body.region]).to.deep.equal([etag, 'de']);
        expect((await german('PUT', `/entities/${CONTRACT}/c-de`, { body: { body: { region: 'de', name: 'renamed' } }, headers: { 'if-match': etag } })).status).to.equal(200);
    });

    it('creates only rows within the scopes', async () => {
        expect((await create(german, 'c-new-fr', 'fr')).status).to.equal(403);
        expect((await everything('GET', `/entities/${CONTRACT}/c-new-fr`)).status).to.equal(404);
        expect((await create(german, 'c-new-de', 'de')).status).to.equal(201);
    });

    it('finds only the rows within the scopes', async function () {
        this.timeout(20000);
        await invoke('entity-search', 'reindex', { entityType: CONTRACT });
        const names = async caller => (await caller('POST', `/entity-search/${CONTRACT}`, { body: { limit: 50 } })).body.hits.map(hit => hit.name).sort();
        expect(await names(german)).to.deep.equal(['contract c-new-de', 'renamed']);
        expect((await names(everything)).length).to.equal(3);
        expect(await names(nobody)).to.deep.equal([]);
    });

    it('gives the same process role different rows through different access, and nothing without an access profile', async () => {
        const both = as('de-and-fr');
        expect([
            (await both('GET', `/entities/${CONTRACT}/c-de`)).status,
            (await both('GET', `/entities/${CONTRACT}/c-fr`)).status,
            (await nobody('GET', `/entities/${CONTRACT}/c-de`)).status,
            (await create(nobody, 'c-nobody', 'de')).status
        ]).to.deep.equal([200, 200, 404, 403]);
    });

    it('leaves calls without a principal alone', async () => {
        expect((await invoke(CONTRACT, 'read', { businessKey: 'c-fr' })).data.body.region).to.equal('fr');
    });
});
