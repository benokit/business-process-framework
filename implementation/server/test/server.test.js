import { expect } from 'chai';
import { fileURLToPath } from 'url';
import { invoke, validate } from '@business-framework/core';
import { installedPackages, startServer } from '@business-framework/server';
import { migrate, skipWithoutPostgres } from '../../infrastructure/postgresql/test/helpers.js';
import { skipWithoutMeilisearch } from '../../infrastructure/meilisearch/test/helpers.js';
import { skipWithoutIdentityProvider, tokenFor } from '../../framework/oauth/test/helpers.js';

const DEMO = fileURLToPath(new URL('../../../demo', import.meta.url));
const run = Date.now();

const call = async (method, path, body, token, headers = {}) => {
    const { port } = await invoke('http-server', 'address', null);
    const response = await fetch(`http://localhost:${port}${path}`, {
        method,
        headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }), ...headers },
        ...(body && { body: JSON.stringify(body) })
    });
    return { status: response.status, body: await response.json() };
};

describe('server with the demo', function () {
    let stop = async () => null;

    before(async function () {
        await skipWithoutPostgres(this);
        await skipWithoutMeilisearch(this);
        await skipWithoutIdentityProvider(this);
        stop = await startServer({ paths: [DEMO], elements: [{ kind: 'app-config', data: { 'http-server': { port: 0 }, authenticate: { actAs: { administrator: `boss-${run}` } } } }] });
        await migrate();
    });

    after(() => stop());

    it('loads every installed package with elements', async () => {
        expect(await installedPackages()).to.include.members(['@business-framework/entities', '@business-framework/server']);
    });

    it('validates', () => {
        expect(validate()).to.deep.equal([]);
    });

    const userWith = async (subject, roles) => {
        await invoke('user', 'create', { traits: { body: { subject, roles } } });
        return tokenFor(subject);
    };

    it('refuses a request without a token, or of a subject that is no user', async () => {
        const stranger = await tokenFor(`stranger-${run}`);
        expect([(await call('GET', '/entity-types')).status, (await call('GET', '/entity-types', null, stranger)).status]).to.deep.equal([401, 401]);
    });

    it('lets a viewer read and refuses its changes', async () => {
        const token = await userWith(`viewer-${run}`, ['viewer-role']);
        expect((await call('GET', '/entities/party', null, token)).status).to.equal(200);
        expect((await call('POST', '/entities/party', { businessKey: `v-${run}`, body: { partyType: 'person', name: 'Bo' } }, token)).status).to.equal(403);
    });

    it('lets the login the deployment configures act as the migrated administrator', async () => {
        const boss = await tokenFor(`boss-${run}`);
        expect((await call('POST', '/entities/user', { body: { subject: `hired-${run}`, roles: ['viewer-role'] } }, boss)).status).to.equal(201);
    });

    it('lets only an administrator administer users', async () => {
        const [administrator, underwriter, viewer] = await Promise.all(['administrator', 'underwriter', 'viewer']
            .map(role => userWith(`${role}-of-users-${run}`, [`${role}-role`])));
        const user = { body: { subject: `new-${run}`, roles: ['viewer-role'] } };
        expect(await Promise.all([
            call('POST', '/entities/user', user, underwriter).then(({ status }) => status),
            call('GET', '/entities/user', null, viewer).then(({ status }) => status),
            call('POST', '/entities/user', user, administrator).then(({ status }) => status),
            call('GET', '/entities/user', null, administrator).then(({ status }) => status)
        ])).to.deep.equal([403, 403, 201, 200]);
    });

    const terms = (premium, endDate) => ({ premium, sumInsured: 100000, endDate });

    const move = (record, transition, token) => call('POST', `/entities/${record.entityType}/${record.businessKey}/transitions/${transition}`, null, token, { 'if-match': `"${record.revision}"` });

    const newParty = async token => {
        const businessKey = `ph-${run}-${Math.random()}`;
        await call('POST', '/entities/party', { businessKey, body: { partyType: 'person', name: 'Ada' } }, token);
        return businessKey;
    };

    const contractOf = async (entityType, body, underwriter, businessKey) => (await call('POST', `/entities/${entityType}`, {
        businessKey,
        body: { policyholder: await newParty(underwriter), currency: 'EUR', ...body },
        traits: { timeline: { validFrom: '2026-01-01', data: terms(1000, '2027-01-01') } }
    }, underwriter)).body;

    const activeContract = async (underwriter, administrator, entityType = 'construction', body = { project: 'tunnel' }, businessKey = undefined) => {
        const created = await contractOf(entityType, body, underwriter, businessKey);
        const issued = await move(created, 'issue', underwriter);
        return (await move(issued.body, 'activate', administrator)).body;
    };

    const propose = (contract, amendmentType, effectiveFrom, changes, token) => call('POST', `/entities/${contract.entityType}/${contract.businessKey}/amendments`, {
        amendmentType, effectiveFrom, reason: 'indexation', changes
    }, token);

    const activate = async (amendment, underwriter, administrator) => {
        const issued = await move(amendment, 'issue', underwriter);
        return move(issued.body, 'activate', administrator);
    };

    const read = async (record, token) => (await call('GET', `/entities/${record.entityType}/${record.businessKey}`, null, token)).body;

    const periodsOf = async (contract, token) => Object.keys((await read(contract, token)).data.timeline).sort();

    const ledgerOf = async (contract, token) => (await read(contract, token)).data['amendment-ledger'];

    it('amends an active contract by amendments, one open at a time, numbered without gaps, that an administrator activates and that are annulled in reverse order', async () => {
        const [underwriter, administrator] = await Promise.all([userWith(`amender-${run}`, ['underwriter-role']), userWith(`approver-${run}`, ['administrator-role'])]);
        const contract = await activeContract(underwriter, administrator);
        expect(await ledgerOf(contract, administrator)).to.deep.equal({ last: 0, open: null });
        const first = (await propose(contract, 'premium-adjustment', '2026-07-01', { premium: 1200 }, underwriter)).body;
        expect([first.data.state.status, first.businessKey]).to.deep.equal(['draft', `${contract.businessKey}-001`]);
        expect((await propose(contract, 'extension', '2027-01-01', { endDate: '2028-01-01' }, underwriter)).status).to.equal(409);
        expect(await ledgerOf(contract, administrator)).to.deep.equal({ last: 1, open: first.businessKey });

        expect((await activate(first, underwriter, administrator)).body.data.state.status).to.equal('active');
        expect(await ledgerOf(contract, administrator)).to.deep.equal({ last: 1, open: null });
        const second = (await propose(contract, 'extension', '2027-01-01', { endDate: '2028-01-01' }, underwriter)).body;
        expect(second.businessKey).to.equal(`${contract.businessKey}-002`);
        expect((await activate(second, underwriter, administrator)).body.data.state.status).to.equal('active');
        expect(await periodsOf(contract, administrator)).to.deep.equal(['2026-01-01', '2026-07-01', '2027-01-01']);
        const amended = await read(contract, administrator);
        expect(amended.data.timeline['2027-01-01']).to.deep.equal(terms(1200, '2028-01-01'));
        expect(amended.data.body).to.deep.equal(contract.data.body);

        const [activeFirst, activeSecond] = await Promise.all([first, second].map(amendment => read(amendment, administrator)));
        expect((await move(activeFirst, 'annul', underwriter)).status).to.equal(409);
        expect((await move(activeSecond, 'annul', underwriter)).body.data.state.status).to.equal('annulled');
        expect((await move(activeFirst, 'annul', underwriter)).body.data.state.status).to.equal('annulled');
        expect(await periodsOf(contract, administrator)).to.deep.equal(['2026-01-01']);
        expect(await ledgerOf(contract, administrator)).to.deep.equal({ last: 2, open: null });
    });

    it('lets one of two concurrent proposals win, leaving no gap', async () => {
        const [underwriter, administrator] = await Promise.all([userWith(`amender-r-${run}`, ['underwriter-role']), userWith(`approver-r-${run}`, ['administrator-role'])]);
        const contract = await activeContract(underwriter, administrator);
        const results = await Promise.all(['2026-07-01', '2026-08-01'].map(effectiveFrom => propose(contract, 'premium-adjustment', effectiveFrom, { premium: 1 }, underwriter)));
        expect(results.map(({ status }) => status).sort()).to.deep.equal([201, 409]);
        const winner = results.find(({ status }) => status === 201).body;
        expect([winner.businessKey, await ledgerOf(contract, administrator)]).to.deep.equal([`${contract.businessKey}-001`, { last: 1, open: winner.businessKey }]);
    });

    it('refuses writes to the ledger and the timeline other than by their own commands', async () => {
        const [underwriter, administrator] = await Promise.all([userWith(`amender-w-${run}`, ['underwriter-role']), userWith(`approver-w-${run}`, ['administrator-role'])]);
        const contract = await activeContract(underwriter, administrator);
        const write = (key, command, value) => invoke('construction', 'writeTrait', { businessKey: contract.businessKey, revision: contract.revision, key, command, value })
            .then(() => 'accepted', error => `${error.code}: ${error.message}`);
        expect(await Promise.all([
            write('amendment-ledger', 'reset', { last: 0, open: null }),
            write('amendment-ledger', 'open', { last: 'many', open: null }),
            write('timeline', 'overwrite', {})
        ])).to.deep.equal([
            'invalid: the amendment ledger has no command reset',
            'invalid: the amendment ledger is { last, open }',
            'invalid: the timeline has no command overwrite'
        ]);
    });

    it('proposes amendments only through an active contract that allows their type', async () => {
        const [underwriter, administrator, viewer] = await Promise.all([userWith(`amender-1-${run}`, ['underwriter-role']), userWith(`approver-1-${run}`, ['administrator-role']), userWith(`viewer-1-${run}`, ['viewer-role'])]);
        const draft = await contractOf('construction', { project: 'dam' }, underwriter);
        expect((await propose(draft, 'premium-adjustment', '2026-07-01', { premium: 1 }, underwriter)).status).to.equal(409);

        const marine = await activeContract(underwriter, administrator, 'marine', { vessel: 'Aurora' }, `M-${run}`);
        expect((await propose(marine, 'extension', '2026-07-01', { endDate: '2028-01-01' }, underwriter)).status).to.equal(400);
        expect((await propose(marine, 'premium-adjustment', '2026-07-01', { premium: 1100 }, underwriter)).status).to.equal(201);

        const contract = await activeContract(underwriter, administrator);
        const direct = { businessKey: `direct-${run}`, body: { amendedType: 'construction', amendedKey: contract.businessKey, effectiveFrom: '2026-07-01', reason: 'x', changes: { premium: 1 } } };
        expect((await propose(contract, 'premium-adjustment', '2026-07-01', { premium: 1 }, viewer)).status).to.equal(403);
        const created = await call('POST', '/entities/premium-adjustment', direct, administrator);
        expect([created.status, created.body.error.message]).to.deep.equal([403, 'amendments are proposed through the entity they amend']);
    });

    it('refuses to activate an amendment that starts before the current terms or ends them before they start, and cancels one that never took effect', async () => {
        const [underwriter, administrator] = await Promise.all([userWith(`amender-2-${run}`, ['underwriter-role']), userWith(`approver-2-${run}`, ['administrator-role'])]);
        const contract = await activeContract(underwriter, administrator);
        const early = (await propose(contract, 'premium-adjustment', '2026-01-01', { premium: 1 }, underwriter)).body;
        const tooEarly = await activate(early, underwriter, administrator);
        expect(tooEarly.status).to.equal(409);
        expect(await ledgerOf(contract, administrator)).to.deep.equal({ last: 1, open: early.businessKey });

        const issued = await read(early, administrator);
        const cancelled = await move(issued, 'cancel', underwriter);
        expect(cancelled.body.data.state.status).to.equal('cancelled');
        expect((await move(cancelled.body, 'activate', administrator)).status).to.equal(409);
        expect(await ledgerOf(contract, administrator)).to.deep.equal({ last: 1, open: null });

        const backwards = (await propose(contract, 'extension', '2026-07-01', { endDate: '2026-03-01' }, underwriter)).body;
        expect(backwards.businessKey).to.equal(`${contract.businessKey}-002`);
        expect((await activate(backwards, underwriter, administrator)).status).to.equal(400);
        expect(await periodsOf(contract, administrator)).to.deep.equal(['2026-01-01']);
    });

    it('runs a contract through its lifecycle as an underwriter, who may not activate it', async () => {
        const token = await userWith(`underwriter-${run}`, ['underwriter-role']);
        const party = await call('POST', '/entities/party', { businessKey: `p-${run}`, body: { partyType: 'person', name: 'Ada' } }, token);
        expect(party.status).to.equal(201);
        const contract = await call('POST', '/entities/construction', {
            body: { policyholder: `p-${run}`, project: 'bridge', currency: 'EUR' },
            traits: { timeline: { validFrom: '2026-01-01', data: terms(1000, '2027-01-01') } }
        }, token);
        expect([contract.status, contract.body.businessKey]).to.satisfy(([status, key]) => status === 201 && /^CON-\d{4}-\d{4,}$/.test(key));
        const key = contract.body.businessKey;
        const issued = await call('POST', `/entities/construction/${key}/transitions/issue`, null, token, { 'if-match': `"${contract.body.revision}"` });
        expect(issued.body.data.state.status).to.equal('issued');
        const activated = await call('POST', `/entities/construction/${key}/transitions/activate`, null, token, { 'if-match': `"${issued.body.revision}"` });
        expect(activated.status).to.equal(403);
        const late = await call('PUT', `/entities/construction/${key}`, { body: contract.body.data.body }, token, { 'if-match': `"${issued.body.revision}"` });
        expect([late.status, late.body.error.message]).to.deep.equal([409, 'insurance contracts can only be updated in draft']);
    });
});
