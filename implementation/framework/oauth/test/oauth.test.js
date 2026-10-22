import { expect } from 'chai';
import { boot, invoke, packageElements, start, stop, validate } from '@business-framework/core';
import { skipWithoutPostgres } from '../../../infrastructure/postgresql/test/helpers.js';
import { OAUTH_ISSUER, skipWithoutIdentityProvider, tokenFor } from './helpers.js';

const run = Date.now();
const ADA = `ada-${run}`;

const elements = [
    { kind: 'app-config', data: { http: { port: 0 }, oauth: { issuer: OAUTH_ISSUER, audience: 'bpf' } } },
    { id: 'whoami-service', kind: 'kind', data: { operations: { whoami: { input: '@any', implementation: { set: { user: '#._ctx.user' } } } } } },
    { id: 'whoami', kind: 'whoami-service', data: {} },
    { id: 'whoami-endpoint', kind: 'http-endpoint', data: { method: 'GET', path: '/whoami', target: { element: 'whoami', operation: 'whoami' }, request: {} } }
];

const packages = ['database', 'postgresql', 'transaction', 'entities', 'entity-states', 'messaging', 'messaging-nats', 'transactional-outbox', 'entity-events', 'cache', 'http-server', 'security', 'users', 'oauth'];

const whoami = async token => {
    const { port } = await invoke('http-server', 'address', null);
    const response = await fetch(`http://localhost:${port}/whoami`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
    return (await response.json()).user;
};

const eventually = async (check, timeout = 10000) => {
    const deadline = Date.now() + timeout;
    while (!(await check()) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
    expect(await check()).to.equal(true);
};

describe('oauth', function () {
    before(async function () {
        await skipWithoutPostgres(this);
        await skipWithoutIdentityProvider(this);
        await boot({ paths: packages.map(name => packageElements(`@business-framework/${name}`)), elements });
        await start();
    });

    after(stop);

    it('validates', () => {
        expect(validate()).to.deep.equal([]);
    });

    it('binds the principal of the internal user, created on first sight and cached until it changes', async () => {
        const token = await tokenFor(ADA);
        expect(await whoami(token)).to.deep.equal({ userId: ADA, username: ADA, roles: [] });
        expect((await invoke('user-cache', 'get', { key: ADA })).found).to.equal(true);
        const user = await invoke('user', 'read', { businessKey: ADA });
        await invoke('user', 'update', { businessKey: ADA, revision: user.revision, body: { ...user.data.body, roles: ['clerk'] } });
        await eventually(async () => (await whoami(token)).roles[0] === 'clerk');
        expect((await invoke('user', 'read', { businessKey: ADA })).revision).to.equal(2);
    });

    it('binds no principal without a valid token or for a suspended user', async () => {
        const token = await tokenFor(`bob-${run}`);
        expect(await whoami()).to.equal(undefined);
        expect(await whoami(`${token.slice(0, -2)}xx`)).to.equal(undefined);
        await whoami(token);
        await invoke('entity-states', 'transition', { entityType: 'user', businessKey: `bob-${run}`, revision: 1, transition: 'suspend' });
        await eventually(async () => (await whoami(token)) === undefined);
    });
});
