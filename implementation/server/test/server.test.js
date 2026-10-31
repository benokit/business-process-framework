import { expect } from 'chai';
import { fileURLToPath } from 'url';
import { invoke, validate } from '@business-framework/core';
import { installedPackages, startServer } from '@business-framework/server';
import { migrate, skipWithoutPostgres } from '../../adapters/postgresql/test/helpers.js';
import { skipWithoutMeilisearch } from '../../adapters/meilisearch/test/helpers.js';
import { skipWithoutIdentityProvider, tokenFor } from '../../services/oauth/test/helpers.js';

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

    const userWith = async (subject, roles, { access = ['all-contracts-access-profile'], ...claims } = {}) => {
        await invoke('user', 'create', { traits: { body: { subject, roles, access, ...claims } } });
        return tokenFor(subject);
    };

    it('refuses a request without a token, or of a subject that is no user', async () => {
        const stranger = await tokenFor(`stranger-${run}`);
        expect([(await call('GET', '/entity-types')).status, (await call('GET', '/entity-types', null, stranger)).status]).to.deep.equal([401, 401]);
    });

    it('lets a viewer read and refuses its changes', async () => {
        const token = await userWith(`viewer-${run}`, ['viewer-role']);
        expect((await call('GET', '/entities/party/nobody', null, token)).status).to.equal(404);
        expect((await call('GET', '/entity-types', null, token)).status).to.equal(200);
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
            call('GET', `/entities/user/viewer-of-users-${run}`, null, viewer).then(({ status }) => status),
            call('POST', '/entities/user', user, administrator).then(({ status }) => status),
            call('GET', `/entities/user/administrator-of-users-${run}`, null, administrator).then(({ status }) => status)
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
        body: { policyholder: await newParty(underwriter), currency: 'EUR', region: 'de', ...body },
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

    it('refuses writes to the ledger other than by its own commands, and exposes no write of a timeline command', async () => {
        const [underwriter, administrator] = await Promise.all([userWith(`amender-w-${run}`, ['underwriter-role']), userWith(`approver-w-${run}`, ['administrator-role'])]);
        const contract = await activeContract(underwriter, administrator);
        const write = (operation, input) => invoke('construction', operation, { businessKey: contract.businessKey, revision: contract.revision, ...input })
            .then(() => 'accepted', error => `${error.code}: ${error.message}`);
        expect(await Promise.all([
            write('writeLedger', { command: 'reset', value: { last: 0, open: null } }),
            write('writeLedger', { command: 'open', value: { last: 'many', open: null } }),
            write('writeTrait', { key: 'timeline', command: 'overwrite', value: {} }),
            write('applyChange', { change: {} })
        ])).to.deep.equal([
            'invalid: the amendment ledger has no command reset',
            'invalid: the amendment ledger is { last, open }',
            "unknown-operation: construction has no operation 'writeTrait'",
            'private-operation: construction.applyChange is private to construction'
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
            body: { policyholder: `p-${run}`, project: 'bridge', currency: 'EUR', region: 'de' },
            traits: { timeline: { validFrom: '2026-01-01', data: terms(1000, '2027-01-01') } }
        }, token);
        expect([contract.status, contract.body.businessKey]).to.satisfy(([status, key]) => status === 201 && /^CON-\d{4}-\d{4,}$/.test(key));
        const key = contract.body.businessKey;
        const issued = await call('POST', `/entities/construction/${key}/transitions/issue`, null, token, { 'if-match': `"${contract.body.revision}"` });
        expect(issued.body.data.state.status).to.equal('issued');
        const activated = await call('POST', `/entities/construction/${key}/transitions/activate`, null, token, { 'if-match': `"${issued.body.revision}"` });
        expect(activated.status).to.equal(403);
        const late = await call('PUT', `/entities/construction/${key}`, { body: contract.body.data.body }, token, { 'if-match': `"${issued.body.revision}"` });
        expect([late.status, late.body.error.message]).to.deep.equal([409, "construction doesn't allow trait body in its current state"]);
    });

    it('lets an underwriter cancel a contract only while it is issued, an administrator in any state', async () => {
        const [underwriter, administrator] = await Promise.all([userWith(`canceller-${run}`, ['underwriter-role']), userWith(`canceller-admin-${run}`, ['administrator-role'])]);
        const issued = (await move(await contractOf('construction', { project: 'dam' }, underwriter), 'issue', underwriter)).body;
        const active = await activeContract(underwriter, administrator);
        expect((await move(active, 'cancel', underwriter)).status).to.equal(403);
        expect((await move(active, 'cancel', administrator)).body.data.state.status).to.equal('cancelled');
        expect((await move(issued, 'cancel', underwriter)).body.data.state.status).to.equal('cancelled');
    });

    describe('row access', () => {
        const eventually = async (check, timeout = 80000) => {
            const deadline = Date.now() + timeout;
            while (!(await check()) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 250));
            expect(await check()).to.equal(true);
        };

        const statuses = (...calls) => Promise.all(calls).then(results => results.map(({ status }) => status));

        const keysFound = async token => (await call('POST', '/entity-search/construction', { query: String(run), limit: 100 }, token)).body.hits?.map(hit => hit.businessKey) ?? [];

        let users;
        let contracts;

        before(async () => {
            const [headOffice, german, senior, french, auditor] = await Promise.all([
                ['head-office', 'underwriter-role', 'all-contracts-access-profile'],
                ['german', 'underwriter-role', 'regional-contracts-access-profile', 'de'],
                ['senior', 'underwriter-role', 'senior-regional-contracts-access-profile', 'de'],
                ['french', 'underwriter-role', 'regional-contracts-access-profile', 'fr'],
                ['auditor', 'viewer-role', 'open-contracts-access-profile']
            ].map(([name, role, profile, region]) => userWith(`${name}-${run}`, [role], { access: [profile], ...region && { region } })));
            users = { headOffice, german, senior, french, auditor };
            const create = async (region, confidential) => (await contractOf('construction', { project: 'tunnel', region, confidential }, headOffice)).businessKey;
            contracts = { german: await create('de', false), confidentialGerman: await create('de', true), french: await create('fr', false) };
        });

        const get = (key, token) => call('GET', `/entities/construction/${key}`, null, token).then(({ status }) => status);

        it('shows a regional underwriter the contracts of the region that are not confidential, and the others as not found', async () => {
            expect(await Promise.all([contracts.german, contracts.confidentialGerman, contracts.french].map(key => get(key, users.german)))).to.deep.equal([200, 404, 404]);
            expect(await Promise.all([contracts.german, contracts.confidentialGerman, contracts.french].map(key => get(key, users.headOffice)))).to.deep.equal([200, 200, 200]);
        });

        it('gives users of one process role different rows through different access profiles, and a profile can include another: a senior sees the confidential contracts of the region', async () => {
            expect(await Promise.all([contracts.german, contracts.confidentialGerman, contracts.french].map(key => get(key, users.senior)))).to.deep.equal([200, 200, 404]);
        });

        it('shows a regional underwriter without the claim nothing, and finds nothing for them', async () => {
            const unassigned = await userWith(`unassigned-${run}`, ['underwriter-role'], { access: ['regional-contracts-access-profile'] });
            expect(await Promise.all([contracts.german, contracts.french].map(key => get(key, unassigned)))).to.deep.equal([404, 404]);
            const search = await call('POST', '/entity-search/construction', { query: String(run) }, unassigned);
            expect([search.status, search.body.hits, search.body.total]).to.deep.equal([200, [], 0]);
        });

        it('lets an auditor, whose process role only reads, read what is not confidential in every region', async () => {
            expect(await Promise.all([contracts.german, contracts.confidentialGerman, contracts.french].map(key => get(key, users.auditor)))).to.deep.equal([200, 404, 200]);
            const created = await call('POST', '/entities/construction', { body: { policyholder: 'x', project: 'y', currency: 'EUR', region: 'de' }, traits: { timeline: { validFrom: '2026-01-01', data: terms(1, '2027-01-01') } } }, users.auditor);
            expect(created.status).to.equal(403);
        });

        it('limits creating and changing to the rows of the scopes, whatever the entity type of the class', async () => {
            const draft = body => ({ body: { policyholder: `p-${run}`, currency: 'EUR', ...body }, traits: { timeline: { validFrom: '2026-01-01', data: terms(1, '2027-01-01') } } });
            expect(await statuses(
                call('POST', '/entities/construction', draft({ project: 'a', region: 'fr' }), users.german),
                call('POST', '/entities/construction', draft({ project: 'a', region: 'de', confidential: true }), users.german),
                call('POST', '/entities/construction', draft({ project: 'a', region: 'de' }), users.german),
                call('POST', '/entities/marine', { ...draft({ vessel: 'ship', region: 'de' }), businessKey: `MAR-${run}-de` }, users.german),
                call('POST', '/entities/marine', { ...draft({ vessel: 'ship', region: 'fr' }), businessKey: `MAR-${run}-fr` }, users.german)
            )).to.deep.equal([403, 403, 201, 201, 403]);
            const french = await read({ entityType: 'construction', businessKey: contracts.french }, users.headOffice);
            expect([
                (await move(french, 'issue', users.german)).status,
                (await move(french, 'issue', users.french)).status
            ]).to.deep.equal([404, 200]);
            const own = await read({ entityType: 'construction', businessKey: contracts.german }, users.german);
            const handed = await call('PUT', `/entities/construction/${contracts.german}`, { body: { ...own.data.body, region: 'fr' } }, users.german, { 'if-match': `"${own.revision}"` });
            expect(handed.status).to.equal(403);
            expect((await read(own, users.headOffice)).data.ownership).to.deep.equal({ region: 'de', confidential: false });
        });

        it('finds only the contracts of the scopes', async function () {
            this.timeout(180000);
            await eventually(async () => (await keysFound(users.headOffice)).includes(contracts.french));
            await eventually(async () => (await keysFound(users.auditor)).includes(contracts.german));
            const found = Object.fromEntries(await Promise.all(Object.entries(users).map(async ([name, token]) => [name, await keysFound(token)])));
            expect(found.german).to.include(contracts.german).and.not.include.members([contracts.confidentialGerman]).and.not.include.members([contracts.french]);
            expect(found.senior).to.include.members([contracts.german, contracts.confidentialGerman]).and.not.include.members([contracts.french]);
            expect(found.auditor).to.include.members([contracts.german, contracts.french]).and.not.include.members([contracts.confidentialGerman]);
            expect(found.headOffice).to.include.members(Object.values(contracts));
        });
    });

    describe('organisation access', () => {
        const memo = (key, department, token) => call('POST', '/entities/memo', { businessKey: key, body: { title: key, department } }, token);

        const visible = async (keys, token) => (await Promise.all(keys.map(key => call('GET', `/entities/memo/${key}`, null, token)))).map(({ status }) => status);

        const keys = ['de', 'fr', 'apac', 'finance'].map(name => `memo-${name}-${run}`);

        let tokens;

        before(async () => {
            const member = (name, department, profile = 'department-access-profile') => userWith(`org-${name}-${run}`, ['employee-role'], { access: [profile], ...department && { department } });
            tokens = {
                secretary: await member('secretary', undefined, 'all-memos-access-profile'),
                emea: await member('emea', 'emea'),
                german: await member('german', 'de'),
                sales: await member('sales', 'sales'),
                finance: await member('finance', 'finance'),
                unassigned: await member('unassigned')
            };
            await Promise.all([['de', 'de'], ['fr', 'fr'], ['apac', 'apac'], ['finance', 'finance']]
                .map(([name, department]) => memo(`memo-${name}-${run}`, department, tokens.secretary)));
        });

        it('stores the owning department alone, and resolves the departments below the member at the time of the request', async () => {
            const { body } = await call('GET', `/entities/memo/${keys[0]}`, null, tokens.secretary);
            expect(body.data.ownership).to.deep.equal({ department: 'de' });
        });

        it('lets a member of a department reach what the department and the departments below it own', async () => {
            expect(await visible(keys, tokens.emea)).to.deep.equal([200, 200, 404, 404]);
            expect(await visible(keys, tokens.german)).to.deep.equal([200, 404, 404, 404]);
            expect(await visible(keys, tokens.sales)).to.deep.equal([200, 200, 200, 404]);
            expect(await visible(keys, tokens.finance)).to.deep.equal([404, 404, 404, 200]);
            expect(await visible(keys, tokens.unassigned)).to.deep.equal([404, 404, 404, 404]);
        });

        it('lets a member write only for the department and the ones below it', async () => {
            expect([
                (await memo(`memo-in-${run}`, 'fr', tokens.emea)).status,
                (await memo(`memo-out-${run}`, 'apac', tokens.emea)).status,
                (await memo(`memo-up-${run}`, 'sales', tokens.emea)).status
            ]).to.deep.equal([201, 403, 403]);
        });
    });
});
