import { expect } from 'chai';
import { boot, invoke, packageElements, start, stop, validate } from '@business-framework/core';
import { skipWithoutPostgres } from '../../../infrastructure/postgresql/test/helpers.js';

const run = Date.now();
const ADMIN = `admin-auth-${run}`;

const elements = [
    { kind: 'app-config', data: { http: { port: 0 }, users: { adminUsername: ADMIN, adminPassword: 'secret', adminEmail: 'admin@test' } } },
    { id: 'whoami-service', kind: 'kind', data: { operations: { whoami: { input: '@any', implementation: { set: { user: '#._ctx.user' } } } } } },
    { id: 'whoami', kind: 'whoami-service', data: {} },
    { id: 'whoami-endpoint', kind: 'http-endpoint', data: { method: 'GET', path: '/whoami', target: { element: 'whoami', operation: 'whoami' }, request: {} } }
];

const packages = ['database', 'postgresql', 'transaction', 'entities', 'entity-states', 'http-server', 'security', 'users', 'authorization-basic'];

const call = async (method, path, { body, headers = {} } = {}) => {
    const { port } = await invoke('http-server', 'address', null);
    const response = await fetch(`http://localhost:${port}${path}`, {
        method,
        headers: { 'content-type': 'application/json', ...headers },
        ...(body && { body: JSON.stringify(body) })
    });
    return { status: response.status, body: await response.json() };
};

const login = password => call('POST', '/login', { body: { username: ADMIN, password } });

describe('authorization-basic', function () {
    before(async function () {
        await skipWithoutPostgres(this);
        await boot({ paths: packages.map(name => packageElements(`@business-framework/${name}`)), elements });
        await start();
    });

    after(stop);

    it('validates', () => {
        expect(validate()).to.deep.equal([]);
    });

    it('logs in and binds the principal for requests with the token', async () => {
        const { status, body: { token } } = await login('secret');
        expect(status).to.equal(200);
        const { body } = await call('GET', '/whoami', { headers: { authorization: `Bearer ${token}` } });
        expect(body.user).to.include({ userId: ADMIN, username: ADMIN, email: 'admin@test' });
        expect(body.user.roles).to.deep.equal(['admin']);
    });

    it('refuses wrong credentials with 401', async () => {
        const wrong = await login('wrong');
        const unknown = await call('POST', '/login', { body: { username: `nobody-${run}`, password: 'x' } });
        expect([wrong.status, unknown.status, wrong.body.error.code]).to.deep.equal([401, 401, 'unauthorized']);
    });

    it('binds no principal without a valid token', async () => {
        const { body: { token } } = await login('secret');
        const tampered = `${token.slice(0, -2)}xx`;
        expect((await call('GET', '/whoami')).body).to.deep.equal({});
        expect((await call('GET', '/whoami', { headers: { authorization: `Bearer ${tampered}` } })).body).to.deep.equal({});
    });
});
