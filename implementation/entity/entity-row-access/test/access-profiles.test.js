import { expect } from 'chai';
import { boot, packageElements, validate } from '@business-framework/core';
import { explanationsOf } from '@business-framework/core/introspection';
import { rowAccess } from '../src/row-access.js';

const GERMAN = { $eq: ['#.ownership.region', 'de'] };
const CONFIDENTIAL = { $eq: ['#.ownership.confidential', true] };
const MINE = { $eq: ['#.ownership.region', '#.principal.region'] };

const PACKAGES = [
    'security', 'integration', 'database', 'postgresql', 'transaction', 'entities', 'entities-postgresql', 'messaging', 'messaging-nats', 'transactional-outbox',
    'transactional-outbox-postgresql', 'entity-events', 'search', 'meilisearch', 'entity-search', 'entity-ownership', 'entity-row-access'
];

const profile = (id, data) => ({ id, kind: 'access-profile', data });

const elements = [
    { id: 'regional', kind: 'kind', data: { extends: 'entity-type', fixed: { traits: { ownership: { configuration: { dimensions: { '!region': 'string', '!confidential': 'boolean' } } } } } } },
    { id: 'contract', kind: 'regional', data: { traits: { body: { configuration: { schema: { '!region': 'string' } } }, ownership: { configuration: { rule: { region: '#.data.body.region', confidential: false } } } } } },
    { id: 'claim', kind: 'regional', data: { traits: { body: { configuration: { schema: { '!region': 'string' } } }, ownership: { configuration: { rule: { region: '#.data.body.region', confidential: false } } } } } },
    { id: 'german', kind: 'ownership-scope', data: { filter: GERMAN } },
    { id: 'confidential', kind: 'ownership-scope', data: { filter: CONFIDENTIAL } },
    { id: 'own-region', kind: 'ownership-scope', data: { filter: MINE } },
    profile('german-access', { permissions: [{ resource: 'contract', scopes: ['german'] }] }),
    profile('open-access', { permissions: [{ resource: 'regional', scopes: '*', except: [{ scopes: ['confidential'] }] }] }),
    profile('all-access', { permissions: [{ scopes: '*' }] }),
    profile('own-region-access', { permissions: [{ resource: ['contract'], scopes: ['own-region'] }] }),
    profile('senior-access', { profiles: ['german-access'], permissions: [{ resource: 'contract', scopes: ['confidential'] }] }),
    profile('other-access', { permissions: [{ resource: 'claim', scopes: ['german'] }] })
];

describe('access profiles', () => {
    before(() => boot({ paths: PACKAGES.map(name => packageElements(`@business-framework/${name}`)), elements }));

    const reach = (entityType, ...profiles) => rowAccess({ entityType, profiles });

    it('validates', () => {
        expect(validate()).to.deep.equal([]);
    });

    it('reaches the rows of the scopes a profile lists, of the entity type or the class above it', () => {
        expect(reach('contract', 'german-access')).to.deep.equal(GERMAN);
        expect(reach('claim', 'german-access')).to.equal(null);
        expect(reach('contract', 'own-region-access')).to.deep.equal(MINE);
    });

    it('reaches all rows, or all but the excepted ones, and everything without a resource', () => {
        expect(reach('contract', 'open-access')).to.deep.equal({ $not: CONFIDENTIAL });
        expect(reach('claim', 'all-access')).to.equal(true);
    });

    it('unites the profiles of the user and the profiles they include, and nothing for a profile that does not reach the type', () => {
        expect(reach('contract', 'senior-access')).to.deep.equal({ $or: [CONFIDENTIAL, GERMAN] });
        expect(reach('contract', 'german-access', 'open-access')).to.deep.equal({ $or: [GERMAN, { $not: CONFIDENTIAL }] });
        expect(reach('contract', 'german-access', 'all-access')).to.equal(true);
        expect([reach('contract', 'other-access'), reach('contract'), reach('contract', 'no-such-profile')]).to.deep.equal([null, null, null]);
    });

    it('explains the profiles that reach an entity type and that name a scope', () => {
        expect(explanationsOf('contract').access.profiles).to.have.members(['german-access', 'open-access', 'all-access', 'own-region-access', 'senior-access']);
        expect(explanationsOf('confidential').access.profiles).to.have.members(['open-access', 'senior-access']);
    });
});

describe('access profile problems', () => {
    it('reports a resource that is no entity type, a scope that is none, and a profile that includes itself', async () => {
        await boot({
            paths: PACKAGES.map(name => packageElements(`@business-framework/${name}`)),
            elements: [
                ...elements,
                profile('bad-access', { permissions: [{ resource: 'german', scopes: ['contract', 'nowhere'], except: [{ scopes: ['party'] }] }], profiles: ['looping-access'] }),
                profile('looping-access', { profiles: ['bad-access'] })
            ]
        });
        const messages = validate().flatMap(({ data }) => data.messages ?? []);
        expect(messages).to.include.members([
            'bad-access: gives access to german, which is no entity type or class of entity types',
            'bad-access: gives access to the rows of contract, which is not a scope',
            'bad-access: gives access to the rows of nowhere, which is not a scope',
            'bad-access: includes itself through bad-access > looping-access > bad-access'
        ]);
    });
});
